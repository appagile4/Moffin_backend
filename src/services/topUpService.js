const mongoose = require('mongoose');
const TopUpRequest = require('../models/topUpRequestModel');
const PaymentConfirmation = require('../models/paymentConfirmationModel');
const PaymentDestination = require('../models/paymentDestinationModel');
const Vendor = require('../models/vendorModel');
const { creditWallet } = require('./walletService');
const { syncVendorToQueue, moveVendorToEndOfQueue } = require('./fcfsService');
const { logAction } = require('./auditService');
const { uploadToCloudinary } = require('../config/cloudinary');

/**
 * Generate formatted IDs
 */
const generateId = (prefix = 'TOP') => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
};

/**
 * 1. Vendor creates Top-Up Request
 */
const createTopUpRequest = async (
  vendorId,
  {
    requestedAmount,
    preferredPaymentMethod = 'bank',
    selectedBankAccountId,
    selectedBankAccountIds,
    selectedWalletId,
    selectedWalletIds,
    notes
  }
) => {
  const numAmount = Number(requestedAmount);
  if (!numAmount || numAmount <= 0) {
    throw new Error('Requested amount must be greater than 0');
  }

  const validMethods = ['bank', 'wallet', 'both'];
  if (!validMethods.includes(preferredPaymentMethod)) {
    throw new Error('Preferred payment method must be "bank", "wallet", or "both"');
  }

  // Ensure vendor is valid and active
  const vendor = await Vendor.findById(vendorId);
  if (!vendor || !vendor.isActive) {
    throw new Error('Vendor account is inactive or not found');
  }

  // Normalize bank account IDs
  let bankIds = [];
  if (Array.isArray(selectedBankAccountIds) && selectedBankAccountIds.length > 0) {
    bankIds = selectedBankAccountIds.filter(Boolean);
  } else if (selectedBankAccountId) {
    bankIds = [selectedBankAccountId];
  }

  // Normalize wallet IDs
  let walletIds = [];
  if (Array.isArray(selectedWalletIds) && selectedWalletIds.length > 0) {
    walletIds = selectedWalletIds.filter(Boolean);
  } else if (selectedWalletId) {
    walletIds = [selectedWalletId];
  }

  const vendorBankDetails = [];
  if (vendor.bankAccounts?.length > 0) {
    if (bankIds.length > 0) {
      bankIds.forEach(id => {
        const matched = vendor.bankAccounts.id(id) || vendor.bankAccounts.find(b => b._id.toString() === id.toString());
        if (matched) {
          vendorBankDetails.push({
            bankName: matched.bankName,
            accountNumber: matched.accountNumber,
            ifscCode: matched.ifscCode,
            branchName: matched.branchName,
            accountHolderName: matched.accountHolderName
          });
        }
      });
    } else if (['bank', 'both'].includes(preferredPaymentMethod)) {
      vendor.bankAccounts.forEach(b => {
        vendorBankDetails.push({
          bankName: b.bankName,
          accountNumber: b.accountNumber,
          ifscCode: b.ifscCode,
          branchName: b.branchName,
          accountHolderName: b.accountHolderName
        });
      });
    }
  }

  const vendorWalletDetails = [];
  if (vendor.wallets?.length > 0) {
    if (walletIds.length > 0) {
      walletIds.forEach(id => {
        const matched = vendor.wallets.id(id) || vendor.wallets.find(w => w._id.toString() === id.toString());
        if (matched) {
          vendorWalletDetails.push({
            walletName: matched.walletName,
            walletId: matched.walletId,
            qrCode: matched.qrCode
          });
        }
      });
    } else if (['wallet', 'both'].includes(preferredPaymentMethod)) {
      vendor.wallets.forEach(w => {
        vendorWalletDetails.push({
          walletName: w.walletName,
          walletId: w.walletId,
          qrCode: w.qrCode
        });
      });
    }
  }

  const topUpId = generateId('TOP');

  const topUp = await TopUpRequest.create({
    topUpId,
    vendorId,
    requestedAmount: numAmount,
    preferredPaymentMethod,
    selectedBankAccountId: bankIds[0] || null,
    selectedBankAccountIds: bankIds,
    selectedWalletId: walletIds[0] || null,
    selectedWalletIds: walletIds,
    vendorBankDetails,
    vendorWalletDetails,
    notes: notes ? notes.trim() : null,
    status: 'PENDING_ADMIN_RESPONSE'
  });

  await logAction({
    actor: vendorId,
    actorRole: 'vendor',
    action: 'TOPUP_REQUEST_CREATED',
    targetType: 'TopUpRequest',
    targetId: topUp._id,
    metadata: { topUpId, requestedAmount: numAmount, preferredPaymentMethod }
  });

  return topUp;
};

/**
 * 2. Get Vendor's own Top-Up requests with pagination
 */
const getVendorTopUps = async (vendorId, { page = 1, limit = 20, status = null } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const query = { vendorId };
  if (status) query.status = status;

  const [topUps, total] = await Promise.all([
    TopUpRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('adminResponse.selectedDestinations')
      .populate('paymentConfirmationId'),
    TopUpRequest.countDocuments(query)
  ]);

  return {
    topUps,
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit)
    }
  };
};

/**
 * 3. Get single Top-Up request by ID
 */
const getTopUpById = async (id, vendorId = null) => {
  const query = { _id: id };
  if (vendorId) query.vendorId = vendorId;

  const topUp = await TopUpRequest.findOne(query)
    .populate('vendorId', 'firstName lastName email mobileNumber profilePhoto verificationStatus isActive')
    .populate('adminResponse.selectedDestinations')
    .populate('adminResponse.respondedBy', 'name email role')
    .populate('paymentConfirmationId');

  if (!topUp) {
    throw new Error('Top-up request not found or access unauthorized');
  }

  return topUp;
};

/**
 * 4. SuperAdmin: Get all Top-Up requests with filters & pagination
 */
const getAllTopUpsAdmin = async ({ page = 1, limit = 50, status = null, vendorId = null } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const skip = (numPage - 1) * numLimit;

  const query = {};
  if (status && status !== 'all') query.status = status;
  if (vendorId) query.vendorId = vendorId;

  const [topUps, total] = await Promise.all([
    TopUpRequest.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('vendorId', 'firstName lastName email mobileNumber profilePhoto verificationStatus isActive')
      .populate('adminResponse.selectedDestinations')
      .populate('adminResponse.respondedBy', 'name email')
      .populate('paymentConfirmationId'),
    TopUpRequest.countDocuments(query)
  ]);

  return {
    topUps,
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit)
    }
  };
};

/**
 * 5. SuperAdmin responds with selected payment destinations (supports multiple banks & wallets)
 */
const adminRespondTopUp = async (
  topUpId,
  adminId,
  {
    selectedDestinationIds,
    paymentDestinationId,
    destinationId,
    destinationIds,
    approvedAmount,
    adminMessage,
    adminNotes
  }
) => {
  const topUp = await TopUpRequest.findById(topUpId);
  if (!topUp) {
    throw new Error('Top-up request not found');
  }

  if (topUp.status !== 'PENDING_ADMIN_RESPONSE' && topUp.status !== 'AWAITING_PAYMENT') {
    throw new Error(`Cannot respond to top-up request with status "${topUp.status}"`);
  }

  // Normalize destination IDs from any format
  let destIds = [];
  if (Array.isArray(selectedDestinationIds) && selectedDestinationIds.length > 0) {
    destIds = selectedDestinationIds.filter(Boolean);
  } else if (Array.isArray(destinationIds) && destinationIds.length > 0) {
    destIds = destinationIds.filter(Boolean);
  } else if (paymentDestinationId) {
    destIds = [paymentDestinationId];
  } else if (destinationId) {
    destIds = [destinationId];
  }

  if (destIds.length === 0) {
    throw new Error('Please select at least one company bank account or wallet destination');
  }

  // Validate destinations exist and are active
  const destinations = await PaymentDestination.find({
    _id: { $in: destIds },
    isActive: true
  });

  if (destinations.length !== destIds.length) {
    throw new Error('One or more selected payment destinations are invalid or inactive');
  }

  const finalAmount = Number(approvedAmount) > 0 ? Number(approvedAmount) : topUp.requestedAmount;
  const message = adminMessage || adminNotes || null;

  topUp.adminResponse = {
    selectedDestinations: destIds,
    approvedAmount: finalAmount,
    adminMessage: message ? message.trim() : null,
    respondedBy: adminId,
    respondedAt: new Date()
  };
  topUp.status = 'AWAITING_PAYMENT';

  await topUp.save();

  await logAction({
    actor: adminId,
    actorRole: 'super_admin',
    action: 'TOPUP_ADMIN_RESPONDED',
    targetType: 'TopUpRequest',
    targetId: topUp._id,
    metadata: { topUpId: topUp.topUpId, selectedDestinationIds: destIds, approvedAmount: finalAmount }
  });

  return await getTopUpById(topUp._id);
};

/**
 * 6. Vendor submits payment confirmation proof
 */
const submitPaymentConfirmation = async (
  vendorId,
  topUpRequestId,
  { amountPaid, paymentDestinationId, paymentMethod, transactionId, transactionDate, note },
  fileBuffer
) => {
  const topUp = await TopUpRequest.findOne({ _id: topUpRequestId, vendorId });
  if (!topUp) {
    throw new Error('Top-up request not found or unauthorized');
  }

  if (topUp.status !== 'AWAITING_PAYMENT' && topUp.status !== 'REJECTED') {
    throw new Error(`Payment confirmation cannot be submitted for top-up with status "${topUp.status}"`);
  }

  if (!amountPaid || Number(amountPaid) <= 0) {
    throw new Error('Amount paid must be greater than 0');
  }

  if (!transactionId || !transactionId.trim()) {
    throw new Error('Transaction reference number (UTR/TxID) is required');
  }

  if (!fileBuffer) {
    throw new Error('Payment screenshot/proof image is required');
  }

  // Check duplicate transaction reference globally across all confirmations
  const existingTx = await PaymentConfirmation.findOne({
    transactionId: transactionId.trim()
  });
  if (existingTx) {
    throw new Error('This transaction reference (UTR/TxID) has already been submitted and must be unique');
  }

  // Verify selected payment destination
  const destination = await PaymentDestination.findById(paymentDestinationId);
  if (!destination || !destination.isActive) {
    throw new Error('Selected payment destination is invalid or inactive');
  }

  // Upload proof to Cloudinary
  const uploadResult = await uploadToCloudinary(fileBuffer, 'moffin_vendors/payment_proofs');
  const paymentProofUrl = uploadResult.secure_url;

  const confirmationId = generateId('CONF');

  const confirmation = await PaymentConfirmation.create({
    confirmationId,
    topUpRequestId: topUp._id,
    vendorId,
    amountPaid: Number(amountPaid),
    paymentDestinationId,
    paymentMethod: paymentMethod || destination.type,
    transactionId: transactionId.trim(),
    transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
    paymentProof: paymentProofUrl,
    note: note ? note.trim() : null,
    status: 'PAYMENT_SUBMITTED'
  });

  // Link to TopUpRequest and update status
  topUp.paymentConfirmationId = confirmation._id;
  topUp.status = 'PAYMENT_SUBMITTED';
  await topUp.save();

  await logAction({
    actor: vendorId,
    actorRole: 'vendor',
    action: 'PAYMENT_CONFIRMATION_SUBMITTED',
    targetType: 'PaymentConfirmation',
    targetId: confirmation._id,
    metadata: {
      confirmationId,
      topUpId: topUp.topUpId,
      amountPaid: Number(amountPaid),
      transactionId: transactionId.trim()
    }
  });

  return confirmation;
};

/**
 * 7. SuperAdmin approves payment (ATOMIC DATABASE TRANSACTION)
 */
const adminApprovePayment = async (confirmationId, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch confirmation with session & lock
    const confirmation = await PaymentConfirmation.findById(confirmationId).session(session);
    if (!confirmation) {
      throw new Error('Payment confirmation not found');
    }

    // 2. Prevent duplicate approval
    if (confirmation.status === 'APPROVED') {
      throw new Error('This payment confirmation has already been approved and credited');
    }

    if (confirmation.status !== 'PAYMENT_SUBMITTED') {
      throw new Error(`Cannot approve payment confirmation with status "${confirmation.status}"`);
    }

    // 3. Fetch TopUpRequest
    const topUp = await TopUpRequest.findById(confirmation.topUpRequestId).session(session);
    if (!topUp) {
      throw new Error('Associated top-up request not found');
    }

    // 4. Update Confirmation Status
    confirmation.status = 'APPROVED';
    confirmation.verifiedBy = adminId;
    confirmation.verifiedAt = new Date();
    confirmation.rejectionReason = null;
    await confirmation.save({ session });

    // 5. Update TopUpRequest Status
    topUp.status = 'COMPLETED';
    await topUp.save({ session });

    // 6. Credit Vendor Wallet & create Ledger record
    const walletResult = await creditWallet({
      vendorId: confirmation.vendorId,
      amount: confirmation.amountPaid,
      transactionType: 'CREDIT_TOPUP',
      referenceType: 'PaymentConfirmation',
      referenceId: confirmation._id,
      description: `Top-up approved by admin for TxID ${confirmation.transactionId}`,
      createdBy: adminId,
      session
    });

    // 7. Update FCFS Queue: Move vendor with approved top-up to the end of the queue
    await moveVendorToEndOfQueue(confirmation.vendorId, session);

    // 8. Dynamically recalculate vendor's monthly tier and progression
    const { recalculateVendorMonthlyTier } = require('./tierCalculationService');
    const tierResult = await recalculateVendorMonthlyTier(confirmation.vendorId, {
      topUpAmount: confirmation.amountPaid,
      reason: `Top-up payment approved (TxID: ${confirmation.transactionId})`,
      session
    });

    // 9. Create Audit Log
    await logAction({
      actor: adminId,
      actorRole: 'super_admin',
      action: 'PAYMENT_APPROVED_AND_CREDITED',
      targetType: 'PaymentConfirmation',
      targetId: confirmation._id,
      metadata: {
        confirmationId: confirmation.confirmationId,
        vendorId: confirmation.vendorId,
        creditedAmount: confirmation.amountPaid,
        walletBalanceAfter: walletResult.wallet.balance,
        currentTier: tierResult?.currentTierDisplayName || tierResult?.currentTierName
      },
      session
    });

    // 9. Commit Transaction
    await session.commitTransaction();
    session.endSession();

    return {
      confirmation,
      topUp,
      wallet: walletResult.wallet,
      transaction: walletResult.transaction
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

/**
 * 8. SuperAdmin rejects payment
 */
const adminRejectPayment = async (confirmationId, adminId, rejectionReason) => {
  if (!rejectionReason || !rejectionReason.trim()) {
    throw new Error('Please provide a reason for payment rejection');
  }

  const confirmation = await PaymentConfirmation.findById(confirmationId);
  if (!confirmation) {
    throw new Error('Payment confirmation not found');
  }

  if (confirmation.status === 'APPROVED') {
    throw new Error('Cannot reject an already approved payment');
  }

  confirmation.status = 'REJECTED';
  confirmation.rejectionReason = rejectionReason.trim();
  confirmation.verifiedBy = adminId;
  confirmation.verifiedAt = new Date();
  await confirmation.save();

  // Update TopUpRequest status to REJECTED
  await TopUpRequest.findByIdAndUpdate(confirmation.topUpRequestId, {
    status: 'REJECTED'
  });

  await logAction({
    actor: adminId,
    actorRole: 'super_admin',
    action: 'PAYMENT_REJECTED',
    targetType: 'PaymentConfirmation',
    targetId: confirmation._id,
    metadata: {
      confirmationId: confirmation.confirmationId,
      vendorId: confirmation.vendorId,
      rejectionReason: rejectionReason.trim()
    }
  });

  return confirmation;
};

/**
 * 9. Get Payment Confirmations for Vendor or Admin
 */
const getPaymentConfirmations = async ({ vendorId = null, status = null, page = 1, limit = 20 } = {}) => {
  const numPage = Math.max(1, parseInt(page, 10) || 1);
  const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const skip = (numPage - 1) * numLimit;

  const query = {};
  if (vendorId) query.vendorId = vendorId;
  if (status) query.status = status;

  const [confirmations, total] = await Promise.all([
    PaymentConfirmation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(numLimit)
      .populate('vendorId', 'firstName lastName email mobileNumber profilePhoto')
      .populate('paymentDestinationId')
      .populate('topUpRequestId'),
    PaymentConfirmation.countDocuments(query)
  ]);

  return {
    confirmations,
    pagination: {
      total,
      page: numPage,
      limit: numLimit,
      totalPages: Math.ceil(total / numLimit)
    }
  };
};

/**
 * 10. Get single confirmation by ID
 */
const getPaymentConfirmationById = async (id, vendorId = null) => {
  const query = { _id: id };
  if (vendorId) query.vendorId = vendorId;

  const confirmation = await PaymentConfirmation.findOne(query)
    .populate('vendorId', 'firstName lastName email mobileNumber profilePhoto')
    .populate('paymentDestinationId')
    .populate('topUpRequestId')
    .populate('verifiedBy', 'name email role');

  if (!confirmation) {
    throw new Error('Payment confirmation not found or unauthorized');
  }

  return confirmation;
};

/**
 * 11. Real-time check if transaction ID / UTR is available & unique
 */
const checkTransactionIdAvailable = async (transactionId) => {
  if (!transactionId || !transactionId.trim()) {
    return { isUnique: false, message: 'Transaction ID cannot be empty' };
  }
  const existing = await PaymentConfirmation.findOne({
    transactionId: transactionId.trim()
  });
  if (existing) {
    return {
      isUnique: false,
      message: 'Invalid: This Transaction ID / UTR reference has already been used in the system.'
    };
  }
  return {
    isUnique: true,
    message: 'Valid: Transaction ID is unique and available.'
  };
};

module.exports = {
  createTopUpRequest,
  getVendorTopUps,
  getTopUpById,
  getAllTopUpsAdmin,
  adminRespondTopUp,
  submitPaymentConfirmation,
  adminApprovePayment,
  adminRejectPayment,
  getPaymentConfirmations,
  getPaymentConfirmationById,
  checkTransactionIdAvailable
};
