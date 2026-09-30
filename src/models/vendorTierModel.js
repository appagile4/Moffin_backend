const mongoose = require('mongoose');

const vendorTierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tier name is required'],
      unique: true,
      trim: true
    },
    minAmount: {
      type: Number,
      required: [true, 'Minimum amount is required'],
      default: 0,
      min: 0
    },
    maxAmount: {
      type: Number,
      required: [true, 'Maximum amount is required'],
      default: 1000000
    },
    commissionPercentage: {
      type: Number,
      required: [true, 'Commission percentage is required'],
      min: [0, 'Commission percentage cannot be negative'],
      max: [100, 'Commission percentage cannot exceed 100%'],
      default: 1.0
    },
    priorityRank: {
      type: Number,
      default: 1,
      index: true
    },
    description: {
      type: String,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

vendorTierSchema.index({ minAmount: 1, maxAmount: 1 });

const VendorTier = mongoose.model('VendorTier', vendorTierSchema);

module.exports = VendorTier;
