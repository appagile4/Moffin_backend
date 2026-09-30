const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    transactionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: [true, 'Vendor ID is required'],
      index: true
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VendorWallet',
      required: [true, 'Wallet ID is required'],
      index: true
    },
    transactionType: {
      type: String,
      enum: {
        values: [
          'CREDIT_TOPUP',
          'DEBIT_CLIENT_TRANSACTION',
          'COMMISSION_CREDIT',
          'WITHDRAWAL',
          'ADJUSTMENT'
        ],
        message: '{VALUE} is not a valid transaction type'
      },
      required: [true, 'Transaction type is required'],
      index: true
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required']
    },
    balanceBefore: {
      type: Number,
      required: [true, 'Balance before is required']
    },
    balanceAfter: {
      type: Number,
      required: [true, 'Balance after is required']
    },
    referenceType: {
      type: String,
      enum: [
        'TopUpRequest',
        'PaymentConfirmation',
        'ClientTransaction',
        'Withdrawal',
        'ManualAdjustment'
      ],
      required: [true, 'Reference type is required']
    },
    referenceId: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Reference ID is required'],
      index: true
    },
    description: {
      type: String,
      trim: true
    },
    createdBy: {
      type: mongoose.Schema.Types.Mixed,
      default: 'system'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

walletTransactionSchema.index({ vendorId: 1, createdAt: -1 });
walletTransactionSchema.index({ referenceType: 1, referenceId: 1 });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

module.exports = WalletTransaction;
