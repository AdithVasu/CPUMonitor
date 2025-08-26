const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const SystemMonitor = require('./monitor');
const apiRoutes = require('./routes');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

const systemMonitor = new SystemMonitor(io);

// Use the API routes
app.use('/api', apiRoutes(systemMonitor));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  systemMonitor.addClient(socket);
  
  socket.on('update_thresholds', (newThresholds) => {
    console.log('Received threshold update from client.');
    systemMonitor.updateThresholds(newThresholds);
  });
  
  socket.on('request_historical_data', async (request) => {
    try {
      const { metric, timeRange } = request;
      const data = await systemMonitor.getHistoricalData(metric, timeRange);
      socket.emit('historical_data', { 
        metric, 
        timeRange, 
        data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error handling historical data request:', error);
      socket.emit('error', { message: 'Failed to fetch historical data', error: error.message });
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    systemMonitor.removeClient(socket);
  });
});

const gracefulShutdown = async () => {
  systemMonitor.stopCollecting();
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    console.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Access at http://localhost:${PORT}`);
  console.log('Node.js Version:', process.version);
  console.log('Platform:', os.platform());
  
  try {
    await systemMonitor.startCollecting(2000);
  } catch (error) {
    console.error('Failed to start system monitoring:', error);
    process.exit(1);
  }
});

module.exports = { app, systemMonitor };
