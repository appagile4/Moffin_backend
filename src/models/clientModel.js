const mongoose = require('mongoose');

/**
 * Client Main Schema
 */
const clientSchema = new mongoose.Schema(
  {
    // 1. Personal & Contact Information
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email address'
      ]
    },
    mobile: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true
    },
    whatsappNumber: {
      type: String,
      trim: true,
      default: null
    },
    alternativeMobileNumber: {
      type: String,
      trim: true,
      default: null
    },
    platformUrl: {
      type: String,
      trim: true,
      default: null
    },
    businessType: {
      type: String,
      trim: true,
      default: null
    },
    telegramIds: {
      type: [String],
      default: []
    },

    // 2. Security Credentials
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false // Excluded from default queries for security
    },

    // 3. System Role & Status Management
    role: {
      type: String,
      enum: ['client'],
      default: 'client',
      immutable: true // Role cannot be changed or selected from frontend
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true
    },
    isVerified: {
      type: Boolean,
      default: true,
      index: true
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, 'Client balance cannot be negative']
    },
    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Indexes for fast lookup and dashboard aggregations
clientSchema.index({ mobile: 1 });
clientSchema.index({ role: 1, status: 1 });
clientSchema.index({ role: 1, isActive: 1, isBlocked: 1 });
clientSchema.index({ createdAt: -1 });

// Helper hook to keep status, isActive, and isBlocked synchronized before save
clientSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    if (this.status === 'active') {
      this.isActive = true;
      this.isBlocked = false;
    } else if (this.status === 'inactive') {
      this.isActive = false;
      this.isBlocked = false;
    } else if (this.status === 'blocked') {
      this.isActive = false;
      this.isBlocked = true;
    }
  } else if (this.isModified('isActive') || this.isModified('isBlocked')) {
    if (this.isBlocked) {
      this.status = 'blocked';
      this.isActive = false;
    } else if (!this.isActive) {
      this.status = 'inactive';
    } else {
      this.status = 'active';
    }
  }
  next();
});

const Client = mongoose.model('Client', clientSchema);

module.exports = Client;
