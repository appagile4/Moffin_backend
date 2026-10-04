const mongoose = require('mongoose');
const VendorWallet = require('../models/vendorWalletModel');
const WalletTransaction = require('../models/walletTransactionModel');

/**
 * Generate a unique transaction reference number
 */
const generateTransactionNumber = (prefix = 'WTX') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Get or create vendor wallet
 * @param {ObjectId|string} vendorId
 * @param {ClientSession} session
 */
const getOrCreateVendorWallet = async (vendorId, session = null) => {
  let query = VendorWallet.findOne({ vendorId });
  if (session) query = query.session(session);
  let wallet = await query;

  if (!wallet) {
    const newWallet = new VendorWallet({
      vendorId,
      balance: 0,
      lockedBalance: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
      totalCommissionEarned: 0,
      totalClientTransacted: 0,
      isActive: true
    });
    if (session) {
      wallet = await newWallet.save({ session });
    } else {
      wallet = await newWallet.save();
    }
  }

  return wallet;
};

/**
 * Credit Vendor Wallet and record a Ledger transaction
 * @param {Object} params
 */
const creditWallet = async ({
  vendorId,
  amount,
  transactionType,
  referenceType,
  referenceId,
  description = '',
  createdBy = 'system',
  session = null
}) => {
  const numAmount = Number(amount);
  if (numAmount <= 0) {
    throw new Error('Credit amount must be greater than 0');
  }

  // 1. Ensure wallet exists
  const wallet = await getOrCreateVendorWallet(vendorId, session);

  const balanceBefore = Number(wallet.balance) || 0;
  const balanceAfter = balanceBefore + numAmount;

  // 2. Determine stats increment
  const incUpdate = { balance: numAmount };
  if (transactionType === 'CREDIT_TOPUP') {
    incUpdate.totalDeposited = numAmount;
  } else if (transactionType === 'COMMISSION_CREDIT') {
    incUpdate.totalCommissionEarned = numAmount;
  }

  // 3. Atomically update wallet balance
  let updateQuery = VendorWallet.findOneAndUpdate(
    { _id: wallet._id },
    { $inc: incUpdate },
    { new: true, runValidators: true }
  );
  if (session) updateQuery = updateQuery.session(session);
  const updatedWallet = await updateQuery;

  if (!updatedWallet) {
    throw new Error('Failed to update vendor wallet');
  }

  // 4. Create Wallet Ledger Transaction record
  const transactionNumber = generateTransactionNumber('WTX');
  const txDoc = new WalletTransaction({
    transactionNumber,
    vendorId,
    walletId: updatedWallet._id,
    transactionType,
    amount: numAmount,
    balanceBefore,
    balanceAfter: updatedWallet.balance,
    referenceType,
    referenceId,
    description,
    createdBy
  });

  if (session) {
    await txDoc.save({ session });
  } else {
    await txDoc.save();
  }

  // 5. Automatically recalculate monthly tier if this credit was a top-up
  if (transactionType === 'CREDIT_TOPUP') {
    try {
      const { recalculateVendorMonthlyTier } = require('./tierCalculationService');
      await recalculateVendorMonthlyTier(vendorId, {
        topUpAmount: numAmount,
        reason: description || 'Wallet credited with top-up',
        session
      });
    } catch (tierErr) {
      console.error('Tier recalculation error in creditWallet:', tierErr.message);
    }
  }

  return {
    wallet: updatedWallet,
    transaction: txDoc
  };
};

/**
 * Debit Vendor Wallet (Double-spending protected with atomic condition)
 * @param {Object} params
 */
const debitWallet = async ({
  vendorId,
  amount,
  transactionType,
  referenceType,
  referenceId,
  description = '',
  createdBy = 'system',
  session = null
}) => {
  const numAmount = Number(amount);
  if (numAmount <= 0) {
    throw new Error('Debit amount must be greater than 0');
  }

  // 1. Get current wallet
  const wallet = await getOrCreateVendorWallet(vendorId, session);
  const availableBalance = (wallet.balance || 0) - (wallet.lockedBalance || 0);

  if (availableBalance < numAmount) {
    throw new Error(`Insufficient available balance. Required: ₹${numAmount}, Available: ₹${availableBalance}`);
  }

  const balanceBefore = Number(wallet.balance) || 0;

  // 2. Determine stats update
  const incUpdate = { balance: -numAmount };
  if (transactionType === 'DEBIT_CLIENT_TRANSACTION') {
    incUpdate.totalClientTransacted = numAmount;
  } else if (transactionType === 'WITHDRAWAL') {
    incUpdate.totalWithdrawn = numAmount;
  }

  // 3. Atomically deduct with condition balance >= numAmount
  let updateQuery = VendorWallet.findOneAndUpdate(
    {
      _id: wallet._id,
      balance: { $gte: numAmount }
    },
    { $inc: incUpdate },
    { new: true, runValidators: true }
  );
  if (session) updateQuery = updateQuery.session(session);
  const updatedWallet = await updateQuery;

  if (!updatedWallet) {
    throw new Error('Concurrency conflict or insufficient balance during deduction');
  }

  // 4. Create Ledger Record
  const transactionNumber = generateTransactionNumber('WTX');
  const txDoc = new WalletTransaction({
    transactionNumber,
    vendorId,
    walletId: updatedWallet._id,
    transactionType,
    amount: numAmount,
    balanceBefore,
    balanceAfter: updatedWallet.balance,
    referenceType,
    referenceId,
    description,
    createdBy
  });

  if (session) {
    await txDoc.save({ session });
  } else {
    await txDoc.save();
  }

  return {
    wallet: updatedWallet,
    transaction: txDoc
  };
};

/**
 * Get Vendor Wallet Balance and overview
 */
const getWalletBalance = async (vendorId) => {
  const wallet = await getOrCreateVendorWallet(vendorId);
  return {
    walletId: wallet._id,
    vendorId: wallet.vendorId,
    balance: wallet.balance,
    lockedBalance: wallet.lockedBalance,
    availableBalance: Math.max(0, wallet.balance - wallet.lockedBalance),
    totalDeposited: wallet.totalDeposited,
    totalWithdrawn: wallet.totalWithdrawn,
    totalCommissionEarned: wallet.totalCommissionEarned,
    totalClientTransacted: wallet.totalClientTransacted,
    currency: wallet.currency,
    isActive: wallet.isActive
  };
};

/**
 * Get Vendor Wallet Transactions with pagination
 */
const getWalletTransactions = async (vendorId, { page = 1, limit = 20, transactionType = null } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const query = { vendorId };
  if (transactionType) {
    query.transactionType = transactionType;
  }

  const [transactions, total] = await Promise.all([
    WalletTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(numLimit),
    WalletTransaction.countDocuments(query)
  ]);

  return {
    transactions,
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit)
    }
  };
};

/**
 * Get Vendor Overview Stats filtered by timeframe
 */
const getVendorOverviewStats = async (vendorId, timeframe = 'month') => {
  const now = new Date();
  let startDate = null;

  if (timeframe === 'today') {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
  } else if (timeframe === 'week') {
    startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
  } else if (timeframe === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (timeframe === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  }

  const matchQuery = { vendorId: new mongoose.Types.ObjectId(vendorId.toString()) };
  if (startDate) {
    matchQuery.createdAt = { $gte: startDate };
  }

  const pipeline = [
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalTopUp: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'CREDIT_TOPUP'] }, '$amount', 0]
          }
        },
        totalDeposit: {
          $sum: {
            $cond: [{ $in: ['$transactionType', ['CREDIT_TOPUP', 'COMMISSION_CREDIT', 'ADJUSTMENT']] }, '$amount', 0]
          }
        },
        totalWithdraw: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'WITHDRAWAL'] }, '$amount', 0]
          }
        },
        totalCommission: {
          $sum: {
            $cond: [{ $eq: ['$transactionType', 'COMMISSION_CREDIT'] }, '$amount', 0]
          }
        }
      }
    }
  ];

  const [result, wallet] = await Promise.all([
    WalletTransaction.aggregate(pipeline),
    getOrCreateVendorWallet(vendorId)
  ]);

  const stats = (result && result[0]) || {
    totalTopUp: 0,
    totalDeposit: 0,
    totalWithdraw: 0,
    totalCommission: 0
  };

  // Cross-check ClientTransaction commission if any
  let clientTxCommission = 0;
  try {
    const ClientTransaction = require('../models/clientTransactionModel');
    const clientMatch = {
      vendorId: new mongoose.Types.ObjectId(vendorId.toString()),
      status: { $in: ['APPROVED', 'COMPLETED'] }
    };
    if (startDate) {
      clientMatch.$or = [
        { approvedAt: { $gte: startDate } },
        { createdAt: { $gte: startDate } }
      ];
    }
    const clientTxResult = await ClientTransaction.aggregate([
      { $match: clientMatch },
      { $group: { _id: null, totalCommission: { $sum: '$commissionAmount' } } }
    ]);
    if (clientTxResult && clientTxResult.length > 0 && clientTxResult[0].totalCommission) {
      clientTxCommission = Number(clientTxResult[0].totalCommission) || 0;
    }
  } catch (err) {
    console.error('Error aggregating ClientTransaction commission:', err.message);
  }

  const resolvedCommission = Math.max(
    Number(stats.totalCommission) || 0,
    clientTxCommission,
    timeframe === 'all' ? (Number(wallet.totalCommissionEarned) || Number(wallet.commissionBalance) || 0) : 0
  );

  return {
    totalTopUp: (Number(stats.totalTopUp) || 0) || (timeframe === 'all' ? (wallet.totalDeposited || 0) : 0),
    totalDeposit: (Number(stats.totalDeposit) || 0) || (timeframe === 'all' ? (wallet.totalDeposited || 0) : 0),
    totalWithdraw: (Number(stats.totalWithdraw) || 0) || (timeframe === 'all' ? (wallet.totalWithdrawn || 0) : 0),
    totalCommission: resolvedCommission,
    commissionBalance: Number(wallet.commissionBalance) || 0,
    totalCommissionEarned: Number(wallet.totalCommissionEarned) || 0,
    walletBalance: Number(wallet.balance) || 0,
    availableBalance: Math.max(0, (Number(wallet.balance) || 0) - (Number(wallet.lockedBalance) || 0)),
    timeframe
  };
};

module.exports = {
  getOrCreateVendorWallet,
  creditWallet,
  debitWallet,
  getWalletBalance,
  getWalletTransactions,
  getVendorOverviewStats,
  generateTransactionNumber
};
