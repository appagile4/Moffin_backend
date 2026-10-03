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
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: [true, 'Client ID is required'],
      index: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null,
      index: true
    },
    requestedAmount: {
      type: Number,
      required: [true, 'Requested amount is required'],
      min: [1, 'Requested amount must be greater than 0']
    },
    allocatedAmount: {
      type: Number,
      default: 0
    },
    paymentMethod: {
      type: String,
      enum: ['bank', 'wallet', 'both'],
      default: 'wallet',
      index: true
    },
    status: {
      type: String,
      enum: [
        'PENDING',
        'ASSIGNED',
        'ALLOCATED',
        'PAYMENT_PENDING',
        'PAYMENT_SUBMITTED',
        'AWAITING_VENDOR_VERIFICATION',
        'VERIFICATION',
        'APPROVED',
        'REJECTED',
        'COMPLETED',
        'FAILED',
        'REFUNDED'
      ],
      default: 'ASSIGNED',
      index: true
    },
    allocationStatus: {
      type: String,
      enum: ['PENDING', 'ASSIGNED', 'ALLOCATED', 'PAYMENT_SUBMITTED', 'AWAITING_VENDOR_VERIFICATION', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED', 'REFUNDED'],
      default: 'ASSIGNED',
      index: true
    },
    paymentDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    // External payment submission info
    externalTransactionId: {
      type: String,
      trim: true,
      default: null,
      index: true
    },
    submittedAmount: {
      type: Number,
      default: 0
    },
    submittedWalletId: {
      type: String,
      trim: true,
      default: null
    },
    submittedBankId: {
      type: String,
      trim: true,
      default: null
    },
    submittedAt: {
      type: Date,
      default: null
    },
    // Vendor Manual Approval / Rejection details
    approvedAmount: {
      type: Number,
      default: 0
    },
    approvedAt: {
      type: Date,
      default: null
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null
    },
    rejectedAt: {
      type: Date,
      default: null
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null
    },
    // Financial settlement snapshot
    financialSettlement: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    vendorBalanceBefore: {
      type: Number,
      default: 0
    },
    vendorBalanceAfter: {
      type: Number,
      default: 0
    },
    tierAtTransaction: {
      type: String,
      default: null
    },
    commissionPercentage: {
      type: Number,
      default: 0
    },
    commissionAmount: {
      type: Number,
      default: 0
    },
    priorityPosition: {
      type: Number,
      default: 0
    },
    clientReference: {
      type: String,
      trim: true,
      default: null
    },
    idempotencyKey: {
      type: String,
      trim: true,
      index: true,
      default: null
    },
    ipAddress: {
      type: String,
      default: null
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
clientTransactionSchema.index({ clientId: 1, idempotencyKey: 1 });

const ClientTransaction = mongoose.model('ClientTransaction', clientTransactionSchema);

module.exports = ClientTransaction;

