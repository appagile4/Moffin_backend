const mongoose = require('mongoose');
const FCFSQueue = require('../models/fcfsQueueModel');
const Vendor = require('../models/vendorModel');
const VendorWallet = require('../models/vendorWalletModel');
const ClientTransaction = require('../models/clientTransactionModel');
const WalletTransaction = require('../models/walletTransactionModel');
const { getApplicableTier } = require('./tierService');
const { creditWallet, generateTransactionNumber } = require('./walletService');
const { logAction } = require('./auditService');

/**
 * Generate unique transaction ID
 */
const generateTxId = (prefix = 'CTX') => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
};

/**
 * FCFS Client Transaction Allocation Engine
 * Atomically allocates a transaction to the first eligible vendor with sufficient balance,
 * protects against race conditions/double spending, calculates commission, and updates ledger.
 * 
 * @param {Object} params
 * @returns {Promise<Object>}
 */
const allocateClientTransaction = async ({
  clientId,
  requestedAmount,
  clientReference = null,
  ipAddress = null
}) => {
  const numAmount = Number(requestedAmount);
  if (!numAmount || numAmount <= 0) {
    throw new Error('Requested transaction amount must be greater than 0');
  }

  if (!clientId || !clientId.toString().trim()) {
    throw new Error('Client ID is required');
  }

  // 1. Fetch active queue ordered by priority position
  const queueItems = await FCFSQueue.find({ isActive: true })
    .sort({ priorityPosition: 1 })
    .populate('vendorId');

  if (!queueItems || queueItems.length === 0) {
    throw new Error('No active vendors available in the FCFS allocation queue');
  }

  let allocatedResult = null;
  const skippedVendors = [];

  // 2. Iterate through FCFS Queue
  for (const item of queueItems) {
    const vendor = item.vendorId;

    // STEP 2: Check vendor active & approved status
    if (!vendor || !vendor.isActive || vendor.verificationStatus !== 'approved') {
      skippedVendors.push({ vendorId: vendor?._id, reason: 'Vendor inactive or not approved' });
      continue;
    }

    // STEP 3: Check vendor wallet balance
    const wallet = await VendorWallet.findOne({ vendorId: vendor._id });
    if (!wallet || !wallet.isActive) {
      skippedVendors.push({ vendorId: vendor._id, reason: 'Wallet inactive or missing' });
      continue;
    }

    const availableBalance = (wallet.balance || 0) - (wallet.lockedBalance || 0);

    // STEP 5: If insufficient balance, skip for this transaction only (DO NOT remove from queue!)
    if (availableBalance < numAmount) {
      // Record skip counter without removing vendor from queue
      await FCFSQueue.findByIdAndUpdate(item._id, {
        $inc: { consecutiveSkips: 1 }
      });
      skippedVendors.push({
        vendorId: vendor._id,
        reason: `Insufficient balance (Required: ₹${numAmount}, Available: ₹${availableBalance})`
      });
      continue;
    }

    // STEP 4 & CONCURRENCY PROTECTION: Atomic deduction with conditional balance guard
    const balanceBefore = Number(wallet.balance) || 0;
    const updatedWallet = await VendorWallet.findOneAndUpdate(
      {
        _id: wallet._id,
        balance: { $gte: numAmount } // Prevents concurrent overspend
      },
      {
        $inc: {
          balance: -numAmount,
          totalClientTransacted: numAmount
        }
      },
      { new: true, runValidators: true }
    );

    // If another concurrent request took the balance first, skip to next vendor
    if (!updatedWallet) {
      skippedVendors.push({ vendorId: vendor._id, reason: 'Concurrent lock conflict on balance' });
      continue;
    }

    const balanceAfter = updatedWallet.balance;
    const transactionId = generateTxId('CTX');

    // STEP 6: Calculate commission snapshot
    const tierInfo = await getApplicableTier(numAmount);
    const commissionAmount = Number(((numAmount * tierInfo.commissionPercentage) / 100).toFixed(2));

    // STEP 7: Credit commission to vendor wallet
    let commissionResult = null;
    if (commissionAmount > 0) {
      commissionResult = await creditWallet({
        vendorId: vendor._id,
        amount: commissionAmount,
        transactionType: 'COMMISSION_CREDIT',
        referenceType: 'ClientTransaction',
        referenceId: transactionId,
        description: `Commission (${tierInfo.commissionPercentage}%) for client transaction ${transactionId}`,
        createdBy: 'system'
      });
    }

    // STEP 8: Create Wallet Ledger record for the client debit
    const debitTxNumber = generateTransactionNumber('WTX');
    await WalletTransaction.create({
      transactionNumber: debitTxNumber,
      vendorId: vendor._id,
      walletId: updatedWallet._id,
      transactionType: 'DEBIT_CLIENT_TRANSACTION',
      amount: numAmount,
      balanceBefore,
      balanceAfter,
      referenceType: 'ClientTransaction',
      referenceId: transactionId,
      description: `Client allocation for ${clientId} (TxID: ${transactionId})`,
      createdBy: 'system'
    });

    // STEP 9: Create Client Transaction record with full audit snapshot
    const clientTx = await ClientTransaction.create({
      transactionId,
      clientId: clientId.toString().trim(),
      vendorId: vendor._id,
      requestedAmount: numAmount,
      allocatedAmount: numAmount,
      vendorBalanceBefore: balanceBefore,
      vendorBalanceAfter: balanceAfter,
      tierAtTransaction: tierInfo.tierName,
      commissionPercentage: tierInfo.commissionPercentage,
      commissionAmount,
      priorityPosition: item.priorityPosition,
      allocationStatus: 'ALLOCATED',
      clientReference: clientReference ? clientReference.trim() : null,
      allocationTimestamp: new Date()
    });

    // STEP 10: Update FCFS queue statistics (consecutiveSkips reset to 0)
    await FCFSQueue.findByIdAndUpdate(item._id, {
      lastAllocatedAt: new Date(),
      consecutiveSkips: 0,
      $inc: {
        totalAllocatedTransactions: 1,
        totalAllocatedVolume: numAmount
      }
    });

    // STEP 11: Audit log
    await logAction({
      actor: clientId,
      actorRole: 'system',
      action: 'CLIENT_TRANSACTION_ALLOCATED',
      targetType: 'ClientTransaction',
      targetId: clientTx._id,
      metadata: {
        transactionId,
        vendorId: vendor._id,
        allocatedAmount: numAmount,
        tier: tierInfo.tierName,
        commissionAmount,
        priorityPosition: item.priorityPosition
      },
      ipAddress
    });

    allocatedResult = {
      success: true,
      transaction: clientTx,
      vendor: {
        id: vendor._id,
        name: `${vendor.firstName} ${vendor.lastName}`,
        email: vendor.email,
        mobileNumber: vendor.mobileNumber
      },
      wallet: {
        balanceBefore,
        balanceAfter,
        commissionEarned: commissionAmount,
        finalBalance: commissionResult ? commissionResult.wallet.balance : balanceAfter
      }
    };

    break; // Allocation complete
  }

  if (!allocatedResult) {
    throw new Error(
      `Unable to allocate transaction of ₹${numAmount}. No eligible vendor has sufficient available balance.`
    );
  }

  return allocatedResult;
};

/**
 * Get Client Transactions with pagination and filters
 */
const getClientTransactions = async ({ page = 1, limit = 20, vendorId = null, clientId = null } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const query = {};
  if (vendorId) query.vendorId = vendorId;
  if (clientId) query.clientId = clientId;

  const [transactions, total] = await Promise.all([
    ClientTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('vendorId', 'firstName lastName email mobileNumber'),
    ClientTransaction.countDocuments(query)
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

module.exports = {
  allocateClientTransaction,
  getClientTransactions
};
