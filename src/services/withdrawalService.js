const mongoose = require('mongoose');
const VendorWithdrawal = require('../models/vendorWithdrawalModel');
const Vendor = require('../models/vendorModel');
const VendorWallet = require('../models/vendorWalletModel');
const WalletTransaction = require('../models/walletTransactionModel');
const { getOrCreateVendorWallet, generateTransactionNumber } = require('./walletService');
const { logAction } = require('./auditService');

/**
 * Generate unique withdrawal reference ID
 */
const generateWithdrawalId = (prefix = 'WTH') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * 1. Vendor creates a commission withdrawal request (Min ₹25,000)
 */
const createWithdrawalRequest = async ({
  vendorId,
  amount,
  destinationType,
  destinationDetails = {},
  selectedAccountId = null,
  isManualDestination = false,
  notes = '',
  ipAddress = null
}) => {
  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount < 25000) {
    throw new Error('Minimum withdrawal amount is ₹25,000');
  }

  const normalizedType = (destinationType || '').toString().toLowerCase().trim();
  if (!['bank', 'wallet'].includes(normalizedType)) {
    throw new Error('Destination type must be either "bank" or "wallet"');
  }

  // Check vendor account and wallet balance
  const [vendor, wallet] = await Promise.all([
    Vendor.findById(vendorId),
    getOrCreateVendorWallet(vendorId)
  ]);

  if (!vendor || !vendor.isActive) {
    throw new Error('Vendor account is inactive or not found');
  }

  const availableCommission = Number(wallet.commissionBalance) || 0;
  if (availableCommission < numAmount) {
    throw new Error(`Insufficient commission balance. Available: ₹${availableCommission.toLocaleString('en-IN')}, Requested: ₹${numAmount.toLocaleString('en-IN')}`);
  }

  // Resolve destination details
  let resolvedDestination = {};

  if (!isManualDestination && selectedAccountId) {
    if (normalizedType === 'bank') {
      const bank = vendor.bankAccounts?.id(selectedAccountId);
      if (!bank || bank.isActive === false) {
        throw new Error('Selected bank account not found or inactive');
      }
      resolvedDestination = {
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        ifscCode: bank.ifscCode,
        accountHolderName: bank.accountHolderName,
        branchName: bank.branchName
      };
    } else if (normalizedType === 'wallet') {
      const w = vendor.wallets?.id(selectedAccountId);
      if (!w || w.isActive === false) {
        throw new Error('Selected wallet not found or inactive');
      }
      resolvedDestination = {
        walletName: w.walletName,
        walletId: w.walletId,
        qrCode: w.qrCode || null
      };
    }
  } else {
    // Manual / custom destination details
    if (normalizedType === 'bank') {
      const { bankName, accountNumber, ifscCode, accountHolderName, branchName } = destinationDetails;
      if (!bankName || !accountNumber || !ifscCode || !accountHolderName) {
        throw new Error('Bank name, account number, IFSC code, and account holder name are required');
      }
      resolvedDestination = {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        accountHolderName: accountHolderName.trim(),
        branchName: (branchName || '').trim()
      };
    } else if (normalizedType === 'wallet') {
      const { walletName, walletId, qrCode } = destinationDetails;
      if (!walletName || !walletId) {
        throw new Error('Wallet/UPI name and Wallet ID (VPA) are required');
      }
      resolvedDestination = {
        walletName: walletName.trim(),
        walletId: walletId.trim(),
        qrCode: qrCode || null
      };
    }
  }

  const withdrawalId = generateWithdrawalId('WTH');

  const withdrawal = await VendorWithdrawal.create({
    withdrawalId,
    vendorId,
    amount: numAmount,
    destinationType: normalizedType,
    isManualDestination: Boolean(isManualDestination),
    selectedAccountId: selectedAccountId ? new mongoose.Types.ObjectId(selectedAccountId.toString()) : null,
    destinationDetails: resolvedDestination,
    notes: (notes || '').trim(),
    status: 'PENDING_ADMIN_PAYMENT'
  });

  await logAction({
    actor: vendorId,
    actorRole: 'vendor',
    action: 'VENDOR_COMMISSION_WITHDRAWAL_REQUESTED',
    targetType: 'VendorWithdrawal',
    targetId: withdrawal._id,
    metadata: {
      withdrawalId,
      amount: numAmount,
      destinationType: normalizedType,
      availableCommission
    },
    ipAddress
  });

  console.log(`[Withdrawal] Request ${withdrawalId} created by Vendor ${vendorId} for ₹${numAmount} (${normalizedType})`);

  return {
    success: true,
    message: 'Commission withdrawal request submitted successfully. Awaiting Admin payment.',
    withdrawal
  };
};

/**
 * 2. Get Vendor Withdrawal Requests
 */
const getVendorWithdrawals = async (vendorId, { page = 1, limit = 20, status = null } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const query = { vendorId };
  if (status && status !== 'all') {
    query.status = status;
  }

  const [withdrawals, total, wallet] = await Promise.all([
    VendorWithdrawal.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('adminPaymentDetails.paidBy', 'name email'),
    VendorWithdrawal.countDocuments(query),
    getOrCreateVendorWallet(vendorId)
  ]);

  return {
    withdrawals,
    summary: {
      commissionBalance: Number(wallet.commissionBalance) || 0,
      totalCommissionEarned: Number(wallet.totalCommissionEarned) || 0,
      totalWithdrawn: Number(wallet.totalWithdrawn) || 0,
      minWithdrawalLimit: 25000
    },
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit)
    }
  };
};

/**
 * 3. Get Specific Withdrawal Details
 */
const getVendorWithdrawalById = async (withdrawalId, vendorId = null) => {
  const query = {
    $or: [
      mongoose.Types.ObjectId.isValid(withdrawalId) ? { _id: withdrawalId } : null,
      { withdrawalId }
    ].filter(Boolean)
  };
  if (vendorId) query.vendorId = vendorId;

  const doc = await VendorWithdrawal.findOne(query)
    .populate('vendorId', 'firstName lastName email mobileNumber')
    .populate('adminPaymentDetails.paidBy', 'name email');

  if (!doc) {
    throw new Error('Withdrawal request not found or access unauthorized');
  }

  return doc;
};

/**
 * 4. Admin: Get all vendor withdrawals with filters & pagination
 */
const adminGetWithdrawals = async ({ page = 1, limit = 20, status = null, search = '' } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const query = {};
  if (status && status !== 'all') {
    query.status = status;
  }

  if (search && search.trim()) {
    const searchRegex = new RegExp(search.trim(), 'i');
    query.$or = [
      { withdrawalId: searchRegex },
      { 'adminPaymentDetails.transactionId': searchRegex },
      { 'destinationDetails.bankName': searchRegex },
      { 'destinationDetails.accountNumber': searchRegex },
      { 'destinationDetails.walletId': searchRegex }
    ];
  }

  const [withdrawals, total, statsAggregation] = await Promise.all([
    VendorWithdrawal.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('vendorId', 'firstName lastName email mobileNumber')
      .populate('adminPaymentDetails.paidBy', 'name email'),
    VendorWithdrawal.countDocuments(query),
    VendorWithdrawal.aggregate([
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          pendingAdminPaymentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'PENDING_ADMIN_PAYMENT'] }, 1, 0] }
          },
          paymentSentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'PAYMENT_SENT_BY_ADMIN'] }, 1, 0] }
          },
          approvedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, 1, 0] }
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] }
          },
          approvedVolume: {
            $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, '$amount', 0] }
          },
          pendingVolume: {
            $sum: { $cond: [{ $eq: ['$status', 'PENDING_ADMIN_PAYMENT'] }, '$amount', 0] }
          }
        }
      }
    ])
  ]);

  const stats = (statsAggregation && statsAggregation[0]) || {
    totalCount: 0,
    pendingAdminPaymentCount: 0,
    paymentSentCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    approvedVolume: 0,
    pendingVolume: 0
  };

  return {
    withdrawals,
    stats,
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit)
    }
  };
};

/**
 * 5. Admin: Submits Payment Proof & Transaction ID (UTR)
 */
const adminSendWithdrawalPayment = async ({
  withdrawalId,
  adminId,
  transactionId,
  paymentProof = null,
  adminNotes = '',
  ipAddress = null
}) => {
  if (!transactionId || !transactionId.toString().trim()) {
    throw new Error('Bank Reference / UTR Transaction ID is required');
  }

  const query = {
    $or: [
      mongoose.Types.ObjectId.isValid(withdrawalId) ? { _id: withdrawalId } : null,
      { withdrawalId }
    ].filter(Boolean)
  };

  const withdrawal = await VendorWithdrawal.findOne(query).populate('vendorId', 'firstName lastName email mobileNumber');
  if (!withdrawal) {
    throw new Error('Withdrawal request not found');
  }

  if (withdrawal.status === 'APPROVED') {
    throw new Error('This withdrawal has already been approved and settled');
  }

  if (withdrawal.status === 'REJECTED') {
    throw new Error('This withdrawal was rejected and cannot be paid');
  }

  withdrawal.adminPaymentDetails = {
    paidAmount: withdrawal.amount,
    transactionId: transactionId.toString().trim(),
    paymentProof: paymentProof || withdrawal.adminPaymentDetails?.paymentProof || null,
    adminNotes: (adminNotes || '').trim(),
    paidAt: new Date(),
    paidBy: adminId
  };
  withdrawal.status = 'PAYMENT_SENT_BY_ADMIN';

  await withdrawal.save();

  await logAction({
    actor: adminId,
    actorRole: 'super_admin',
    action: 'ADMIN_WITHDRAWAL_PAYMENT_SENT',
    targetType: 'VendorWithdrawal',
    targetId: withdrawal._id,
    metadata: {
      withdrawalId: withdrawal.withdrawalId,
      vendorId: withdrawal.vendorId?._id || withdrawal.vendorId,
      amount: withdrawal.amount,
      transactionId: withdrawal.adminPaymentDetails.transactionId
    },
    ipAddress
  });

  console.log(`[Withdrawal] Payment proof sent for ${withdrawal.withdrawalId} by Admin. Awaiting Vendor confirmation.`);

  return {
    success: true,
    message: 'Payment proof and UTR submitted. Sent to vendor for verification & confirmation.',
    withdrawal
  };
};

/**
 * 6. Vendor: Verifies and Approves Received Withdrawal (Deducts commissionBalance, increments totalWithdrawn, writes ledger)
 */
const vendorApproveWithdrawal = async (withdrawalId, vendorId, ipAddress = null) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const query = {
      $or: [
        mongoose.Types.ObjectId.isValid(withdrawalId) ? { _id: withdrawalId } : null,
        { withdrawalId }
      ].filter(Boolean),
      vendorId
    };

    const withdrawal = await VendorWithdrawal.findOne(query).session(session);
    if (!withdrawal) {
      throw new Error('Withdrawal request not found or unauthorized');
    }

    if (withdrawal.status === 'APPROVED') {
      throw new Error('This withdrawal has already been approved and settled');
    }

    if (withdrawal.status === 'REJECTED') {
      throw new Error('This withdrawal was rejected and cannot be approved');
    }

    if (withdrawal.status !== 'PAYMENT_SENT_BY_ADMIN') {
      throw new Error(`Cannot approve withdrawal with status "${withdrawal.status}". Admin must send payment first.`);
    }

    const amount = Number(withdrawal.amount);

    // Atomically fetch and deduct Vendor Wallet commission balance
    const wallet = await VendorWallet.findOne({ vendorId }).session(session);
    if (!wallet) {
      throw new Error('Vendor wallet record not found');
    }

    const commissionBalanceBefore = Number(wallet.commissionBalance) || 0;
    if (commissionBalanceBefore < amount) {
      throw new Error(`Insufficient commission balance during settlement. Required: ₹${amount}, Available: ₹${commissionBalanceBefore}`);
    }

    const totalWithdrawnBefore = Number(wallet.totalWithdrawn) || 0;

    // Deduct commission and increment totalWithdrawn
    wallet.commissionBalance = commissionBalanceBefore - amount;
    wallet.totalWithdrawn = totalWithdrawnBefore + amount;
    await wallet.save({ session });

    // Create Immutable Ledger Transaction record
    const ledgerTxNumber = generateTransactionNumber('WTX');
    await WalletTransaction.create(
      [
        {
          transactionNumber: ledgerTxNumber,
          vendorId,
          walletId: wallet._id,
          transactionType: 'WITHDRAWAL',
          amount,
          balanceBefore: commissionBalanceBefore,
          balanceAfter: wallet.commissionBalance,
          referenceType: 'Withdrawal',
          referenceId: withdrawal.withdrawalId,
          description: `Commission withdrawal payout received & confirmed (UTR: ${withdrawal.adminPaymentDetails?.transactionId || withdrawal.withdrawalId})`,
          createdBy: 'vendor'
        }
      ],
      { session }
    );

    // Update Withdrawal Document
    withdrawal.status = 'APPROVED';
    withdrawal.vendorConfirmation = {
      confirmedAt: new Date(),
      rejectionReason: null
    };
    withdrawal.financialSettlement = {
      commissionBalanceBefore,
      commissionBalanceAfter: wallet.commissionBalance,
      totalWithdrawnBefore,
      totalWithdrawnAfter: wallet.totalWithdrawn,
      settledAt: new Date()
    };
    await withdrawal.save({ session });

    // Audit log
    await logAction({
      actor: vendorId,
      actorRole: 'vendor',
      action: 'VENDOR_WITHDRAWAL_APPROVED_AND_SETTLED',
      targetType: 'VendorWithdrawal',
      targetId: withdrawal._id,
      metadata: {
        withdrawalId: withdrawal.withdrawalId,
        amount,
        commissionBalanceAfter: wallet.commissionBalance,
        totalWithdrawnAfter: wallet.totalWithdrawn,
        utr: withdrawal.adminPaymentDetails?.transactionId
      },
      ipAddress,
      session
    });

    await session.commitTransaction();
    session.endSession();

    console.log(`[Withdrawal] ${withdrawal.withdrawalId} confirmed and settled by Vendor ${vendorId}. Commission deducted: ₹${amount}, New Comm Balance: ₹${wallet.commissionBalance}, Total Withdrawn: ₹${wallet.totalWithdrawn}`);

    return {
      success: true,
      message: 'Withdrawal confirmed successfully! Commission deducted and total withdrawn updated.',
      data: {
        withdrawal,
        withdrawalId: withdrawal.withdrawalId,
        status: withdrawal.status,
        amount,
        commissionBalance: wallet.commissionBalance,
        totalWithdrawn: wallet.totalWithdrawn,
        settledAt: withdrawal.financialSettlement.settledAt
      }
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('vendorApproveWithdrawal Error:', error.message);
    throw error;
  }
};

/**
 * 7. Vendor: Rejects Withdrawal Payment (e.g. Funds not received in account)
 */
const vendorRejectWithdrawal = async (withdrawalId, vendorId, rejectionReason = null, ipAddress = null) => {
  const query = {
    $or: [
      mongoose.Types.ObjectId.isValid(withdrawalId) ? { _id: withdrawalId } : null,
      { withdrawalId }
    ].filter(Boolean),
    vendorId
  };

  const withdrawal = await VendorWithdrawal.findOne(query);
  if (!withdrawal) {
    throw new Error('Withdrawal request not found or unauthorized');
  }

  if (withdrawal.status === 'APPROVED') {
    throw new Error('This withdrawal has already been approved and settled; it cannot be rejected');
  }

  if (withdrawal.status === 'REJECTED') {
    throw new Error('This withdrawal has already been marked as rejected');
  }

  const reason = (rejectionReason || '').toString().trim() || 'Payment not received in specified destination account';

  withdrawal.status = 'REJECTED';
  withdrawal.vendorConfirmation = {
    isApproved: false,
    confirmedAt: new Date(),
    rejectionReason: reason
  };

  await withdrawal.save();

  await logAction({
    actor: vendorId,
    actorRole: 'vendor',
    action: 'VENDOR_WITHDRAWAL_REJECTED',
    targetType: 'VendorWithdrawal',
    targetId: withdrawal._id,
    metadata: {
      withdrawalId: withdrawal.withdrawalId,
      amount: withdrawal.amount,
      rejectionReason: reason
    },
    ipAddress
  });

  console.log(`[Withdrawal] ${withdrawal.withdrawalId} rejected by Vendor ${vendorId}. Reason: ${reason}`);

  return {
    success: true,
    message: 'Withdrawal marked as rejected. No commission balance was deducted.',
    withdrawal
  };
};

module.exports = {
  createWithdrawalRequest,
  getVendorWithdrawals,
  getVendorWithdrawalById,
  adminGetWithdrawals,
  adminSendWithdrawalPayment,
  vendorApproveWithdrawal,
  vendorRejectWithdrawal
};
