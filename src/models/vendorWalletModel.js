const mongoose = require('mongoose');

const vendorWalletSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: [true, 'Vendor ID is required'],
      unique: true,
      index: true
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, 'Wallet balance cannot be negative']
    },
    lockedBalance: {
      type: Number,
      default: 0,
      min: [0, 'Locked balance cannot be negative']
    },
    totalDeposited: {
      type: Number,
      default: 0,
      min: [0, 'Total deposited cannot be negative']
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
      min: [0, 'Total withdrawn cannot be negative']
    },
    totalCommissionEarned: {
      type: Number,
      default: 0,
      min: [0, 'Total commission earned cannot be negative']
    },
    totalClientTransacted: {
      type: Number,
      default: 0,
      min: [0, 'Total client transacted cannot be negative']
    },
    currency: {
      type: String,
      default: 'INR'
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for available balance
vendorWalletSchema.virtual('availableBalance').get(function () {
  return Math.max(0, (this.balance || 0) - (this.lockedBalance || 0));
});

const VendorWallet = mongoose.model('VendorWallet', vendorWalletSchema);

module.exports = VendorWallet;
