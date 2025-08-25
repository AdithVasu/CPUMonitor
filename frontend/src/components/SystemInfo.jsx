import React from 'react';
import './SystemInfo.css';

const SystemInfo = ({ info }) => {
  return (
    <div className="system-info-card">
      <div className="info-item">
        <strong>Platform:</strong> <span>{info.platform}</span>
      </div>
      <div className="info-item">
        <strong>Hostname:</strong> <span>{info.hostname}</span>
      </div>
      <div className="info-item">
        <strong>Uptime:</strong> <span>{info.uptime_hours.toFixed(2)} hours</span>
      </div>
    </div>
  );
};

export default SystemInfo;