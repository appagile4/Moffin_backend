const mongoose = require('mongoose');

const vendorWithdrawalSchema = new mongoose.Schema(
  {
    withdrawalId: {
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
    amount: {
      type: Number,
      required: [true, 'Withdrawal amount is required'],
      min: [25000, 'Minimum withdrawal amount is ₹25,000']
    },
    destinationType: {
      type: String,
      enum: {
        values: ['bank', 'wallet'],
        message: 'Destination type must be either bank or wallet'
      },
      required: [true, 'Destination type is required']
    },
    isManualDestination: {
      type: Boolean,
      default: false
    },
    selectedAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    destinationDetails: {
      bankName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifscCode: { type: String, trim: true },
      accountHolderName: { type: String, trim: true },
      branchName: { type: String, trim: true },
      walletName: { type: String, trim: true },
      walletId: { type: String, trim: true },
      qrCode: { type: String, default: null }
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING_ADMIN_PAYMENT', 'PAYMENT_SENT_BY_ADMIN', 'APPROVED', 'REJECTED'],
        message: '{VALUE} is not a valid withdrawal status'
      },
      default: 'PENDING_ADMIN_PAYMENT',
      index: true
    },
    adminPaymentDetails: {
      paidAmount: { type: Number },
      transactionId: { type: String, trim: true },
      paymentProof: { type: String, default: null },
      adminNotes: { type: String, trim: true },
      paidAt: { type: Date },
      paidBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
      }
    },
    vendorConfirmation: {
      isApproved: { type: Boolean, default: null },
      confirmedAt: { type: Date },
      vendorNotes: { type: String, trim: true },
      rejectionReason: { type: String, trim: true }
    },
    financialSettlement: {
      commissionBalanceBefore: { type: Number },
      commissionBalanceAfter: { type: Number },
      totalWithdrawnBefore: { type: Number },
      totalWithdrawnAfter: { type: Number },
      settledAt: { type: Date }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

vendorWithdrawalSchema.index({ vendorId: 1, createdAt: -1 });
vendorWithdrawalSchema.index({ status: 1, createdAt: -1 });

const VendorWithdrawal = mongoose.model('VendorWithdrawal', vendorWithdrawalSchema);

module.exports = VendorWithdrawal;
