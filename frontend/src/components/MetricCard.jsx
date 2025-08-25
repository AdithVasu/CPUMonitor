import React from 'react';
import './MetricCard.css';

const MetricCard = ({ title, value, unit, details }) => {
  return (
    <div className="metric-card">
      <h3>{title}</h3>
      <div className="metric-value">
        {value}{unit}
      </div>
      <p className="metric-details">{details}</p>
    </div>
  );
};

export default MetricCard;