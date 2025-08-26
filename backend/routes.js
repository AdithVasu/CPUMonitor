const express = require('express');

module.exports = (systemMonitor) => {
  const router = express.Router();
  
  router.get('/health', (req, res) => {
    res.json({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      ...systemMonitor.getStatus()
    });
  });

  router.get('/thresholds', (req, res) => {
    res.json(systemMonitor.thresholds);
  });

  router.post('/thresholds', (req, res) => {
    try {
      const updated = systemMonitor.updateThresholds(req.body);
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  router.get('/status', (req, res) => {
    res.json(systemMonitor.getStatus());
  });

  router.get('/metrics/current', async (req, res) => {
    try {
      res.json({
        timestamp: new Date().toISOString(),
        message: 'Current metrics are sent via WebSocket. Connect to /socket.io for real-time data.',
        status: systemMonitor.getStatus()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  return router;
};
