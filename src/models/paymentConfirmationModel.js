const mongoose = require('mongoose');

const paymentConfirmationSchema = new mongoose.Schema(
  {
    confirmationId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    topUpRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TopUpRequest',
      required: [true, 'Top-up request ID is required'],
      index: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: [true, 'Vendor ID is required'],
      index: true
    },
    amountPaid: {
      type: Number,
      required: [true, 'Amount paid is required'],
      min: [1, 'Amount paid must be greater than 0']
    },
    paymentDestinationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentDestination',
      required: [true, 'Payment destination ID is required']
    },
    paymentMethod: {
      type: String,
      enum: ['bank', 'wallet'],
      required: [true, 'Payment method is required']
    },
    transactionId: {
      type: String,
      required: [true, 'Transaction reference/UTR number is required'],
      trim: true,
      index: true
    },
    transactionDate: {
      type: Date,
      default: Date.now
    },
    paymentProof: {
      type: String,
      required: [true, 'Payment screenshot/proof is required'],
      trim: true
    },
    note: {
      type: String,
      trim: true,
      default: null
    },
    status: {
      type: String,
      enum: {
        values: ['PAYMENT_SUBMITTED', 'APPROVED', 'REJECTED'],
        message: '{VALUE} is not a valid confirmation status'
      },
      default: 'PAYMENT_SUBMITTED',
      index: true
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

paymentConfirmationSchema.index({ vendorId: 1, status: 1 });
paymentConfirmationSchema.index({ transactionId: 1, vendorId: 1 }, { unique: true });

const PaymentConfirmation = mongoose.model('PaymentConfirmation', paymentConfirmationSchema);

module.exports = PaymentConfirmation;
