import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import Dashboard from './components/Dashboard';
import './App.css';

const socket = io('http://localhost:3001');

const App = () => {
  const [cpuMetrics, setCpuMetrics] = useState({
    cpu_usage: 0,
    memory_usage: 0,
    disk_usage: 0,
    load_average_1m: 0,
    network_rx_bytes: 0,
    network_tx_bytes: 0,
    process_count: 0,
    connection_count: 0,
    uptime_seconds: 0,
    rates: {},
    details: {
      system: {},
      memory: {},
      disk: {},
      network: {},
      disk_io: {},
      cpu_details: {},
      system_load: {},
      processes: {
        top_cpu: []
      },
      network_connections: {},
      battery: null,
      services: null,
    },
  });
  const [alerts, setAlerts] = useState([]);
  const [thresholds, setThresholds] = useState({});
  const [historicalData, setHistoricalData] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let startupTimeout = setTimeout(() => {
      setIsLoading(false);
      console.log('Initial loading timeout reached. Displaying dashboard.');
    }, 15000); // 15 seconds to wait for initial data

    socket.on('connect', () => {
      console.log('Connected to backend');
      socket.emit('start_monitoring');

      const metricsToFetch = ['cpu_usage', 'memory_usage', 'disk_usage', 'system_load', 'disk_io'];
      metricsToFetch.forEach(metric => {
        socket.emit('request_historical_data', { metric, timeRange: '1h' });
      });
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from backend');
    });

    socket.on('cpu_data', (data) => {
      setCpuMetrics(data);
      clearTimeout(startupTimeout);
      setIsLoading(false);
    });

    socket.on('thresholds_updated', (updatedThresholds) => {
      setThresholds(updatedThresholds);
    });

    socket.on('historical_data_response', ({ metric, data }) => {
      // LOG: This will show what data is received from the backend
      console.log(`Received historical data for ${metric}:`, data);
      setHistoricalData(prevData => ({ ...prevData, [metric]: data }));
    });

    socket.on('alert', (newAlert) => {
      console.log('Received alert:', newAlert);
      setAlerts(prevAlerts => [newAlert, ...prevAlerts]);
    });
    
    return () => {
      clearTimeout(startupTimeout);
      socket.off('connect');
      socket.off('disconnect');
      socket.off('cpu_data');
      socket.off('thresholds_updated');
      socket.off('historical_data_response');
      socket.off('alert');
    };
  }, []);

  const updateThresholds = (newThresholds) => {
    socket.emit('update_thresholds', newThresholds);
  };
  
  return (
    <div className="App">
      <header className="App-header">
        <h1>CPU Monitor Dashboard</h1>
      </header>
      <main>
        <Dashboard
          cpuMetrics={cpuMetrics}
          alerts={alerts}
          thresholds={thresholds}
          updateThresholds={updateThresholds}
          historicalData={historicalData}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
};

export default App;