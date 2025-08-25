import React, { useState, useEffect } from 'react';
import './ThresholdControls.css';

const ThresholdControls = ({ thresholds, onUpdate }) => {
  const [currentThresholds, setCurrentThresholds] = useState(thresholds);

  useEffect(() => {
    setCurrentThresholds(thresholds);
  }, [thresholds]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCurrentThresholds(prev => ({
      ...prev,
      [name]: Number(value)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdate(currentThresholds);
  };

  return (
    <form onSubmit={handleSubmit} className="threshold-controls">
      <div className="threshold-group">
        <label htmlFor="cpu_usage">CPU Usage (%)</label>
        <input type="number" id="cpu_usage" name="cpu_usage" value={currentThresholds.cpu_usage || ''} onChange={handleChange} min="1" max="100" />
      </div>
      <div className="threshold-group">
        <label htmlFor="memory_usage">Memory Usage (%)</label>
        <input type="number" id="memory_usage" name="memory_usage" value={currentThresholds.memory_usage || ''} onChange={handleChange} min="1" max="100" />
      </div>
      <div className="threshold-group">
        <label htmlFor="temperature">Temperature (°C)</label>
        <input type="number" id="temperature" name="temperature" value={currentThresholds.temperature || ''} onChange={handleChange} min="1" max="100" />
      </div>
      <button type="submit" className="update-button">Update</button>
    </form>
  );
};

export default ThresholdControls;