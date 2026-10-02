const mongoose = require('mongoose');

const vendorTierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tier name is required'],
      trim: true
    },
    divisionGroup: {
      type: String,
      required: [true, 'Division group is required (e.g. Bronze, Silver, Gold, Platinum, Diamond, Crown, Ace)'],
      trim: true,
      index: true
    },
    level: {
      type: String,
      trim: true,
      default: null // e.g. "V", "IV", "III", "II", "I" (or null for Ace)
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required (e.g. Gold III, Crown I, Ace)'],
      unique: true,
      trim: true,
      index: true
    },
    minTopUp: {
      type: Number,
      required: [true, 'Minimum monthly top-up is required'],
      default: 0,
      min: [0, 'Minimum top-up cannot be negative']
    },
    maxTopUp: {
      type: Number,
      required: [true, 'Maximum monthly top-up is required'],
      min: [0, 'Maximum top-up cannot be negative']
    },
    commissionRate: {
      type: Number,
      required: [true, 'Commission rate is required'],
      min: [0, 'Commission rate cannot be negative'],
      max: [100, 'Commission rate cannot exceed 100%'],
      default: 1.0
    },
    orderPriority: {
      type: Number,
      required: [true, 'Order priority rank is required for progression sorting'],
      default: 1,
      index: true
    },
    icon: {
      type: String,
      trim: true,
      default: null
    },
    description: {
      type: String,
      trim: true,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Backward compatibility virtuals / getters
vendorTierSchema.virtual('minAmount').get(function () {
  return this.minTopUp;
});
vendorTierSchema.virtual('maxAmount').get(function () {
  return this.maxTopUp;
});
vendorTierSchema.virtual('commissionPercentage').get(function () {
  return this.commissionRate;
});
vendorTierSchema.virtual('priorityRank').get(function () {
  return this.orderPriority;
});

vendorTierSchema.index({ minTopUp: 1, maxTopUp: 1 });

const VendorTier = mongoose.model('VendorTier', vendorTierSchema);

module.exports = VendorTier;
