// backend/influx.js
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const os = require('os');
require('dotenv').config();

class Influx {
  constructor() {
    this.token = process.env.INFLUX_TOKEN;
    this.org = process.env.INFLUX_ORG;
    this.bucket = process.env.INFLUX_BUCKET;
    this.url = process.env.INFLUX_URL;

    if (!this.url || !this.token || !this.org || !this.bucket) {
      console.error('InfluxDB credentials not found. Please check your .env file.');
      this.client = null;
      return;
    }

    this.client = new InfluxDB({ url: this.url, token: this.token });
    this.hostname = os.hostname();
  }

  writeMetrics(detailedData) {
    if (!this.client) {
      return;
    }

    const { metrics, rates, details, timestamp } = detailedData;
    const writeApi = this.client.getWriteApi(this.org, this.bucket, 'ns');
    const points = [
      new Point('cpu')
        .tag('host', this.hostname)
        .floatField('usage_percent', metrics.cpu_usage)
        .floatField('load_average', metrics.load_average_1m)
        .floatField('user_percent', details.cpu_details.user_percent || 0)
        .floatField('system_percent', details.cpu_details.system_percent || 0)
        .floatField('idle_percent', details.cpu_details.idle_percent || 0)
        .timestamp(new Date(timestamp)),
      new Point('memory')
        .tag('host', this.hostname)
        .floatField('usage_percent', metrics.memory_usage)
        .floatField('total_gb', details.memory.total_gb)
        .floatField('used_gb', details.memory.used_gb)
        .timestamp(new Date(timestamp)),
      new Point('disk')
        .tag('host', this.hostname)
        .floatField('usage_percent', metrics.disk_usage)
        .floatField('total_gb', details.disk.total_gb)
        .floatField('used_gb', details.disk.used_gb)
        .timestamp(new Date(timestamp)),
      new Point('network')
        .tag('host', this.hostname)
        .floatField('rx_bytes', details.network.rx_bytes)
        .floatField('tx_bytes', details.network.tx_bytes)
        .floatField('rx_rate', rates.network_rx_rate)
        .floatField('tx_rate', rates.network_tx_rate)
        .timestamp(new Date(timestamp)),
      new Point('system')
        .tag('host', this.hostname)
        .intField('process_count', metrics.process_count)
        .intField('connection_count', metrics.connection_count)
        .floatField('uptime_seconds', metrics.uptime_seconds)
        .timestamp(new Date(timestamp)),
      new Point('disk_io')
        .tag('host', this.hostname)
        .floatField('read_ops_ps', rates.disk_read_rate)
        .floatField('write_ops_ps', rates.disk_write_rate)
        .timestamp(new Date(timestamp))
    ];

    writeApi.writePoints(points);
    writeApi
      .close()
      .then(() => {
        // console.log('Metrics written to InfluxDB');
      })
      .catch((e) => {
        console.error('Error writing to InfluxDB', e);
      });
  }

  async getHistoricalData(metric, timeRange = '1h') {
    if (!this.client) {
      return [];
    }

    const queryApi = this.client.getQueryApi(this.org);

    let fluxQuery = '';
    const metricMapping = {
      cpu_usage: { measurement: 'cpu', field: 'usage_percent' },
      memory_usage: { measurement: 'memory', field: 'usage_percent' },
      disk_usage: { measurement: 'disk', field: 'usage_percent' },
      system_load: { measurement: 'cpu', field: 'load_average' },
      disk_io: { measurement: 'disk_io', fields: ['read_ops_ps', 'write_ops_ps'] }
    };

    const mapping = metricMapping[metric];

    if (!mapping) {
      console.error(`Unknown historical metric requested: ${metric}`);
      return [];
    }
    
    fluxQuery = `from(bucket: "${this.bucket}")
      |> range(start: -${timeRange})
      |> filter(fn: (r) => r["_measurement"] == "${mapping.measurement}")
      |> filter(fn: (r) => r["host"] == "${this.hostname}")`;

    if (mapping.fields) {
      const fieldFilters = mapping.fields.map(field => `r["_field"] == "${field}"`).join(' or ');
      fluxQuery += `|> filter(fn: (r) => ${fieldFilters})`;
    } else {
      fluxQuery += `|> filter(fn: (r) => r["_field"] == "${mapping.field}")`;
    }
    
    fluxQuery += `
      |> group(columns: ["_field", "_time"])
      |> yield(name: "mean")`;


    return new Promise((resolve, reject) => {
      let data = [];
      queryApi.queryRows(fluxQuery, {
        next(row, tableMeta) {
          const o = tableMeta.toObject(row);
          if (mapping.fields) {
            data.push({
              timestamp: o._time,
              field: o._field,
              value: o._value
            });
          } else {
            data.push({
              timestamp: o._time,
              value: o._value
            });
          }
        },
        error(error) {
          console.error('Error querying historical data:', error);
          resolve([]); // FIX: Resolve with an empty array instead of rejecting
        },
        complete() {
          resolve(data);
        },
      });
    });
  }
}

module.exports = Influx;