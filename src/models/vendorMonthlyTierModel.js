const mongoose = require('mongoose');

const vendorMonthlyTierSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: [true, 'Vendor ID is required'],
      index: true
    },
    year: {
      type: Number,
      required: [true, 'Year is required (e.g. 2026)'],
      min: 2000,
      max: 2100
    },
    month: {
      type: Number,
      required: [true, 'Month is required (1-12)'],
      min: 1,
      max: 12
    },
    monthLabel: {
      type: String,
      trim: true // e.g. "October 2026"
    },
    totalTopUp: {
      type: Number,
      default: 0,
      min: [0, 'Monthly top-up volume cannot be negative']
    },
    currentTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorTier',
      default: null
    },
    currentTierName: {
      type: String,
      default: 'Bronze V'
    },
    currentTierDisplayName: {
      type: String,
      default: 'Bronze V'
    },
    commissionMode: {
      type: String,
      enum: {
        values: ['AUTO', 'MANUAL'],
        message: '{VALUE} is not a valid commission mode'
      },
      default: 'AUTO',
      index: true
    },
    manualCommissionRate: {
      type: Number,
      default: null,
      min: 0,
      max: 100
    },
    manualCommissionReason: {
      type: String,
      trim: true,
      default: null
    },
    manualCommissionAssignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    manualCommissionAssignedAt: {
      type: Date,
      default: null
    },
    effectiveCommissionRate: {
      type: Number,
      required: true,
      default: 1.0,
      min: 0,
      max: 100
    },
    nextTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorTier',
      default: null
    },
    nextTierName: {
      type: String,
      default: null
    },
    amountToNextTier: {
      type: Number,
      default: 0,
      min: 0
    },
    progressPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    isClosed: {
      type: Boolean,
      default: false,
      index: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    },
    closedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Idempotent Compound Unique Index: One record per vendor per calendar month
vendorMonthlyTierSchema.index({ vendorId: 1, year: 1, month: 1 }, { unique: true });
vendorMonthlyTierSchema.index({ year: 1, month: 1, totalTopUp: -1 });
vendorMonthlyTierSchema.index({ year: 1, month: 1, currentTierName: 1 });

const VendorMonthlyTier = mongoose.model('VendorMonthlyTier', vendorMonthlyTierSchema);

module.exports = VendorMonthlyTier;
