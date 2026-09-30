const mongoose = require('mongoose');

const paymentDestinationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: ['bank', 'wallet'],
        message: '{VALUE} is not a valid destination type (bank or wallet)'
      },
      required: [true, 'Payment destination type is required']
    },
    name: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true
    },
    // Bank specific fields
    bankName: {
      type: String,
      trim: true
    },
    accountNumber: {
      type: String,
      trim: true
    },
    branchName: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      uppercase: true,
      trim: true
    },
    accountHolderName: {
      type: String,
      trim: true
    },
    // Wallet specific fields
    walletName: {
      type: String,
      trim: true
    },
    walletId: {
      type: String,
      trim: true
    },
    qrCode: {
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
      ref: 'Admin'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

paymentDestinationSchema.pre('validate', function (next) {
  if (!this.type && this.destinationType) {
    this.type = this.destinationType;
  }
  if (!this.name) {
    this.name = this.bankName || this.walletName || (this.type === 'bank' ? 'Company Bank Account' : 'Company UPI Wallet');
  }
  next();
});

paymentDestinationSchema.virtual('destinationType').get(function () {
  return this.type;
});

paymentDestinationSchema.set('toJSON', { virtuals: true });
paymentDestinationSchema.set('toObject', { virtuals: true });

paymentDestinationSchema.index({ type: 1, isActive: 1 });

const PaymentDestination = mongoose.model('PaymentDestination', paymentDestinationSchema);

module.exports = PaymentDestination;
