const mongoose = require('mongoose');

const tierMovementLogSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: [true, 'Vendor ID is required'],
      index: true
    },
    year: {
      type: Number,
      required: [true, 'Year is required']
    },
    month: {
      type: Number,
      required: [true, 'Month is required']
    },
    previousTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorTier',
      default: null
    },
    previousTierName: {
      type: String,
      default: 'None'
    },
    newTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorTier',
      required: [true, 'New tier ID is required']
    },
    newTierName: {
      type: String,
      required: [true, 'New tier name is required']
    },
    topUpAmountAtChange: {
      type: Number,
      default: 0
    },
    totalMonthlyTopUp: {
      type: Number,
      default: 0
    },
    previousCommission: {
      type: Number,
      default: 0
    },
    newCommission: {
      type: Number,
      default: 0
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: {
      type: String,
      trim: true,
      default: 'Top-up volume threshold reached'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

tierMovementLogSchema.index({ vendorId: 1, changedAt: -1 });
tierMovementLogSchema.index({ year: 1, month: 1, changedAt: -1 });

const TierMovementLog = mongoose.model('TierMovementLog', tierMovementLogSchema);

module.exports = TierMovementLog;
