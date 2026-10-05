const mongoose = require('mongoose');
const ClientWithdrawal = require('../models/clientWithdrawalModel');
const Client = require('../models/clientModel');
const ClientTransaction = require('../models/clientTransactionModel');
const ClientWalletTransaction = require('../models/clientWalletTransactionModel');
const { logAction } = require('./auditService');

/**
 * Generate unique client withdrawal reference ID
 */
const generateClientWithdrawalId = (prefix = 'CWTH') => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};

/**
 * Helper: Calculate total vendor commission for a client across all completed/approved transactions
 */
const calculateClientVendorCommission = async (clientId) => {
  const transactions = await ClientTransaction.find({
    $or: [
      { clientId },
      { clientId: clientId.toString() }
    ]
  }).populate('vendorId', 'firstName lastName email currentTier currentTierDisplayName effectiveCommissionRate');

  let totalVendorCommission = 0;
  let totalApprovedVolume = 0;

  for (const tx of transactions) {
    if (['APPROVED', 'COMPLETED'].includes(tx.status)) {
      const approvedAmt = Number(tx.approvedAmount || tx.submittedAmount || tx.requestedAmount || 0);
      totalApprovedVolume += approvedAmt;

      const commRate = tx.commissionPercentage !== undefined && tx.commissionPercentage !== null
        ? tx.commissionPercentage
        : (tx.vendorId?.effectiveCommissionRate || 0);

      const commAmt = tx.commissionAmount !== undefined && tx.commissionAmount !== null
        ? tx.commissionAmount
        : Number(((approvedAmt * commRate) / 100).toFixed(2));

      totalVendorCommission += commAmt;
    }
  }

  return {
    totalVendorCommission: Number(totalVendorCommission.toFixed(2)),
    totalApprovedVolume: Number(totalApprovedVolume.toFixed(2)),
    totalTransactionsCount: transactions.length
  };
};

/**
 * 1. Client creates a withdrawal request
 */
const createClientWithdrawalRequest = async ({
  clientId,
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

  const client = await Client.findById(clientId);
  if (!client) {
    throw new Error('Client account not found');
  }

  if (client.status === 'blocked' || client.isBlocked) {
    throw new Error('Client account is blocked. Withdrawals are disabled.');
  }

  if (!client.isActive) {
    throw new Error('Client account is inactive. Please contact support.');
  }

  const availableBalance = Number(client.balance) || 0;
  if (availableBalance < 25000) {
    throw new Error(
      `Insufficient platform balance. Minimum withdrawal amount is ₹25,000 (Your available balance is ₹${availableBalance.toLocaleString('en-IN')})`
    );
  }

  if (availableBalance < numAmount) {
    throw new Error(
      `Insufficient platform balance. Available: ₹${availableBalance.toLocaleString('en-IN')}, Requested: ₹${numAmount.toLocaleString('en-IN')}`
    );
  }

  // Resolve Destination Details
  let resolvedDestination = {};

  if (!isManualDestination && selectedAccountId) {
    if (normalizedType === 'bank') {
      const bank = client.bankAccounts?.id(selectedAccountId);
      if (!bank || bank.isActive === false) {
        throw new Error('Selected bank account not found or inactive');
      }
      resolvedDestination = {
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        ifscCode: bank.ifscCode,
        accountHolderName: bank.accountHolderName,
        branchName: bank.branchName || ''
      };
    } else if (normalizedType === 'wallet') {
      const w = client.wallets?.id(selectedAccountId);
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
    // Manual / Custom destination details
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
        throw new Error('Wallet/UPI name and Wallet ID (UPI VPA) are required');
      }
      resolvedDestination = {
        walletName: walletName.trim(),
        walletId: walletId.trim(),
        qrCode: qrCode || null
      };
    }
  }

  const withdrawalId = generateClientWithdrawalId('CWTH');

  const withdrawal = await ClientWithdrawal.create({
    withdrawalId,
    clientId,
    amount: numAmount,
    destinationType: normalizedType,
    isManualDestination: Boolean(isManualDestination),
    selectedAccountId: selectedAccountId && mongoose.Types.ObjectId.isValid(selectedAccountId) ? new mongoose.Types.ObjectId(selectedAccountId.toString()) : null,
    destinationDetails: resolvedDestination,
    notes: (notes || '').trim(),
    status: 'PENDING_ADMIN_PAYMENT'
  });

  await logAction({
    actor: clientId,
    actorRole: 'client',
    action: 'CLIENT_WITHDRAWAL_REQUESTED',
    targetType: 'ClientWithdrawal',
    targetId: withdrawal._id,
    metadata: {
      withdrawalId,
      amount: numAmount,
      destinationType: normalizedType,
      availableBalance
    },
    ipAddress
  });

  console.log(`[ClientWithdrawal] Request ${withdrawalId} created by Client ${clientId} for ₹${numAmount} (${normalizedType})`);

  return {
    success: true,
    message: 'Withdrawal request submitted successfully. Awaiting Admin processing and payment proof.',
    withdrawal
  };
};

/**
 * 2. Get Client Withdrawals
 */
const getClientWithdrawals = async (clientId, { page = 1, limit = 20, status = null } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const query = { clientId };
  if (status && status !== 'all') {
    query.status = status;
  }

  const [withdrawals, total, client, statsAggregation] = await Promise.all([
    ClientWithdrawal.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('adminPaymentDetails.paidBy', 'name email'),
    ClientWithdrawal.countDocuments(query),
    Client.findById(clientId).select('balance firstName lastName email'),
    ClientWithdrawal.aggregate([
      { $match: { clientId: new mongoose.Types.ObjectId(clientId.toString()) } },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalSettledAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, '$amount', 0] }
          },
          totalPendingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'PENDING_ADMIN_PAYMENT'] }, '$amount', 0] }
          },
          totalSentAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'PAYMENT_SENT_BY_ADMIN'] }, '$amount', 0] }
          }
        }
      }
    ])
  ]);

  const stats = (statsAggregation && statsAggregation[0]) || {
    totalCount: 0,
    totalSettledAmount: 0,
    totalPendingAmount: 0,
    totalSentAmount: 0
  };

  return {
    withdrawals,
    summary: {
      currentBalance: Number(client?.balance) || 0,
      totalSettledAmount: stats.totalSettledAmount,
      totalPendingAmount: stats.totalPendingAmount,
      totalSentAmount: stats.totalSentAmount
    },
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit) || 1
    }
  };
};

/**
 * 3. Get Specific Client Withdrawal by ID
 */
const getClientWithdrawalById = async (withdrawalId, clientId = null) => {
  const query = {
    $or: [
      mongoose.Types.ObjectId.isValid(withdrawalId) ? { _id: withdrawalId } : null,
      { withdrawalId }
    ].filter(Boolean)
  };
  if (clientId) query.clientId = clientId;

  const doc = await ClientWithdrawal.findOne(query)
    .populate('clientId', 'firstName lastName email mobile businessType balance')
    .populate('adminPaymentDetails.paidBy', 'name email');

  if (!doc) {
    throw new Error('Client withdrawal request not found or access unauthorized');
  }

  return doc;
};

/**
 * 4. Admin: Get all client withdrawals with search, filter, and aggregate KPI stats
 */
const adminGetClientWithdrawals = async ({ page = 1, limit = 20, status = null, search = '' } = {}) => {
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
    ClientWithdrawal.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('clientId', 'firstName lastName email mobile balance businessType')
      .populate('adminPaymentDetails.paidBy', 'name email'),
    ClientWithdrawal.countDocuments(query),
    ClientWithdrawal.aggregate([
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
          },
          totalAdminCommissionDeducted: {
            $sum: { $cond: [{ $eq: ['$status', 'APPROVED'] }, '$financialSettlement.adminCommissionDeducted', 0] }
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
    pendingVolume: 0,
    totalAdminCommissionDeducted: 0
  };

  return {
    withdrawals,
    stats,
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit) || 1
    }
  };
};

/**
 * 5. Admin: Get Client Withdrawal Full Details with Client Transaction History & Vendor Commission Breakdown
 */
const adminGetClientWithdrawalDetails = async (withdrawalId) => {
  const query = {
    $or: [
      mongoose.Types.ObjectId.isValid(withdrawalId) ? { _id: withdrawalId } : null,
      { withdrawalId }
    ].filter(Boolean)
  };

  const withdrawal = await ClientWithdrawal.findOne(query)
    .populate('clientId', 'firstName lastName email mobile platformUrl businessType balance bankAccounts wallets')
    .populate('adminPaymentDetails.paidBy', 'name email');

  if (!withdrawal) {
    throw new Error('Client withdrawal request not found');
  }

  const clientId = withdrawal.clientId?._id || withdrawal.clientId;

  // Fetch all transactions between this Client and Vendors
  const clientTransactions = await ClientTransaction.find({
    $or: [
      { clientId },
      { clientId: clientId.toString() }
    ]
  })
    .populate('vendorId', 'firstName lastName email mobileNumber currentTier currentTierDisplayName effectiveCommissionRate')
    .sort({ createdAt: -1 });

  let totalVolume = 0;
  let totalApprovedVolume = 0;
  let totalVendorCommission = 0;

  const transactionList = clientTransactions.map((tx) => {
    const reqAmt = Number(tx.requestedAmount || tx.allocatedAmount || 0);
    const approvedAmt = Number(tx.approvedAmount || tx.submittedAmount || tx.requestedAmount || 0);
    const commRate = tx.commissionPercentage !== undefined && tx.commissionPercentage !== null
      ? tx.commissionPercentage
      : (tx.vendorId?.effectiveCommissionRate || 0);

    const commAmt = tx.commissionAmount !== undefined && tx.commissionAmount !== null
      ? tx.commissionAmount
      : Number(((approvedAmt * commRate) / 100).toFixed(2));

    totalVolume += reqAmt;
    if (['APPROVED', 'COMPLETED'].includes(tx.status)) {
      totalApprovedVolume += approvedAmt;
      totalVendorCommission += commAmt;
    }

    const vendorName = tx.vendorId ? `${tx.vendorId.firstName || ''} ${tx.vendorId.lastName || ''}`.trim() : 'Unassigned';

    return {
      transactionId: tx.transactionId,
      amount: reqAmt,
      approvedAmount: approvedAmt,
      paymentMethod: tx.paymentMethod,
      status: tx.status,
      vendor: {
        id: tx.vendorId?._id || tx.vendorId,
        name: vendorName,
        email: tx.vendorId?.email || '--'
      },
      vendorTier: tx.tierAtTransaction || tx.vendorId?.currentTierDisplayName || tx.vendorId?.currentTier || 'Standard',
      commissionRate: commRate,
      commissionAmount: commAmt,
      externalTransactionId: tx.externalTransactionId || '--',
      createdAt: tx.createdAt,
      approvedAt: tx.approvedAt
    };
  });

  return {
    withdrawal,
    client: withdrawal.clientId,
    clientFinancials: {
      currentBalance: Number(withdrawal.clientId?.balance) || 0,
      totalVolume: Number(totalVolume.toFixed(2)),
      totalApprovedVolume: Number(totalApprovedVolume.toFixed(2)),
      totalVendorCommission: Number(totalVendorCommission.toFixed(2)),
      totalTransactionsCount: clientTransactions.length
    },
    transactionHistory: transactionList
  };
};

/**
 * 6. Admin: Submits Payment Proof, Admin Commission Cut, and UTR Reference for Client Withdrawal
 */
const adminSendClientWithdrawalPayment = async ({
  withdrawalId,
  adminId,
  adminCommission = undefined,
  adminCommissionPercentage = undefined,
  vendorCommissionDeducted = undefined,
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

  const withdrawal = await ClientWithdrawal.findOne(query).populate('clientId', 'firstName lastName email mobile balance');
  if (!withdrawal) {
    throw new Error('Client withdrawal request not found');
  }

  if (withdrawal.status === 'APPROVED') {
    throw new Error('This withdrawal has already been approved and settled');
  }

  if (withdrawal.status === 'REJECTED') {
    throw new Error('This withdrawal was rejected and cannot be processed');
  }

  const requestedAmount = Number(withdrawal.amount);

  // Determine vendor commission
  let vendorComm = 0;
  if (vendorCommissionDeducted !== undefined && !isNaN(Number(vendorCommissionDeducted))) {
    vendorComm = Number(vendorCommissionDeducted);
  } else {
    const vSummary = await calculateClientVendorCommission(withdrawal.clientId?._id || withdrawal.clientId);
    vendorComm = vSummary.totalVendorCommission;
  }
  vendorComm = Math.max(0, Number(vendorComm.toFixed(2)));

  let numAdminPercent = adminCommissionPercentage !== undefined && !isNaN(Number(adminCommissionPercentage))
    ? Math.max(0, Number(adminCommissionPercentage))
    : 0;

  let numAdminCommission = adminCommission !== undefined && !isNaN(Number(adminCommission))
    ? Math.max(0, Number(adminCommission))
    : 0;

  // If percentage is provided and commission amount is 0, calculate amount from percentage
  if (numAdminPercent > 0 && numAdminCommission === 0) {
    numAdminCommission = Number(((requestedAmount * numAdminPercent) / 100).toFixed(2));
  } else if (numAdminCommission > 0 && numAdminPercent === 0 && requestedAmount > 0) {
    numAdminPercent = Number(((numAdminCommission / requestedAmount) * 100).toFixed(2));
  }

  const totalDeductions = Number((vendorComm + numAdminCommission).toFixed(2));

  if (totalDeductions >= requestedAmount) {
    throw new Error(
      `Total deductions (Vendor Comm: ₹${vendorComm.toLocaleString('en-IN')} + Admin Comm: ₹${numAdminCommission.toLocaleString('en-IN')} = ₹${totalDeductions.toLocaleString('en-IN')}) cannot exceed or equal requested withdrawal amount (₹${requestedAmount.toLocaleString('en-IN')})`
    );
  }

  const paidAmount = Number((requestedAmount - vendorComm - numAdminCommission).toFixed(2));

  withdrawal.adminPaymentDetails = {
    requestedAmount,
    adminCommissionPercentage: numAdminPercent,
    adminCommission: numAdminCommission,
    totalVendorCommissionDeducted: vendorComm,
    paidAmount,
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
    action: 'ADMIN_CLIENT_WITHDRAWAL_PAYMENT_SENT',
    targetType: 'ClientWithdrawal',
    targetId: withdrawal._id,
    metadata: {
      withdrawalId: withdrawal.withdrawalId,
      clientId: withdrawal.clientId?._id || withdrawal.clientId,
      requestedAmount,
      adminCommissionPercentage: numAdminPercent,
      adminCommission: numAdminCommission,
      totalVendorCommissionDeducted: vendorComm,
      paidAmount,
      transactionId: withdrawal.adminPaymentDetails.transactionId
    },
    ipAddress
  });

  console.log(
    `[ClientWithdrawal] Payment proof sent for ${withdrawal.withdrawalId} by Admin. Requested: ₹${requestedAmount}, Vendor Comm: ₹${vendorComm}, Admin Comm: ₹${numAdminCommission} (${numAdminPercent}%), Net Paid: ₹${paidAmount}`
  );

  return {
    success: true,
    message: 'Payment proof, admin commission deduction, and UTR submitted. Sent to Client for confirmation & receipt generation.',
    withdrawal
  };
};

/**
 * 7. Client: Confirms & Approves Received Withdrawal Payment
 * Atomically deducts platform balance, computes combined commissions, and creates final receipt settlement
 */
const clientApproveWithdrawal = async (withdrawalId, clientId, ipAddress = null) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const query = {
      $or: [
        mongoose.Types.ObjectId.isValid(withdrawalId) ? { _id: withdrawalId } : null,
        { withdrawalId }
      ].filter(Boolean),
      clientId
    };

    const withdrawal = await ClientWithdrawal.findOne(query).session(session);
    if (!withdrawal) {
      throw new Error('Client withdrawal request not found or unauthorized');
    }

    if (withdrawal.status === 'APPROVED') {
      throw new Error('This withdrawal has already been approved and settled');
    }

    if (withdrawal.status === 'REJECTED') {
      throw new Error('This withdrawal was rejected and cannot be approved');
    }

    if (withdrawal.status !== 'PAYMENT_SENT_BY_ADMIN') {
      throw new Error(`Cannot approve withdrawal with status "${withdrawal.status}". Admin must process and submit payment proof first.`);
    }

    const requestedAmount = Number(withdrawal.amount);

    // Fetch and deduct Client platform balance
    const client = await Client.findById(clientId).session(session);
    if (!client) {
      throw new Error('Client account record not found');
    }

    const balanceBefore = Number(client.balance) || 0;
    if (balanceBefore < requestedAmount) {
      throw new Error(`Insufficient platform balance during settlement. Required: ₹${requestedAmount}, Available: ₹${balanceBefore}`);
    }

    // Deduct client balance
    client.balance = balanceBefore - requestedAmount;
    await client.save({ session });

    // Calculate vendor commissions at time of settlement
    const vendorCommSummary = await calculateClientVendorCommission(clientId);
    const totalVendorComm = withdrawal.adminPaymentDetails?.totalVendorCommissionDeducted !== undefined
      ? Number(withdrawal.adminPaymentDetails.totalVendorCommissionDeducted)
      : vendorCommSummary.totalVendorCommission;

    const adminComm = Number(withdrawal.adminPaymentDetails?.adminCommission) || 0;
    const adminCommPercent = Number(withdrawal.adminPaymentDetails?.adminCommissionPercentage) || 0;
    const totalCombinedComm = Number((totalVendorComm + adminComm).toFixed(2));
    const netAmountReceived = Number(
      withdrawal.adminPaymentDetails?.paidAmount !== undefined
        ? withdrawal.adminPaymentDetails.paidAmount
        : requestedAmount - totalCombinedComm
    );

    // Update Withdrawal Document with settlement & receipt data
    withdrawal.status = 'APPROVED';
    withdrawal.clientConfirmation = {
      isApproved: true,
      confirmedAt: new Date(),
      rejectionReason: null
    };
    withdrawal.financialSettlement = {
      balanceBefore,
      balanceAfter: client.balance,
      requestedAmount,
      adminCommissionPercentage: adminCommPercent,
      adminCommissionDeducted: adminComm,
      totalVendorCommissionAtTime: totalVendorComm,
      totalCombinedCommission: totalCombinedComm,
      netAmountReceived,
      settledAt: new Date()
    };
    await withdrawal.save({ session });

    // Create Audit Log
    await logAction({
      actor: clientId,
      actorRole: 'client',
      action: 'CLIENT_WITHDRAWAL_APPROVED_AND_SETTLED',
      targetType: 'ClientWithdrawal',
      targetId: withdrawal._id,
      metadata: {
        withdrawalId: withdrawal.withdrawalId,
        requestedAmount,
        adminCommission: adminComm,
        totalVendorCommission: totalVendorComm,
        totalCombinedCommission: totalCombinedComm,
        netAmountReceived,
        newClientBalance: client.balance,
        utr: withdrawal.adminPaymentDetails?.transactionId
      },
      ipAddress,
      session
    });

    await session.commitTransaction();
    session.endSession();

    console.log(
      `[ClientWithdrawal] ${withdrawal.withdrawalId} confirmed and settled by Client ${clientId}. Deducted ₹${requestedAmount}, Net Received: ₹${netAmountReceived}, Total Commissions: ₹${totalCombinedComm}`
    );

    // Return detailed receipt object
    return {
      success: true,
      message: 'Withdrawal confirmed successfully! Payment received and receipt generated.',
      data: {
        receipt: {
          receiptNumber: `REC-${withdrawal.withdrawalId}`,
          withdrawalId: withdrawal.withdrawalId,
          clientId: client._id,
          clientName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
          clientEmail: client.email,
          requestedAmount,
          adminCommissionDeducted: adminComm,
          totalVendorCommission: totalVendorComm,
          totalCombinedCommission: totalCombinedComm,
          netAmountReceived,
          destinationType: withdrawal.destinationType,
          destinationDetails: withdrawal.destinationDetails,
          transactionId: withdrawal.adminPaymentDetails?.transactionId,
          paymentProof: withdrawal.adminPaymentDetails?.paymentProof,
          status: withdrawal.status,
          settledAt: withdrawal.financialSettlement.settledAt,
          balanceAfter: client.balance
        },
        withdrawal
      }
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('clientApproveWithdrawal Error:', error.message);
    throw error;
  }
};

/**
 * 8. Client: Rejects Withdrawal Payment (Payment not received)
 */
const clientRejectWithdrawal = async (withdrawalId, clientId, rejectionReason = null, ipAddress = null) => {
  const query = {
    $or: [
      mongoose.Types.ObjectId.isValid(withdrawalId) ? { _id: withdrawalId } : null,
      { withdrawalId }
    ].filter(Boolean),
    clientId
  };

  const withdrawal = await ClientWithdrawal.findOne(query);
  if (!withdrawal) {
    throw new Error('Client withdrawal request not found or unauthorized');
  }

  if (withdrawal.status === 'APPROVED') {
    throw new Error('This withdrawal has already been approved and settled; it cannot be rejected');
  }

  if (withdrawal.status === 'REJECTED') {
    throw new Error('This withdrawal has already been marked as rejected');
  }

  const reason = (rejectionReason || '').toString().trim() || 'Payment not received in specified destination bank / wallet';

  withdrawal.status = 'REJECTED';
  withdrawal.clientConfirmation = {
    isApproved: false,
    confirmedAt: new Date(),
    rejectionReason: reason
  };

  await withdrawal.save();

  await logAction({
    actor: clientId,
    actorRole: 'client',
    action: 'CLIENT_WITHDRAWAL_REJECTED',
    targetType: 'ClientWithdrawal',
    targetId: withdrawal._id,
    metadata: {
      withdrawalId: withdrawal.withdrawalId,
      amount: withdrawal.amount,
      rejectionReason: reason
    },
    ipAddress
  });

  console.log(`[ClientWithdrawal] ${withdrawal.withdrawalId} rejected by Client ${clientId}. Reason: ${reason}`);

  return {
    success: true,
    message: 'Withdrawal marked as rejected. No platform balance was deducted.',
    withdrawal
  };
};

/**
 * 9. Admin: Get Profit Analytics, Client-wise Profit records, and Itemized Profit Ledger
 */
const adminGetProfitAnalytics = async ({ page = 1, limit = 20, search = '', clientId = null, status = 'all' } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  // 1. Aggregate Metrics
  const summaryFilter = {};
  if (clientId) {
    summaryFilter.clientId = mongoose.Types.ObjectId.isValid(clientId)
      ? new mongoose.Types.ObjectId(clientId)
      : clientId;
  }
  const allWithdrawals = await ClientWithdrawal.find(summaryFilter).populate('clientId', 'firstName lastName email mobileNumber phone status');

  let totalRealizedProfit = 0;
  let totalPendingProfit = 0;
  let totalSettledVolume = 0;
  let totalVendorCommissionDeducted = 0;
  let totalCombinedCommission = 0;
  let totalNetPaidToClients = 0;
  let totalSettledCount = 0;
  let totalPendingCount = 0;

  // Group per client map
  const clientProfitMap = new Map();

  for (const w of allWithdrawals) {
    const cId = w.clientId?._id ? w.clientId._id.toString() : (w.clientId ? w.clientId.toString() : 'unknown');
    const clientName = w.clientId && typeof w.clientId === 'object'
      ? `${w.clientId.firstName || ''} ${w.clientId.lastName || ''}`.trim() || 'Client'
      : 'Client';
    const clientEmail = w.clientId && typeof w.clientId === 'object' ? (w.clientId.email || '') : '';
    const clientPhone = w.clientId && typeof w.clientId === 'object' ? (w.clientId.mobileNumber || w.clientId.phone || '') : '';

    const adminComm = Number(w.financialSettlement?.adminCommissionDeducted ?? w.adminPaymentDetails?.adminCommission ?? 0);
    const vendorComm = Number(w.financialSettlement?.totalVendorCommissionAtTime ?? w.adminPaymentDetails?.totalVendorCommissionDeducted ?? 0);
    const combinedComm = Number(w.financialSettlement?.totalCombinedCommission ?? (adminComm + vendorComm));
    const reqAmount = Number(w.financialSettlement?.requestedAmount ?? w.amount ?? 0);
    const netPaid = Number(w.financialSettlement?.netAmountReceived ?? w.adminPaymentDetails?.paidAmount ?? (reqAmount - combinedComm));

    if (w.status === 'APPROVED') {
      totalRealizedProfit += adminComm;
      totalSettledVolume += reqAmount;
      totalVendorCommissionDeducted += vendorComm;
      totalCombinedCommission += combinedComm;
      totalNetPaidToClients += netPaid;
      totalSettledCount += 1;
    } else if (w.status === 'PAYMENT_SENT_BY_ADMIN') {
      totalPendingProfit += adminComm;
      totalPendingCount += 1;
    }

    // Accumulate client breakdown (for APPROVED and PAYMENT_SENT_BY_ADMIN)
    if (['APPROVED', 'PAYMENT_SENT_BY_ADMIN'].includes(w.status)) {
      if (!clientProfitMap.has(cId)) {
        clientProfitMap.set(cId, {
          clientId: cId,
          clientName,
          clientEmail,
          clientPhone,
          totalRealizedProfit: 0,
          totalPendingProfit: 0,
          totalProfit: 0,
          totalVolume: 0,
          totalVendorCommission: 0,
          totalCombinedCommission: 0,
          totalNetPaid: 0,
          settledCount: 0,
          pendingCount: 0,
          totalCount: 0,
          lastSettlementDate: null
        });
      }

      const clientStat = clientProfitMap.get(cId);
      if (w.status === 'APPROVED') {
        clientStat.totalRealizedProfit += adminComm;
        clientStat.settledCount += 1;
      } else {
        clientStat.totalPendingProfit += adminComm;
        clientStat.pendingCount += 1;
      }
      clientStat.totalProfit += adminComm;
      clientStat.totalVolume += reqAmount;
      clientStat.totalVendorCommission += vendorComm;
      clientStat.totalCombinedCommission += combinedComm;
      clientStat.totalNetPaid += netPaid;
      clientStat.totalCount += 1;

      const date = w.financialSettlement?.settledAt || w.adminPaymentDetails?.paidAt || w.createdAt;
      if (!clientStat.lastSettlementDate || new Date(date) > new Date(clientStat.lastSettlementDate)) {
        clientStat.lastSettlementDate = date;
      }
    }
  }

  const clientBreakdown = Array.from(clientProfitMap.values())
    .map(c => ({
      ...c,
      totalRealizedProfit: Number(c.totalRealizedProfit.toFixed(2)),
      totalPendingProfit: Number(c.totalPendingProfit.toFixed(2)),
      totalProfit: Number(c.totalProfit.toFixed(2)),
      totalVolume: Number(c.totalVolume.toFixed(2)),
      totalVendorCommission: Number(c.totalVendorCommission.toFixed(2)),
      totalCombinedCommission: Number(c.totalCombinedCommission.toFixed(2)),
      totalNetPaid: Number(c.totalNetPaid.toFixed(2)),
      avgProfitMargin: c.totalVolume > 0 ? Number(((c.totalProfit / c.totalVolume) * 100).toFixed(2)) : 0
    }))
    .sort((a, b) => b.totalProfit - a.totalProfit);

  const avgProfitMargin = totalSettledVolume > 0
    ? Number(((totalRealizedProfit / totalSettledVolume) * 100).toFixed(2))
    : 0;

  // 2. Query for Paginated Profit Ledger
  const query = {};
  if (status && status !== 'all') {
    query.status = status;
  }
  if (clientId) {
    if (mongoose.Types.ObjectId.isValid(clientId)) {
      query.clientId = new mongoose.Types.ObjectId(clientId);
    } else {
      query.clientId = clientId;
    }
  }

  // Filter with adminCommission > 0 or status in ['APPROVED', 'PAYMENT_SENT_BY_ADMIN'] if status not explicitly set
  if (!status || status === 'all') {
    query.$or = [
      { 'financialSettlement.adminCommissionDeducted': { $gt: 0 } },
      { 'adminPaymentDetails.adminCommission': { $gt: 0 } },
      { status: { $in: ['APPROVED', 'PAYMENT_SENT_BY_ADMIN'] } }
    ];
  }

  let ledgerWithdrawals = await ClientWithdrawal.find(query)
    .populate('clientId', 'firstName lastName email mobileNumber phone')
    .sort({ 'financialSettlement.settledAt': -1, createdAt: -1 });

  // Apply search query if given
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    ledgerWithdrawals = ledgerWithdrawals.filter(w => {
      const clientName = w.clientId ? `${w.clientId.firstName || ''} ${w.clientId.lastName || ''}`.toLowerCase() : '';
      const email = w.clientId?.email?.toLowerCase() || '';
      const phone = (w.clientId?.mobileNumber || w.clientId?.phone || '').toLowerCase();
      const wId = (w.withdrawalId || '').toLowerCase();
      const utr = (w.adminPaymentDetails?.transactionId || '').toLowerCase();
      const destAcc = (w.destinationDetails?.accountNumber || w.destinationDetails?.walletId || '').toLowerCase();
      return clientName.includes(q) || email.includes(q) || phone.includes(q) || wId.includes(q) || utr.includes(q) || destAcc.includes(q);
    });
  }

  const totalRecords = ledgerWithdrawals.length;
  const totalPages = Math.ceil(totalRecords / limitNum) || 1;
  const paginatedList = ledgerWithdrawals.slice(skip, skip + limitNum);

  const profitLedger = paginatedList.map(w => {
    const adminComm = Number(w.financialSettlement?.adminCommissionDeducted ?? w.adminPaymentDetails?.adminCommission ?? 0);
    const adminCommPct = Number(w.financialSettlement?.adminCommissionPercentage ?? w.adminPaymentDetails?.adminCommissionPercentage ?? (w.amount > 0 ? ((adminComm / w.amount) * 100).toFixed(2) : 0));
    const vendorComm = Number(w.financialSettlement?.totalVendorCommissionAtTime ?? w.adminPaymentDetails?.totalVendorCommissionDeducted ?? 0);
    const combinedComm = Number(w.financialSettlement?.totalCombinedCommission ?? (adminComm + vendorComm));
    const reqAmount = Number(w.financialSettlement?.requestedAmount ?? w.amount ?? 0);
    const netPaid = Number(w.financialSettlement?.netAmountReceived ?? w.adminPaymentDetails?.paidAmount ?? (reqAmount - combinedComm));

    return {
      _id: w._id,
      withdrawalId: w.withdrawalId,
      clientId: w.clientId,
      amount: reqAmount,
      adminCommissionPercentage: adminCommPct,
      adminProfitAmount: Number(adminComm.toFixed(2)),
      vendorCommissionDeducted: Number(vendorComm.toFixed(2)),
      totalCombinedCommission: Number(combinedComm.toFixed(2)),
      netPaidAmount: Number(netPaid.toFixed(2)),
      destinationType: w.destinationType,
      destinationDetails: w.destinationDetails,
      transactionId: w.adminPaymentDetails?.transactionId || 'N/A',
      paymentProof: w.adminPaymentDetails?.paymentProof || null,
      status: w.status,
      createdAt: w.createdAt,
      settledAt: w.financialSettlement?.settledAt || w.adminPaymentDetails?.paidAt || null
    };
  });

  return {
    summary: {
      totalRealizedProfit: Number(totalRealizedProfit.toFixed(2)),
      totalPendingProfit: Number(totalPendingProfit.toFixed(2)),
      totalCombinedProfit: Number((totalRealizedProfit + totalPendingProfit).toFixed(2)),
      totalSettledVolume: Number(totalSettledVolume.toFixed(2)),
      totalVendorCommissionDeducted: Number(totalVendorCommissionDeducted.toFixed(2)),
      totalCombinedCommission: Number(totalCombinedCommission.toFixed(2)),
      totalNetPaidToClients: Number(totalNetPaidToClients.toFixed(2)),
      avgProfitMargin,
      totalSettledCount,
      totalPendingCount,
      totalProfitableClientsCount: clientBreakdown.length
    },
    clientBreakdown,
    profitLedger,
    pagination: {
      page: pageNum,
      limit: limitNum,
      totalPages,
      totalRecords
    }
  };
};

module.exports = {
  createClientWithdrawalRequest,
  getClientWithdrawals,
  getClientWithdrawalById,
  adminGetClientWithdrawals,
  adminGetClientWithdrawalDetails,
  adminSendClientWithdrawalPayment,
  clientApproveWithdrawal,
  clientRejectWithdrawal,
  adminGetProfitAnalytics
};
