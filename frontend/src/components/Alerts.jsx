import React from 'react';
import './Alerts.css';

const Alerts = ({ alerts }) => {
  return (
    <div className="alerts-list">
      {alerts.length === 0 ? (
        <p className="no-alerts-msg">No recent alerts.</p>
      ) : (
        alerts.map((alertGroup, index) => (
          alertGroup.alerts.map((alert, subIndex) => (
            <div key={`${index}-${subIndex}`} className={`alert-item ${alert.severity}`}>
              <span className="alert-type">{alert.severity.toUpperCase()}</span>
              <p className="alert-message">{alert.message}</p>
              <span className="alert-timestamp">{new Date(alertGroup.timestamp).toLocaleString()}</span>
            </div>
          ))
        ))
      )}
    </div>
  );
};

export default Alerts;