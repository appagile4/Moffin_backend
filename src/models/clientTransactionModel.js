const mongoose = require('mongoose');

const clientTransactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    clientId: {
      type: String,
      required: [true, 'Client ID is required'],
      index: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: [true, 'Allocated Vendor ID is required'],
      index: true
    },
    requestedAmount: {
      type: Number,
      required: [true, 'Requested amount is required'],
      min: [1, 'Requested amount must be greater than 0']
    },
    allocatedAmount: {
      type: Number,
      required: [true, 'Allocated amount is required']
    },
    vendorBalanceBefore: {
      type: Number,
      required: [true, 'Vendor balance before allocation is required']
    },
    vendorBalanceAfter: {
      type: Number,
      required: [true, 'Vendor balance after allocation is required']
    },
    tierAtTransaction: {
      type: String,
      required: [true, 'Tier snapshot is required']
    },
    commissionPercentage: {
      type: Number,
      required: [true, 'Commission percentage snapshot is required']
    },
    commissionAmount: {
      type: Number,
      required: [true, 'Commission amount is required']
    },
    priorityPosition: {
      type: Number,
      required: [true, 'Priority position snapshot is required']
    },
    allocationStatus: {
      type: String,
      enum: ['ALLOCATED', 'COMPLETED', 'FAILED', 'REFUNDED'],
      default: 'ALLOCATED',
      index: true
    },
    clientReference: {
      type: String,
      trim: true
    },
    allocationTimestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

clientTransactionSchema.index({ vendorId: 1, createdAt: -1 });
clientTransactionSchema.index({ clientId: 1, createdAt: -1 });

const ClientTransaction = mongoose.model('ClientTransaction', clientTransactionSchema);

module.exports = ClientTransaction;
