require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Frontend UI
app.use(express.static(path.join(__dirname, '../Client')));

// Serve Vendor UI at root and /vendor
app.get(['/', '/vendor'], (req, res) => {
  res.sendFile(path.join(__dirname, '../Client/index.html'));
});

// Sample API test route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    dbState: ['disconnected', 'connected', 'connecting', 'disconnecting'][require('mongoose').connection.readyState] || 'unknown'
  });
});

// Route Imports
const vendorRoutes = require('./routes/vendorRoutes');
const adminRoutes = require('./routes/adminRoutes');
const clientRoutes = require('./routes/clientRoutes');

// Mount API Routes
app.use('/api/vendors', vendorRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/fcfs', clientRoutes);

// Admin Portal Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../Client/admin.html'));
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  console.log(`📡 URL: http://localhost:${PORT}`);
});
