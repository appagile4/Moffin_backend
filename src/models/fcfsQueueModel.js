const mongoose = require('mongoose');

const fcfsQueueSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: [true, 'Vendor ID is required'],
      unique: true,
      index: true
    },
    priorityPosition: {
      type: Number,
      required: true,
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    lastAllocatedAt: {
      type: Date,
      default: null
    },
    consecutiveSkips: {
      type: Number,
      default: 0
    },
    totalAllocatedTransactions: {
      type: Number,
      default: 0
    },
    totalAllocatedVolume: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

fcfsQueueSchema.index({ priorityPosition: 1, isActive: 1 });

const FCFSQueue = mongoose.model('FCFSQueue', fcfsQueueSchema);

module.exports = FCFSQueue;
