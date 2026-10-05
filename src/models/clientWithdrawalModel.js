const mongoose = require('mongoose');

/**
 * Client Withdrawal Request Schema
 * Handles client requests to withdraw funds from their platform balance to a Bank Account or Wallet/UPI.
 */
const clientWithdrawalSchema = new mongoose.Schema(
  {
    withdrawalId: {
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
      requestedAmount: { type: Number },
      adminCommissionPercentage: { type: Number, default: 0 },
      adminCommission: { type: Number, default: 0 },
      totalVendorCommissionDeducted: { type: Number, default: 0 },
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
    clientConfirmation: {
      isApproved: { type: Boolean, default: null },
      confirmedAt: { type: Date },
      clientNotes: { type: String, trim: true },
      rejectionReason: { type: String, trim: true }
    },
    financialSettlement: {
      balanceBefore: { type: Number },
      balanceAfter: { type: Number },
      requestedAmount: { type: Number },
      adminCommissionPercentage: { type: Number, default: 0 },
      adminCommissionDeducted: { type: Number, default: 0 },
      totalVendorCommissionAtTime: { type: Number, default: 0 },
      totalCombinedCommission: { type: Number, default: 0 },
      netAmountReceived: { type: Number },
      settledAt: { type: Date }
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

clientWithdrawalSchema.index({ clientId: 1, createdAt: -1 });
clientWithdrawalSchema.index({ status: 1, createdAt: -1 });

const ClientWithdrawal = mongoose.model('ClientWithdrawal', clientWithdrawalSchema);

module.exports = ClientWithdrawal;
