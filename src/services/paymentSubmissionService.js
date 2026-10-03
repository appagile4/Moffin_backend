const mongoose = require('mongoose');
const Client = require('../models/clientModel');
const Vendor = require('../models/vendorModel');
const VendorWallet = require('../models/vendorWalletModel');
const ClientTransaction = require('../models/clientTransactionModel');
const ClientWalletTransaction = require('../models/clientWalletTransactionModel');
const WalletTransaction = require('../models/walletTransactionModel');
const { getVendorEffectiveCommission } = require('./tierCalculationService');
const { generateTransactionNumber } = require('./walletService');
const { logAction } = require('./auditService');

/**
 * 1. Client Submits Payment Information for Assigned Request
 */
const submitClientPayment = async ({
  clientId,
  paymentRequestId,
  amount,
  paymentMethod,
  transactionId,
  walletId = null,
  bankId = null,
  ipAddress = null
}) => {
  if (!paymentRequestId) {
    throw new Error('paymentRequestId is required');
  }

  if (!transactionId || !transactionId.toString().trim()) {
    throw new Error('External Transaction ID (UTR / Reference number) is required');
  }

  const numAmount = Number(amount);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Payment amount must be a valid number greater than 0');
  }

  // Find assigned payment transaction
  const query = {
    $or: [
      mongoose.Types.ObjectId.isValid(paymentRequestId) ? { _id: paymentRequestId } : null,
      { transactionId: paymentRequestId }
    ].filter(Boolean),
    clientId: clientId.toString()
  };

  const tx = await ClientTransaction.findOne(query).populate('vendorId');
  if (!tx) {
    throw new Error('Payment request not found or unauthorized');
  }

  // Prevent submission on already settled or rejected requests
  if (tx.status === 'APPROVED' || tx.status === 'COMPLETED') {
    throw new Error('This payment request has already been approved and settled');
  }

  if (tx.status === 'REJECTED') {
    throw new Error('This payment request was rejected and cannot be submitted');
  }

  // Validate amount does not exceed original assigned amount
  const maxAllowed = tx.allocatedAmount > 0 ? tx.allocatedAmount : tx.requestedAmount;
  if (numAmount > maxAllowed) {
    throw new Error(`Submitted amount (₹${numAmount}) cannot exceed the allocated amount (₹${maxAllowed})`);
  }

  // Validate payment method matches assigned method
  const normalizedMethod = (paymentMethod || tx.paymentMethod || '').toString().toLowerCase().trim();
  if (tx.paymentMethod && normalizedMethod !== tx.paymentMethod.toLowerCase()) {
    throw new Error(`Payment method "${normalizedMethod}" does not match assigned method "${tx.paymentMethod}"`);
  }

  const vendor = tx.vendorId;

  // Validate Wallet ID if payment method is wallet
  if (normalizedMethod === 'wallet') {
    if (!walletId || !walletId.toString().trim()) {
      throw new Error('walletId is required for wallet payment submissions');
    }

    const cleanWalletId = walletId.toString().trim();
    const assignedWalletId = tx.paymentDetails?.walletId || '';

    // Check if submitted walletId matches assigned walletId or any active wallet of the assigned vendor
    const matchesAssigned = assignedWalletId && assignedWalletId.toLowerCase() === cleanWalletId.toLowerCase();
    const matchesVendorWallets = vendor?.wallets?.some(
      (w) => w.isActive !== false && w.walletId.toLowerCase() === cleanWalletId.toLowerCase()
    );

    if (!matchesAssigned && !matchesVendorWallets) {
      throw new Error('Submitted walletId does not match the assigned vendor wallet');
    }
  }

  // Validate Bank ID if payment method is bank
  if (normalizedMethod === 'bank') {
    if (!bankId || !bankId.toString().trim()) {
      throw new Error('bankId or bank account number is required for bank payment submissions');
    }

    const cleanBankId = bankId.toString().trim();
    const assignedAccountNo = tx.paymentDetails?.accountNumber || '';
    const assignedBankId = tx.paymentDetails?.bankId || '';

    const matchesAssigned =
      (assignedAccountNo && assignedAccountNo === cleanBankId) ||
      (assignedBankId && assignedBankId.toString() === cleanBankId);

    const matchesVendorBanks = vendor?.bankAccounts?.some(
      (b) =>
        b.isActive !== false &&
        (b.accountNumber === cleanBankId || b._id.toString() === cleanBankId)
    );

    if (!matchesAssigned && !matchesVendorBanks) {
      throw new Error('Submitted bankId does not match the assigned vendor bank account');
    }
  }

  // Check duplicate external transaction ID across approved submissions
  const existingExternalTx = await ClientTransaction.findOne({
    externalTransactionId: transactionId.toString().trim(),
    _id: { $ne: tx._id },
    status: { $in: ['APPROVED', 'COMPLETED', 'AWAITING_VENDOR_VERIFICATION'] }
  });

  if (existingExternalTx) {
    throw new Error('This external transaction reference (UTR/TxID) has already been submitted and must be unique');
  }

  // Update transaction status to AWAITING_VENDOR_VERIFICATION
  tx.externalTransactionId = transactionId.toString().trim();
  tx.submittedAmount = numAmount;
  tx.submittedWalletId = walletId ? walletId.toString().trim() : null;
  tx.submittedBankId = bankId ? bankId.toString().trim() : null;
  tx.submittedAt = new Date();
  tx.status = 'AWAITING_VENDOR_VERIFICATION';
  tx.allocationStatus = 'PAYMENT_SUBMITTED';

  await tx.save();

  await logAction({
    actor: clientId,
    actorRole: 'client',
    action: 'CLIENT_PAYMENT_DETAILS_SUBMITTED',
    targetType: 'ClientTransaction',
    targetId: tx._id,
    metadata: {
      transactionId: tx.transactionId,
      externalTransactionId: tx.externalTransactionId,
      submittedAmount: numAmount,
      paymentMethod: normalizedMethod,
      vendorId: tx.vendorId?._id || tx.vendorId
    },
    ipAddress
  });

  return {
    success: true,
    message: 'Payment details submitted successfully. Awaiting vendor verification.',
    data: {
      transactionId: tx.transactionId,
      externalTransactionId: tx.externalTransactionId,
      amount: numAmount,
      paymentMethod: normalizedMethod,
      status: tx.status,
      submittedAt: tx.submittedAt
    }
  };
};

/**
 * 2. Vendor: Get Incoming Assigned Payment Requests
 */
const getVendorPaymentRequests = async (vendorId, { page = 1, limit = 20, status = null } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const query = { vendorId };
  if (status && status !== 'all') {
    query.status = status;
  }

  const [transactions, total] = await Promise.all([
    ClientTransaction.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('clientId', 'firstName lastName email mobile'),
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

/**
 * 3. Vendor: Get Specific Payment Details
 */
const getVendorPaymentById = async (paymentId, vendorId) => {
  const query = {
    $or: [
      mongoose.Types.ObjectId.isValid(paymentId) ? { _id: paymentId } : null,
      { transactionId: paymentId }
    ].filter(Boolean),
    vendorId
  };

  const tx = await ClientTransaction.findOne(query).populate('clientId', 'firstName lastName email mobile');
  if (!tx) {
    throw new Error('Payment transaction not found or access unauthorized');
  }

  return tx;
};

/**
 * 4. Vendor Manual Approval with ATOMIC FINANCIAL SETTLEMENT
 */
const vendorApprovePayment = async (paymentId, vendorId, ipAddress = null) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const query = {
      $or: [
        mongoose.Types.ObjectId.isValid(paymentId) ? { _id: paymentId } : null,
        { transactionId: paymentId }
      ].filter(Boolean),
      vendorId
    };

    // 1. Fetch transaction with session lock
    const tx = await ClientTransaction.findOne(query).session(session);
    if (!tx) {
      throw new Error('Payment transaction not found or access unauthorized');
    }

    // 2. Prevent duplicate approval or invalid status transitions
    if (tx.status === 'APPROVED' || tx.status === 'COMPLETED') {
      throw new Error('This payment transaction has already been approved and settled');
    }

    if (tx.status === 'REJECTED') {
      throw new Error('This payment transaction was rejected and cannot be approved');
    }

    if (!['AWAITING_VENDOR_VERIFICATION', 'PAYMENT_SUBMITTED', 'ASSIGNED', 'ALLOCATED'].includes(tx.status)) {
      throw new Error(`Cannot approve transaction with status "${tx.status}"`);
    }

    const approvedAmount = tx.submittedAmount > 0 ? tx.submittedAmount : (tx.allocatedAmount || tx.requestedAmount);
    if (!approvedAmount || approvedAmount <= 0) {
      throw new Error('Invalid approved amount');
    }

    // 3. Dynamically retrieve vendor's applicable commission rate based on current monthly tier
    const tierInfo = await getVendorEffectiveCommission(vendorId, session);
    const commissionPercentage = Number(tierInfo.commissionPercentage) || 0;
    const commissionAmount = Number(((approvedAmount * commissionPercentage) / 100).toFixed(2));

    // 4. Update Vendor Wallet (deduct main balance, credit commission wallet, update total transacted)
    const vendorWallet = await VendorWallet.findOne({ vendorId }).session(session);
    if (!vendorWallet) {
      throw new Error('Vendor wallet record not found');
    }

    const vendorPreviousBalance = vendorWallet.balance;
    const vendorPreviousCommission = vendorWallet.commissionBalance || 0;

    // Credit Vendor Commission Wallet
    vendorWallet.commissionBalance = vendorPreviousCommission + commissionAmount;
    vendorWallet.totalCommissionEarned = (vendorWallet.totalCommissionEarned || 0) + commissionAmount;
    await vendorWallet.save({ session });

    // 5. Update Client Balance
    const client = await Client.findById(tx.clientId).session(session);
    if (!client) {
      throw new Error('Client account not found');
    }

    const clientPreviousBalance = Number(client.balance) || 0;
    client.balance = clientPreviousBalance + approvedAmount;
    await client.save({ session });

    // 6. Create Client Wallet Ledger Record
    const clientLedgerTxNumber = generateTransactionNumber('CLTX');
    await ClientWalletTransaction.create(
      [
        {
          transactionNumber: clientLedgerTxNumber,
          clientId: client._id,
          clientTransactionId: tx._id,
          transactionId: tx.transactionId,
          type: 'CREDIT',
          transactionType: 'PAYMENT_RECEIVED',
          amount: approvedAmount,
          balanceBefore: clientPreviousBalance,
          balanceAfter: client.balance,
          currency: 'INR',
          description: `Payment of ₹${approvedAmount.toLocaleString('en-IN')} received and verified (TxID: ${tx.transactionId})`,
          status: 'COMPLETED',
          metadata: {
            vendorId,
            externalTransactionId: tx.externalTransactionId,
            paymentMethod: tx.paymentMethod
          }
        }
      ],
      { session }
    );

    // 7. Create Vendor Commission Ledger Record
    const commTxNumber = generateTransactionNumber('COMM');
    await WalletTransaction.create(
      [
        {
          transactionNumber: commTxNumber,
          vendorId,
          walletId: vendorWallet._id,
          transactionType: 'COMMISSION_CREDIT',
          amount: commissionAmount,
          balanceBefore: vendorPreviousCommission,
          balanceAfter: vendorWallet.commissionBalance,
          referenceType: 'ClientTransaction',
          referenceId: tx.transactionId,
          description: `Commission (${commissionPercentage}% - ${tierInfo.tierName}) earned on client payment ${tx.transactionId}`,
          createdBy: 'vendor'
        }
      ],
      { session }
    );

    // 8. Atomically update ClientTransaction
    tx.status = 'APPROVED';
    tx.allocationStatus = 'COMPLETED';
    tx.approvedAmount = approvedAmount;
    tx.approvedAt = new Date();
    tx.approvedBy = vendorId;
    tx.tierAtTransaction = tierInfo.tierName;
    tx.commissionPercentage = commissionPercentage;
    tx.commissionAmount = commissionAmount;
    tx.financialSettlement = {
      vendorPreviousBalance,
      vendorNewBalance: vendorWallet.balance,
      clientPreviousBalance,
      clientNewBalance: client.balance,
      vendorPreviousCommission,
      vendorNewCommission: vendorWallet.commissionBalance,
      commissionPercentage,
      commissionAmount,
      approvedAmount,
      settledAt: new Date()
    };

    await tx.save({ session });

    // 9. Create Audit Log
    await logAction({
      actor: vendorId,
      actorRole: 'vendor',
      action: 'VENDOR_PAYMENT_APPROVED_AND_SETTLED',
      targetType: 'ClientTransaction',
      targetId: tx._id,
      metadata: {
        transactionId: tx.transactionId,
        externalTransactionId: tx.externalTransactionId,
        approvedAmount,
        commissionPercentage,
        commissionAmount,
        clientId: client._id,
        clientBalanceAfter: client.balance,
        vendorCommissionAfter: vendorWallet.commissionBalance
      },
      ipAddress,
      session
    });

    // 10. Commit Atomic Transaction
    await session.commitTransaction();
    session.endSession();

    console.log(`[Vendor Approval] Transaction ${tx.transactionId} approved by Vendor ${vendorId}. Client credited ₹${approvedAmount}, Commission: ₹${commissionAmount}`);

    return {
      success: true,
      message: 'Payment verified and approved successfully. Funds settled atomically.',
      data: {
        transactionId: tx.transactionId,
        externalTransactionId: tx.externalTransactionId,
        status: tx.status,
        approvedAmount,
        commissionPercentage,
        commissionAmount,
        clientNewBalance: client.balance,
        vendorCommissionBalance: vendorWallet.commissionBalance,
        approvedAt: tx.approvedAt
      }
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('vendorApprovePayment Error:', error.message);
    throw error;
  }
};

/**
 * 5. Vendor Manual Rejection
 */
const vendorRejectPayment = async (paymentId, vendorId, rejectionReason = null, ipAddress = null) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const query = {
      $or: [
        mongoose.Types.ObjectId.isValid(paymentId) ? { _id: paymentId } : null,
        { transactionId: paymentId }
      ].filter(Boolean),
      vendorId
    };

    const tx = await ClientTransaction.findOne(query).session(session);
    if (!tx) {
      throw new Error('Payment transaction not found or access unauthorized');
    }

    if (tx.status === 'APPROVED' || tx.status === 'COMPLETED') {
      throw new Error('This payment transaction has already been approved and settled; it cannot be rejected');
    }

    if (tx.status === 'REJECTED') {
      throw new Error('This payment transaction has already been rejected');
    }

    const reason = rejectionReason ? rejectionReason.toString().trim() : 'Payment not received in vendor account';

    // Restore vendor balance that was reserved during Stage 1 FCFS allocation
    const refundAmount = tx.allocatedAmount > 0 ? tx.allocatedAmount : tx.requestedAmount;
    if (refundAmount > 0) {
      await VendorWallet.findOneAndUpdate(
        { vendorId },
        {
          $inc: {
            balance: refundAmount,
            totalClientTransacted: -refundAmount
          }
        },
        { session }
      );
    }

    // Update transaction
    tx.status = 'REJECTED';
    tx.allocationStatus = 'FAILED';
    tx.rejectedAt = new Date();
    tx.rejectedBy = vendorId;
    tx.rejectionReason = reason;

    await tx.save({ session });

    await logAction({
      actor: vendorId,
      actorRole: 'vendor',
      action: 'VENDOR_PAYMENT_REJECTED',
      targetType: 'ClientTransaction',
      targetId: tx._id,
      metadata: {
        transactionId: tx.transactionId,
        externalTransactionId: tx.externalTransactionId,
        rejectedAmount: refundAmount,
        reason
      },
      ipAddress,
      session
    });

    await session.commitTransaction();
    session.endSession();

    console.log(`[Vendor Rejection] Transaction ${tx.transactionId} rejected by Vendor ${vendorId}. Reason: ${reason}`);

    return {
      success: true,
      message: 'Payment rejected successfully. Reserved vendor funds restored.',
      data: {
        transactionId: tx.transactionId,
        status: tx.status,
        rejectionReason: reason,
        rejectedAt: tx.rejectedAt
      }
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('vendorRejectPayment Error:', error.message);
    throw error;
  }
};

/**
 * 6. Client: Get Balance & History
 */
const getClientBalanceAndHistory = async (clientId, { page = 1, limit = 20 } = {}) => {
  const client = await Client.findById(clientId).select('balance firstName lastName email');
  if (!client) {
    throw new Error('Client not found');
  }

  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const [ledgerTransactions, totalLedger] = await Promise.all([
    ClientWalletTransaction.find({ clientId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit),
    ClientWalletTransaction.countDocuments({ clientId })
  ]);

  return {
    balance: Number(client.balance) || 0,
    currency: 'INR',
    client: {
      id: client._id,
      name: `${client.firstName} ${client.lastName}`,
      email: client.email
    },
    ledger: {
      transactions: ledgerTransactions,
      pagination: {
        total: totalLedger,
        page: numPage,
        limit: numLimit,
        totalPages: Math.ceil(totalLedger / numLimit)
      }
    }
  };
};

module.exports = {
  submitClientPayment,
  getVendorPaymentRequests,
  getVendorPaymentById,
  vendorApprovePayment,
  vendorRejectPayment,
  getClientBalanceAndHistory
};
