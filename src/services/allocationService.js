const mongoose = require('mongoose');
const FCFSQueue = require('../models/fcfsQueueModel');
const Vendor = require('../models/vendorModel');
const VendorWallet = require('../models/vendorWalletModel');
const ClientTransaction = require('../models/clientTransactionModel');
const WalletTransaction = require('../models/walletTransactionModel');
const { getApplicableTier } = require('./tierService');
const { getVendorEffectiveCommission } = require('./tierCalculationService');
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
 * Format Vendor Bank Details safely for Client
 */
const formatClientBankDetails = (bank) => {
  if (!bank) return null;
  return {
    type: 'bank',
    accountHolderName: bank.accountHolderName || '',
    accountNumber: bank.accountNumber || '',
    bankName: bank.bankName || '',
    branchName: bank.branchName || '',
    ifscCode: bank.ifscCode || ''
  };
};

/**
 * Format Vendor Wallet Details safely for Client
 */
const formatClientWalletDetails = (wallet) => {
  if (!wallet) return null;
  return {
    type: 'wallet',
    walletName: wallet.walletName || 'UPI',
    walletId: wallet.walletId || '',
    qrCode: wallet.qrCode || null
  };
};

/**
 * Main Client Payment Request & FCFS Vendor Allocation Service
 * 
 * @param {Object} params
 * @param {string|ObjectId} params.clientId Authenticated Client ID
 * @param {string} params.paymentMethod 'bank' or 'wallet'
 * @param {number} params.amount Requested payment amount
 * @param {string} [params.clientReference] Optional client reference
 * @param {string} [params.idempotencyKey] Optional idempotency key
 * @param {string} [params.ipAddress] Optional IP address
 */
const createClientPaymentRequest = async ({
  clientId,
  paymentMethod = 'wallet',
  amount,
  clientReference = null,
  idempotencyKey = null,
  ipAddress = null
}) => {
  // 1. Validation: Amount
  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0 || !isFinite(numAmount)) {
    throw new Error('Payment amount must be a valid number greater than 0');
  }

  // 2. Validation: Payment Method
  const normalizedMethod = (paymentMethod || '').toString().toLowerCase().trim();
  if (!['bank', 'wallet'].includes(normalizedMethod)) {
    throw new Error('Payment method must be either "bank" or "wallet"');
  }

  if (!clientId || !clientId.toString().trim()) {
    throw new Error('Client authentication is required');
  }

  const cleanClientId = clientId.toString().trim();

  // 3. Idempotency Protection: Check for recent identical request with idempotencyKey
  if (idempotencyKey && idempotencyKey.toString().trim()) {
    const cleanIdempotencyKey = idempotencyKey.toString().trim();
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const existingTx = await ClientTransaction.findOne({
      clientId: cleanClientId,
      idempotencyKey: cleanIdempotencyKey,
      createdAt: { $gte: tenMinutesAgo }
    }).populate('vendorId', 'firstName lastName email mobileNumber');

    if (existingTx) {
      console.log(`[FCFS Allocation] Idempotent request hit for key: ${cleanIdempotencyKey}`);
      return {
        isExisting: true,
        assigned: existingTx.status === 'ASSIGNED' || existingTx.allocationStatus === 'ALLOCATED',
        status: existingTx.status || existingTx.allocationStatus,
        transactionId: existingTx.transactionId,
        amount: existingTx.requestedAmount,
        paymentMethod: existingTx.paymentMethod || normalizedMethod,
        paymentDetails: existingTx.paymentDetails
      };
    }
  }

  console.log(`[FCFS Allocation] Starting allocation for Client ${cleanClientId}: ₹${numAmount} via ${normalizedMethod}`);

  // 4. Fetch Active FCFS Queue in strict Priority Order
  const queueItems = await FCFSQueue.find({ isActive: true })
    .sort({ priorityPosition: 1 })
    .populate('vendorId');

  let allocatedResult = null;
  const skippedVendors = [];

  // 5. Iterate through vendors in FCFS Order
  for (const item of queueItems) {
    const vendor = item.vendorId;

    // Check 1: Vendor active & KYC approved status
    if (!vendor || !vendor.isActive || vendor.verificationStatus !== 'approved') {
      skippedVendors.push({
        vendorId: vendor?._id,
        reason: 'Vendor account inactive or not approved'
      });
      continue;
    }

    // Check 2: Payment Method Matching (vendor must have active bank/wallet matching requested method)
    let selectedPaymentDetails = null;

    if (normalizedMethod === 'wallet') {
      const activeWallets = Array.isArray(vendor.wallets)
        ? vendor.wallets.filter(w => w.isActive !== false)
        : [];
      const activeBanks = Array.isArray(vendor.bankAccounts)
        ? vendor.bankAccounts.filter(b => b.isActive !== false)
        : [];

      if (activeWallets.length > 0) {
        const pickedWallet = activeWallets.find(w => w.isDefault) || activeWallets[0];
        selectedPaymentDetails = formatClientWalletDetails(pickedWallet);
      } else if (activeBanks.length > 0) {
        // Vendor has explicit bank accounts but no wallet accounts -> skip for wallet request
        skippedVendors.push({
          vendorId: vendor._id,
          reason: 'Vendor has bank accounts but no wallet accounts'
        });
        continue;
      } else {
        // Fallback for legacy / mock vendors with no subdocuments
        selectedPaymentDetails = {
          type: 'wallet',
          walletName: 'UPI',
          walletId: vendor.mobileNumber ? `${vendor.mobileNumber}@upi` : 'vendor@upi',
          qrCode: null
        };
      }
    } else if (normalizedMethod === 'bank') {
      const activeBanks = Array.isArray(vendor.bankAccounts)
        ? vendor.bankAccounts.filter(b => b.isActive !== false)
        : [];
      const activeWallets = Array.isArray(vendor.wallets)
        ? vendor.wallets.filter(w => w.isActive !== false)
        : [];

      if (activeBanks.length > 0) {
        const pickedBank = activeBanks.find(b => b.isDefault) || activeBanks[0];
        selectedPaymentDetails = formatClientBankDetails(pickedBank);
      } else if (activeWallets.length > 0) {
        // Vendor has explicit wallet accounts but no bank accounts -> skip for bank request
        skippedVendors.push({
          vendorId: vendor._id,
          reason: 'Vendor has wallet accounts but no bank accounts'
        });
        continue;
      } else {
        // Fallback for legacy / mock vendors
        selectedPaymentDetails = {
          type: 'bank',
          accountHolderName: `${vendor.firstName || ''} ${vendor.lastName || ''}`.trim() || 'Vendor',
          accountNumber: 'N/A',
          bankName: 'Direct Bank Transfer',
          branchName: 'Main',
          ifscCode: 'N/A'
        };
      }
    }

    if (!selectedPaymentDetails) {
      skippedVendors.push({
        vendorId: vendor._id,
        reason: `No eligible ${normalizedMethod} details found`
      });
      continue;
    }

    // Check 3: Vendor Wallet Available Balance
    const wallet = await VendorWallet.findOne({ vendorId: vendor._id });
    if (!wallet || !wallet.isActive) {
      skippedVendors.push({
        vendorId: vendor._id,
        reason: 'Vendor wallet inactive or not found'
      });
      continue;
    }

    const availableBalance = Math.max(0, (wallet.balance || 0) - (wallet.lockedBalance || 0));

    if (availableBalance < numAmount) {
      // Record skip counter without moving vendor from queue
      await FCFSQueue.findByIdAndUpdate(item._id, {
        $inc: { consecutiveSkips: 1 }
      });
      skippedVendors.push({
        vendorId: vendor._id,
        reason: `Insufficient balance (Required: ₹${numAmount}, Available: ₹${availableBalance})`
      });
      continue;
    }

    // Check 4 & Atomic Fund Reservation: Conditional balance update preventing race conditions
    const balanceBefore = Number(wallet.balance) || 0;
    const updatedWallet = await VendorWallet.findOneAndUpdate(
      {
        _id: wallet._id,
        balance: { $gte: numAmount } // Prevents concurrent double spending
      },
      {
        $inc: {
          balance: -numAmount,
          totalClientTransacted: numAmount
        }
      },
      { new: true, runValidators: true }
    );

    // If another concurrent request reserved the balance first, skip to next vendor
    if (!updatedWallet) {
      skippedVendors.push({
        vendorId: vendor._id,
        reason: 'Concurrent balance reservation lock conflict'
      });
      continue;
    }

    const balanceAfter = updatedWallet.balance;
    const transactionId = generateTxId('CTX');

    // Step 6: Calculate commission snapshot based on vendor's monthly tier (Settled on Vendor Approval in Stage 2)
    const tierInfo = await getVendorEffectiveCommission(vendor._id);
    const commissionAmount = Number(((numAmount * tierInfo.commissionPercentage) / 100).toFixed(2));


    // Step 8: Create Wallet Ledger record for the client deduction
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
      description: `Client allocation for ${cleanClientId} (TxID: ${transactionId})`,
      createdBy: 'system'
    });

    // Step 9: Create Client Transaction record
    const clientTx = await ClientTransaction.create({
      transactionId,
      clientId: cleanClientId,
      vendorId: vendor._id,
      requestedAmount: numAmount,
      allocatedAmount: numAmount,
      paymentMethod: normalizedMethod,
      status: 'ASSIGNED',
      allocationStatus: 'ALLOCATED',
      paymentDetails: selectedPaymentDetails,
      vendorBalanceBefore: balanceBefore,
      vendorBalanceAfter: balanceAfter,
      tierAtTransaction: tierInfo.tierName,
      commissionPercentage: tierInfo.commissionPercentage,
      commissionAmount,
      priorityPosition: item.priorityPosition,
      clientReference: clientReference ? clientReference.toString().trim() : null,
      idempotencyKey: idempotencyKey ? idempotencyKey.toString().trim() : null,
      ipAddress,
      allocationTimestamp: new Date()
    });

    // Step 10: Update FCFS Queue statistics (consecutiveSkips reset to 0)
    await FCFSQueue.findByIdAndUpdate(item._id, {
      lastAllocatedAt: new Date(),
      consecutiveSkips: 0,
      $inc: {
        totalAllocatedTransactions: 1,
        totalAllocatedVolume: numAmount
      }
    });

    // Step 11: Audit log
    await logAction({
      actor: cleanClientId,
      actorRole: 'client',
      action: 'CLIENT_PAYMENT_REQUEST_ALLOCATED',
      targetType: 'ClientTransaction',
      targetId: clientTx._id,
      metadata: {
        transactionId,
        vendorId: vendor._id,
        allocatedAmount: numAmount,
        paymentMethod: normalizedMethod,
        tier: tierInfo.tierName,
        commissionAmount,
        priorityPosition: item.priorityPosition
      },
      ipAddress
    });

    console.log(`[FCFS Allocation] Transaction ${transactionId} assigned to Vendor ${vendor._id} (Rank #${item.priorityPosition})`);

    allocatedResult = {
      assigned: true,
      status: 'ASSIGNED',
      transactionId: clientTx.transactionId,
      amount: numAmount,
      paymentMethod: normalizedMethod,
      paymentDetails: selectedPaymentDetails,
      allocatedVendorId: vendor._id,
      createdAt: clientTx.createdAt
    };

    break; // Allocation completed
  }

  // 6. Handle No Eligible Vendor Found
  if (!allocatedResult) {
    console.log(`[FCFS Allocation] No eligible vendor available for ₹${numAmount} (${normalizedMethod}).`);
    return {
      assigned: false,
      status: 'PENDING',
      message: 'No eligible vendor is currently available for this payment request'
    };
  }

  return allocatedResult;
};

/**
 * Backward-compatible allocateClientTransaction method
 */
const allocateClientTransaction = async ({
  clientId,
  requestedAmount,
  paymentMethod = 'wallet',
  clientReference = null,
  idempotencyKey = null,
  ipAddress = null
}) => {
  const result = await createClientPaymentRequest({
    clientId,
    paymentMethod,
    amount: requestedAmount,
    clientReference,
    idempotencyKey,
    ipAddress
  });

  if (!result.assigned && result.status === 'PENDING') {
    throw new Error(
      `Unable to allocate transaction of ₹${requestedAmount}. No eligible vendor has sufficient available balance.`
    );
  }

  // Return structure expected by existing tests
  const clientTx = await ClientTransaction.findOne({ transactionId: result.transactionId }).populate('vendorId');
  const vendor = clientTx?.vendorId;
  const wallet = vendor ? await VendorWallet.findOne({ vendorId: vendor._id }) : null;

  return {
    success: true,
    transaction: clientTx,
    vendor: {
      id: vendor?._id,
      name: vendor ? `${vendor.firstName} ${vendor.lastName}` : 'Unknown',
      email: vendor?.email,
      mobileNumber: vendor?.mobileNumber
    },
    wallet: {
      balanceBefore: clientTx?.vendorBalanceBefore || 0,
      balanceAfter: clientTx?.vendorBalanceAfter || 0,
      commissionEarned: clientTx?.commissionAmount || 0,
      finalBalance: wallet?.balance || 0
    },
    paymentDetails: result.paymentDetails
  };
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
  createClientPaymentRequest,
  allocateClientTransaction,
  getClientTransactions
};
