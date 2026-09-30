const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/moffin_db');
    console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    
    // Seed default SuperAdmin if none exists
    const { seedSuperAdmin } = require('../controllers/adminAuthController');
    await seedSuperAdmin();

    // Seed default Vendor Tiers if none exist
    const { seedDefaultTiers } = require('../services/tierService');
    await seedDefaultTiers();
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.warn(`⚠️  Ensure MongoDB is running locally (or provide a valid MONGO_URI in .env). Server is still running...`);
  }
};

// Event listeners for connection lifecycle
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected.');
});

mongoose.connection.on('reconnected', () => {
  console.log('✅ MongoDB reconnected.');
});

module.exports = connectDB;
