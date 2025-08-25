// backend/monitor.js
const si = require('systeminformation');
const os = require('os');
const Influx = require('./influx');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

class SystemMonitor {
  constructor(io) {
    this.io = io;
    this.isCollecting = false;
    this.collectionInterval = null;
    this.thresholds = this.loadThresholds();
    this.connectedClients = new Set();
    this.lastAlerts = {};
    this.lastCollection = null;
    this.previousNetworkStats = null;
    this.previousDiskIoStats = null;
    this.influx = new Influx();
  }
  
  loadThresholds() {
    const thresholdsPath = path.join(__dirname, 'thresholds.json');
    try {
      if (fs.existsSync(thresholdsPath)) {
        const data = fs.readFileSync(thresholdsPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading thresholds:', error);
    }
    return {
      cpu_usage: 80,
      memory_usage: 85,
      disk_usage: 80,
      network_error_rate: 5,
      load_average: 4.0
    };
  }

  updateThresholds(newThresholds) {
    const validThresholds = {};
    Object.entries(newThresholds).forEach(([key, value]) => {
      if (typeof value === 'number' && value >= 0) {
        if (key === 'load_average' || (value <= 100)) {
          validThresholds[key] = value;
        }
      }
    });

    this.thresholds = { ...this.thresholds, ...validThresholds };
    try {
      fs.writeFileSync(path.join(__dirname, 'thresholds.json'), JSON.stringify(this.thresholds, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save thresholds to file:', e);
    }
    this.io.emit('thresholds_updated', this.thresholds);
    console.log('Thresholds updated:', this.thresholds);
    return this.thresholds;
  }
  
  addClient(socket) {
    this.connectedClients.add(socket.id);
    socket.emit('server_status', this.getStatus());
    socket.emit('thresholds_updated', this.thresholds);
  }

  removeClient(socket) {
    this.connectedClients.delete(socket.id);
  }

  async startCollecting(intervalMs = 2000) {
    if (this.isCollecting) {
      return;
    }
    this.isCollecting = true;
    await this.collectAndStore();
    this.collectionInterval = setInterval(async () => {
      await this.collectAndStore();
    }, intervalMs);
  }

  stopCollecting() {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    this.isCollecting = false;
  }

  async collectAndStore() {
    try {
      const timestamp = new Date();
      this.lastCollection = timestamp.toISOString();
      
      const [
        cpuData, 
        memData, 
        fsData, 
        netData, 
        diskIoData, 
        procData, 
        netConnData, 
        osInfo,
        batteryData,
        servicesData
      ] = await Promise.allSettled([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.disksIO(),
        si.processes(),
        si.networkConnections(),
        si.osInfo(),
        si.battery().catch(() => null),
        si.services('*').catch(() => [])
      ]);

      const cpu = cpuData.status === 'fulfilled' ? cpuData.value : { currentLoad: 0, load_average: [0, 0, 0], currentload_user: 0, currentload_system: 0, currentload_idle: 0 };
      const memory = memData.status === 'fulfilled' ? memData.value : { total: 1, used: 0 };
      const filesystems = fsData.status === 'fulfilled' ? fsData.value : [];
      const network = netData.status === 'fulfilled' ? netData.value : [];
      const diskIo = diskIoData.status === 'fulfilled' ? diskIoData.value : { rIO_sec: 0, wIO_sec: 0 };
      const processes = procData.status === 'fulfilled' ? procData.value : { all: 0, list: [] };
      const connections = netConnData.status === 'fulfilled' ? netConnData.value : [];
      const systemInfo = osInfo.status === 'fulfilled' ? osInfo.value : { platform: 'unknown' };
      const battery = batteryData.status === 'fulfilled' ? batteryData.value : null;
      const services = servicesData.status === 'fulfilled' ? servicesData.value : [];

      const rootDisk = filesystems.find(fs => fs.mount === '/' || fs.mount === 'C:') || filesystems[0] || {};
      const diskUsage = rootDisk ? Math.round(((rootDisk.used || 0) / (rootDisk.size || 1)) * 100) : 0;
      
      const primaryInterface = network.find(iface => iface.iface && !iface.iface.includes('lo')) || network[0] || {};
      
      const metrics = {
        cpu_usage: Math.round((cpu.currentLoad || 0) * 100) / 100,
        memory_usage: Math.round(((memory.used || 0) / (memory.total || 1)) * 10000) / 100,
        disk_usage: diskUsage,
        load_average_1m: cpu.load_average?.[0] || 0,
        network_rx_bytes: primaryInterface.rx_bytes || 0,
        network_tx_bytes: primaryInterface.tx_bytes || 0,
        process_count: processes.all || 0,
        connection_count: connections.length || 0,
        uptime_seconds: os.uptime() || 0
      };

      let networkRxRate = 0;
      let networkTxRate = 0;
      let diskReadRate = 0;
      let diskWriteRate = 0;

      if (this.previousNetworkStats && primaryInterface.rx_bytes !== undefined) {
        const timeDiff = (timestamp.getTime() - this.previousNetworkStats.timestamp) / 1000;
        networkRxRate = Math.max(0, ((primaryInterface.rx_bytes || 0) - (this.previousNetworkStats.rx_bytes || 0)) / timeDiff);
        networkTxRate = Math.max(0, ((primaryInterface.tx_bytes || 0) - (this.previousNetworkStats.tx_bytes || 0)) / timeDiff);
      }

      if (this.previousDiskIoStats) {
        const timeDiff = (timestamp.getTime() - this.previousDiskIoStats.timestamp) / 1000;
        diskReadRate = (diskIo.rIO_sec || 0);
        diskWriteRate = (diskIo.wIO_sec || 0);
      }

      this.previousNetworkStats = {
        rx_bytes: primaryInterface.rx_bytes || 0,
        tx_bytes: primaryInterface.tx_bytes || 0,
        timestamp: timestamp.getTime()
      };

      this.previousDiskIoStats = {
        read_ops: diskIo.rIO || 0,
        write_ops: diskIo.wIO || 0,
        timestamp: timestamp.getTime()
      };

      const detailedData = {
        timestamp: timestamp.toISOString(),
        metrics: { ...metrics },
        rates: {
          network_rx_rate: Math.round(networkRxRate),
          network_tx_rate: Math.round(networkTxRate),
          disk_read_rate: Math.round(diskReadRate),
          disk_write_rate: Math.round(diskWriteRate)
        },
        details: {
          memory: {
            total_gb: Math.round((memory.total || 0) / (1024 * 1024 * 1024) * 100) / 100,
            used_gb: Math.round((memory.used || 0) / (1024 * 1024 * 1024) * 100) / 100,
            free_gb: Math.round(((memory.total || 0) - (memory.used || 0)) / (1024 * 1024 * 1024) * 100) / 100,
            available_gb: Math.round((memory.available || memory.free || 0) / (1024 * 1024 * 1024) * 100) / 100
          },
          disk: {
            usage_percent: diskUsage,
            total_gb: rootDisk.size ? Math.round(rootDisk.size / (1024 * 1024 * 1024) * 100) / 100 : 0,
            used_gb: rootDisk.used ? Math.round(rootDisk.used / (1024 * 1024 * 1024) * 100) / 100 : 0,
            available_gb: (rootDisk.size && rootDisk.used) ? Math.round((rootDisk.size - rootDisk.used) / (1024 * 1024 * 1024) * 100) / 100 : 0,
            mount: rootDisk.mount || 'unknown'
          },
          network: {
            interface: primaryInterface.iface || 'unknown',
            rx_bytes: primaryInterface.rx_bytes || 0,
            tx_bytes: primaryInterface.tx_bytes || 0,
            rx_errors: primaryInterface.rx_errors || 0,
            tx_errors: primaryInterface.tx_errors || 0,
            rx_dropped: primaryInterface.rx_dropped || 0,
            tx_dropped: primaryInterface.tx_dropped || 0
          },
          disk_io: {
            read_ops_ps: diskIo.rIO_sec || 0,
            write_ops_ps: diskIo.wIO_sec || 0,
            read_bytes_ps: (diskIo.rIO_sec || 0) * 4096,
            write_bytes_ps: (diskIo.wIO_sec || 0) * 4096
          },
          cpu_details: {
            cores: cpu.cpus ? cpu.cpus.length : os.cpus().length,
            speed_ghz: cpu.cpus && cpu.cpus[0] ? Math.round(cpu.cpus[0].speed / 1000 * 100) / 100 : 0,
            user_percent: cpu.currentload_user || 0,
            system_percent: cpu.currentload_system || 0,
            idle_percent: cpu.currentload_idle || 0,
            iowait_percent: cpu.iowait || 0
          },
          system_load: {
            '1min': cpu.load_average?.[0] || 0,
            '5min': cpu.load_average?.[1] || 0,
            '15min': cpu.load_average?.[2] || 0
          },
          processes: {
            count: processes.all || 0,
            running: processes.list ? processes.list.filter(p => p.state === 'running').length : 0,
            sleeping: processes.list ? processes.list.filter(p => p.state === 'sleeping').length : 0,
            top_cpu: processes.list ? 
              processes.list
                .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
                .slice(0, 5)
                .map(p => ({ name: p.name, cpu: p.cpu || 0, memory: p.mem || 0 })) : []
          },
          network_connections: {
            count: connections.length || 0,
            tcp_established: connections.filter(c => c.state === 'ESTABLISHED').length,
            tcp_listening: connections.filter(c => c.state === 'LISTEN').length
          },
          system: {
            platform: systemInfo.platform || os.platform(),
            hostname: systemInfo.hostname || os.hostname(),
            uptime_hours: Math.round(os.uptime() / 3600 * 100) / 100,
            arch: systemInfo.arch || os.arch(),
            kernel: systemInfo.kernel || 'unknown',
            distro: systemInfo.distro || 'unknown'
          },
          battery: battery ? {
            percent: battery.percent || 0,
            charging: battery.isCharging || false,
            time_remaining: battery.timeRemaining || 0
          } : null,
          services: {
            total: services.length,
            running: services.filter(s => s.running).length,
            stopped: services.filter(s => !s.running).length
          }
        }
      };

      await this.influx.writeMetrics(detailedData);

      this.io.emit('cpu_data', detailedData);
      
      await this.checkThresholds(metrics, timestamp);
      
      console.log(`Current Metrics: CPU ${metrics.cpu_usage}% | Mem ${metrics.memory_usage}% | Disk ${metrics.disk_usage}% | Clients: ${this.connectedClients.size}`);
      
    } catch (error) {
      console.error('Error collecting system data:', error);
      this.io.emit('collection_error', {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      });
    }
  }

  async checkThresholds(metrics, timestamp) {
    const alerts = [];
    const now = Date.now();
    const thresholdChecks = [
      { key: 'cpu_usage', value: metrics.cpu_usage, unit: '%' },
      { key: 'memory_usage', value: metrics.memory_usage, unit: '%' },
      { key: 'disk_usage', value: metrics.disk_usage, unit: '%' },
      { key: 'load_average', value: metrics.load_average_1m, unit: '' }
    ];

    thresholdChecks.forEach(({ key, value, unit }) => {
      const threshold = this.thresholds[key];
      if (threshold && value !== null && value > threshold) {
        const lastAlert = this.lastAlerts[key];
        if (!lastAlert || (now - lastAlert) > 5 * 60 * 1000) {
          const alert = {
            type: key,
            value: value,
            threshold: threshold,
            severity: value > threshold * 1.2 ? 'critical' : 'warning',
            message: `${key.replace('_', ' ').toUpperCase()} is ${value.toFixed(2)}${unit} (threshold: ${threshold}${unit})`
          };
          alerts.push(alert);
          this.lastAlerts[key] = now;
        }
      }
    });

    if (alerts.length > 0) {
      console.log('Alerts triggered:');
      alerts.forEach(alert => {
        console.log(`- ${alert.severity.toUpperCase()}: ${alert.message}`);
        this.sendDiscordAlert(alert);
      });
    }
  }

  async sendDiscordAlert(alert) {
    if (!DISCORD_WEBHOOK_URL) {
      console.warn('Discord webhook URL not found. Skipping alert.');
      return;
    }

    try {
      const colorMap = {
        warning: 16776960,
        critical: 16711680,
      };

      const embed = {
        title: `${alert.severity.toUpperCase()} Alert: ${alert.type.replace('_', ' ').toUpperCase()}`,
        description: alert.message,
        color: colorMap[alert.severity] || 3447003,
        fields: [
          {
            name: "Current Value",
            value: `${alert.value.toFixed(2)}${alert.unit}`,
            inline: true
          },
          {
            name: "Threshold",
            value: `${alert.threshold}${alert.unit}`,
            inline: true
          }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: `Hostname: ${os.hostname()}`
        }
      };

      await axios.post(DISCORD_WEBHOOK_URL, {
        embeds: [embed]
      });

      console.log(`Successfully sent ${alert.severity} alert to Discord for ${alert.type}`);
    } catch (error) {
      console.error('Failed to send Discord alert:', error.response ? error.response.data : error.message);
    }
  }
  
  async getHistoricalData(metric, timeRange = '1h') {
    return this.influx.getHistoricalData(metric, timeRange);
  }

  getStatus() {
    return {
      collecting: this.isCollecting,
      connectedClients: this.connectedClients.size,
      thresholds: this.thresholds,
      uptime: process.uptime(),
      lastCollection: this.lastCollection,
      systemInfo: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 100) / 100 + 'GB',
        cpuCount: os.cpus().length
      }
    };
  }
}

module.exports = SystemMonitor;