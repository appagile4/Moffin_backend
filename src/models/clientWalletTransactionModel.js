const mongoose = require('mongoose');

const clientWalletTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
      index: true
    },
    clientTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClientTransaction',
      default: null,
      index: true
    },
    transactionId: {
      type: String,
      default: null,
      index: true
    },
    type: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true,
      index: true
    },
    transactionType: {
      type: String,
      enum: [
        'PAYMENT_RECEIVED',
        'PAYMENT_DEBIT',
        'REFUND',
        'MANUAL_ADJUSTMENT'
      ],
      required: true,
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Transaction amount cannot be negative']
    },
    balanceBefore: {
      type: Number,
      required: true
    },
    balanceAfter: {
      type: Number,
      required: true
    },
    currency: {
      type: String,
      default: 'INR'
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'PENDING', 'FAILED', 'REVERSED'],
      default: 'COMPLETED',
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

clientWalletTransactionSchema.index({ clientId: 1, createdAt: -1 });

const ClientWalletTransaction = mongoose.model('ClientWalletTransaction', clientWalletTransactionSchema);

module.exports = ClientWalletTransaction;
