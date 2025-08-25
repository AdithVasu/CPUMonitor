import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import './Dashboard.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const Dashboard = ({ cpuMetrics, alerts, thresholds, updateThresholds, historicalData, isLoading }) => {
  // LOG: This will show what data is passed to the Dashboard component
  console.log('Dashboard cpuMetrics prop:', cpuMetrics);
  console.log('Dashboard historicalData prop:', historicalData);
  
  const [showThresholdsModal, setShowThresholdsModal] = useState(false);
  const [currentThresholds, setCurrentThresholds] = useState(thresholds || {});
  const thresholdsRef = useRef(thresholds || {});
  
  // FIXED: Safe destructuring with defaults - now correctly accessing nested metrics
  const {
    cpu_usage = null,
    memory_usage = null,
    disk_usage = null,
    load_average_1m = null,
    process_count = null,
    connection_count = null,
    uptime_seconds = 0
  } = (cpuMetrics && cpuMetrics.metrics) ? cpuMetrics.metrics : {};

  // Extract other data from the correct locations
  const {
    details = {},
    rates = {}
  } = cpuMetrics || {};

  // Handle additional metrics that might be in details
  const temperatureInfo = details.temperature_info || {};
  const networkLatencyInfo = details.network_latency || {};
  const swapInfo = details.swap_info || {};
  
  // Calculate derived values
  const temperature = temperatureInfo.available ? temperatureInfo.value : null;
  const network_latency = networkLatencyInfo.available ? networkLatencyInfo.ping_ms : null;
  const swap_usage = swapInfo.available ? swapInfo.percentage : null;

  useEffect(() => {
    if (thresholds) {
      thresholdsRef.current = thresholds;
      setCurrentThresholds(thresholds);
    }
  }, [thresholds]);
  
  // Safe value formatter
  const formatValue = (value, decimals = 1) => {
    if (value === null || value === undefined || isNaN(value)) {
      return 'N/A';
    }
    return Number(value).toFixed(decimals);
  };
  
  const formatSingleMetricData = (metricKey, unit, color) => {
    const data = (historicalData && historicalData[metricKey]) ? historicalData[metricKey] : [];
    return {
      labels: data.map(d => new Date(d.timestamp).toLocaleTimeString()),
      datasets: [
        {
          label: `${metricKey.replace('_', ' ').toUpperCase()} (${unit})`,
          data: data.map(d => (d.value !== null && d.value !== undefined ? d.value : NaN)),
          borderColor: color,
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          fill: false,
          tension: 0.1,
        },
      ],
    };
  };

  const formatSystemLoadData = () => {
    const data = (historicalData && historicalData.system_load) ? historicalData.system_load : [];
    if (data.length === 0) return { labels: [], datasets: [] };

    const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
    const load1mValues = data.map(d => d.value);

    return {
      labels: labels,
      datasets: [
        {
          label: 'System Load (1m)',
          data: load1mValues,
          borderColor: 'rgba(153, 102, 255, 1)',
          backgroundColor: 'rgba(153, 102, 255, 0.1)',
          fill: false,
          tension: 0.1,
        },
      ],
    };
  };
  
  const formatDiskIoData = () => {
    const data = (historicalData && historicalData.disk_io) ? historicalData.disk_io : [];
    if (data.length === 0) return { labels: [], datasets: [] };

    const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
    const readValues = data.filter(d => d.field === 'read_ops_ps').map(d => d.value);
    const writeValues = data.filter(d => d.field === 'write_ops_ps').map(d => d.value);

    return {
      labels: labels,
      datasets: [
        {
          label: 'Disk Read Ops/s',
          data: readValues,
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          fill: false,
          tension: 0.1,
        },
        {
          label: 'Disk Write Ops/s',
          data: writeValues,
          borderColor: 'rgba(255, 159, 64, 1)',
          backgroundColor: 'rgba(255, 159, 64, 0.1)',
          fill: false,
          tension: 0.1,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const percentageChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
      },
    },
  };

  const renderMetricCard = (title, value, unit, className) => {
    const formattedValue = formatValue(value);
    const isNA = formattedValue === 'N/A';
    
    return (
      <div className={`metric-card ${className}`}>
        <h3>{title}</h3>
        <p>
          <strong>{formattedValue}</strong>
          {!isNA && <span className="unit">{unit}</span>}
        </p>
      </div>
    );
  };
  
  const formatUptime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0s';
    
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    
    let parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0) parts.push(`${s}s`);
    
    return parts.join(' ') || '0s';
  };

  const handleThresholdChange = (e) => {
    const { name, value } = e.target;
    setCurrentThresholds(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const handleThresholdSubmit = () => {
    updateThresholds(currentThresholds);
    setShowThresholdsModal(false);
  };
  
  if (isLoading) {
    return (
      <div className="dashboard-container">
        <h2>Loading system metrics...</h2>
      </div>
    );
  }

  // Safe access to nested properties
  const systemDetails = details.system || {};
  const cpuDetails = details.cpu_details || {};
  const processDetails = details.processes || {};
  const networkDetails = details.network_connections || {};
  const batteryDetails = details.battery;

  const batteryInfo = batteryDetails ? (
    <div className="card full-width">
      <h3>Battery Status</h3>
      <p>
        Percentage: <strong>{formatValue(batteryDetails.percent, 0)}%</strong> 
        {batteryDetails.charging ? ' (Charging)' : ''}
      </p>
      {batteryDetails.time_remaining && batteryDetails.time_remaining !== 'unlimited' && (
        <p>Time Remaining: <strong>{Math.round(batteryDetails.time_remaining / 60)} minutes</strong></p>
      )}
    </div>
  ) : null;

  // Additional metric cards for new metrics
  const additionalMetrics = (
    <div className="additional-metrics">
      {temperature !== null && renderMetricCard('Temperature', temperature, '°C', 'temperature')}
      {network_latency !== null && renderMetricCard('Network Latency', network_latency, 'ms', 'latency')}
      {swap_usage !== null && renderMetricCard('Swap Usage', swap_usage, '%', 'swap')}

    </div>
  );
  
  return (
    <div className="dashboard-container">
      <div className="grid-container">
        {renderMetricCard('CPU Usage', cpu_usage, '%', 'cpu')}
        {renderMetricCard('Memory Usage', memory_usage, '%', 'memory')}
        <div className={`metric-card disk-io`}>
          <h3>Disk I/O</h3>
          <p>
            Read: <strong>{formatValue(rates.disk_read_rate, 0)} ops/s</strong>
          </p>
          <p>
            Write: <strong>{formatValue(rates.disk_write_rate, 0)} ops/s</strong>
          </p>
        </div>
        {renderMetricCard('Disk Usage', disk_usage, '%', 'disk')}
      </div>

      {/* Additional metrics row */}
      {additionalMetrics}
      
      <div className="data-container">
          <div className="card large-card">
              <h3>CPU Usage Over Time</h3>
              <div className="chart-wrapper">
                  <Line data={formatSingleMetricData('cpu_usage', '%', 'rgba(255, 99, 132, 1)')} options={percentageChartOptions} />
              </div>
          </div>
          <div className="card large-card">
              <h3>Memory Usage Over Time</h3>
              <div className="chart-wrapper">
                  <Line data={formatSingleMetricData('memory_usage', '%', 'rgba(54, 162, 235, 1)')} options={percentageChartOptions} />
              </div>
          </div>
          <div className="card large-card">
              <h3>Disk I/O Operations</h3>
              <div className="chart-wrapper">
                  <Line data={formatDiskIoData()} options={chartOptions} />
              </div>
          </div>
          <div className="card large-card">
              <h3>Disk Usage Over Time</h3>
              <div className="chart-wrapper">
                  <Line data={formatSingleMetricData('disk_usage', '%', 'rgba(255, 193, 7, 1)')} options={percentageChartOptions} />
              </div>
          </div>
      </div>

      <div className="details-container">
        <div className="card">
          <h3>System Information</h3>
          <p>
            Uptime: <strong>{formatValue(systemDetails.uptime_hours, 0)} hours</strong>
          </p>
          <p>
            Platform: <strong>{systemDetails.platform || 'Unknown'}</strong>
          </p>
          <p>
            Architecture: <strong>{systemDetails.arch || 'Unknown'}</strong>
          </p>
          <p>
            Hostname: <strong>{systemDetails.hostname || 'Unknown'}</strong>
          </p>
          <p>
            CPU Cores: <strong>{cpuDetails.cores || 'Unknown'} ({formatValue(cpuDetails.speed_ghz)} GHz)</strong>
          </p>
          <p>
            Total Processes: <strong>{(process_count || 0).toLocaleString()}</strong>
          </p>
          <p>
            Network Connections: <strong>{(connection_count || 0).toLocaleString()}</strong>
          </p>
        </div>
        
        <div className="card">
          <h3>Additional Metrics</h3>
          {temperatureInfo.available ? (
            <p>Temperature: <strong>{formatValue(temperatureInfo.value)}°C</strong> (Method: {temperatureInfo.method})</p>
          ) : (
            <p>Temperature: <strong>Not Available</strong></p>
          )}
          
          {networkLatencyInfo.available ? (
            <p>Network Latency: <strong>{formatValue(networkLatencyInfo.ping_ms)}ms</strong> (to {networkLatencyInfo.host})</p>
          ) : (
            <p>Network Latency: <strong>Not Available</strong></p>
          )}
          
          {swapInfo.available ? (
            <p>Swap Space: <strong>{formatValue(swapInfo.percentage)}%</strong> ({formatValue(swapInfo.used_gb)} GB / {formatValue(swapInfo.total_gb)} GB)</p>
          ) : (
            <p>Swap Space: <strong>Not Configured</strong></p>
          )}
          
          <p>System Load (1m): <strong>{formatValue(load_average_1m)}</strong></p>
        </div>
        
        <div className="card">
          <h3>Performance Rates</h3>
          <p>Network RX Rate: <strong>{formatValue(rates.network_rx_rate)} bytes/s</strong></p>
          <p>Network TX Rate: <strong>{formatValue(rates.network_tx_rate)} bytes/s</strong></p>
          <p>Disk Read Rate: <strong>{formatValue(rates.disk_read_rate)} ops/s</strong></p>
          <p>Disk Write Rate: <strong>{formatValue(rates.disk_write_rate)} ops/s</strong></p>
        </div>
        
        <div className="card">
          <h3>Top 5 CPU Processes</h3>
          <ul>
            {processDetails.top_cpu && processDetails.top_cpu.length > 0 ? (
              processDetails.top_cpu.map((p, index) => (
                <li key={index}>
                  <strong>{p.name || 'Unknown'}</strong>: {formatValue(p.cpu)}% CPU / {formatValue((p.memory || 0) / 1024 / 1024)} GB RAM
                </li>
              ))
            ) : (
              <li>No process data available</li>
            )}
          </ul>
        </div>

        {batteryInfo}
      </div>
      
      <div className="thresholds-btn-container">
        <button onClick={() => setShowThresholdsModal(true)}>Update Thresholds</button>
      </div>

      {showThresholdsModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Update Thresholds</h3>
            <div className="threshold-inputs">
              {Object.entries(thresholdsRef.current || {}).map(([key, value]) => (
                <div key={key} className="input-group">
                  <label htmlFor={key}>{key.replace('_', ' ').toUpperCase()}:</label>
                  <input
                    id={key}
                    type="number"
                    name={key}
                    value={currentThresholds[key] || 0}
                    onChange={handleThresholdChange}
                  />
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={handleThresholdSubmit}>Save</button>
              <button onClick={() => setShowThresholdsModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Dashboard.propTypes = {
  cpuMetrics: PropTypes.object.isRequired,
  alerts: PropTypes.array.isRequired,
  thresholds: PropTypes.object.isRequired,
  updateThresholds: PropTypes.func.isRequired,
  historicalData: PropTypes.object.isRequired,
  isLoading: PropTypes.bool.isRequired,
};

export default Dashboard;