const mongoose = require('mongoose');

const topUpRequestSchema = new mongoose.Schema(
  {
    topUpId: {
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
    requestedAmount: {
      type: Number,
      required: [true, 'Requested amount is required'],
      min: [1, 'Requested amount must be greater than 0']
    },
    preferredPaymentMethod: {
      type: String,
      enum: {
        values: ['bank', 'wallet', 'both'],
        message: '{VALUE} is not a valid payment method (bank, wallet, or both)'
      },
      required: [true, 'Preferred payment method is required']
    },
    selectedBankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    selectedWalletId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    vendorBankDetails: {
      bankName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
      branchName: { type: String, trim: true },
      accountHolderName: { type: String, trim: true }
    },
    vendorWalletDetails: {
      walletName: { type: String, trim: true },
      walletId: { type: String, trim: true },
      qrCode: { type: String, trim: true }
    },
    notes: {
      type: String,
      trim: true,
      default: null
    },
    status: {
      type: String,
      enum: {
        values: [
          'PENDING_ADMIN_RESPONSE',
          'AWAITING_PAYMENT',
          'PAYMENT_SUBMITTED',
          'COMPLETED',
          'REJECTED',
          'CANCELLED'
        ],
        message: '{VALUE} is not a valid top-up status'
      },
      default: 'PENDING_ADMIN_RESPONSE',
      index: true
    },
    adminResponse: {
      selectedDestinations: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'PaymentDestination'
        }
      ],
      approvedAmount: {
        type: Number
      },
      adminMessage: {
        type: String,
        trim: true
      },
      respondedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
      },
      respondedAt: {
        type: Date
      }
    },
    paymentConfirmationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentConfirmation'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

topUpRequestSchema.index({ vendorId: 1, status: 1 });
topUpRequestSchema.index({ createdAt: -1 });

const TopUpRequest = mongoose.model('TopUpRequest', topUpRequestSchema);

module.exports = TopUpRequest;
