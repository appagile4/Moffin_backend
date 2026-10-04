const allocationService = require('../services/allocationService');
const paymentSubmissionService = require('../services/paymentSubmissionService');
const ClientTransaction = require('../models/clientTransactionModel');
const Client = require('../models/clientModel');

/**
 * Standard HTTP response helpers
 */
const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const sendError = (res, statusCode, message, data = null) => {
  const payload = { success: false, message };
  if (data !== null) payload.data = data;
  return res.status(statusCode).json(payload);
};

/**
 * @desc    Client creates Payment Request & triggers FCFS Vendor Allocation (Stage 1)
 * @route   POST /api/client/payment-request
 * @access  Private (Authenticated Client)
 */
const createPaymentRequest = async (req, res) => {
  try {
    const clientId = req.user?.id || req.client?._id;
    if (!clientId) {
      return sendError(res, 401, 'Unauthorized. Client authentication is required.');
    }

    const { paymentMethod, amount, clientReference } = req.body;

    // Amount validation
    if (amount === undefined || amount === null || amount === '') {
      return sendError(res, 400, 'Amount is required');
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || !isFinite(numAmount) || numAmount <= 0) {
      return sendError(res, 400, 'Amount must be a valid numeric value greater than 0');
    }

    // Payment method validation
    if (!paymentMethod) {
      return sendError(res, 400, 'Payment method is required (must be "bank" or "wallet")');
    }

    const normalizedMethod = paymentMethod.toString().toLowerCase().trim();
    if (!['bank', 'wallet'].includes(normalizedMethod)) {
      return sendError(res, 400, 'Invalid payment method. Only "bank" or "wallet" are accepted.');
    }

    const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey || null;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await allocationService.createClientPaymentRequest({
      clientId,
      paymentMethod: normalizedMethod,
      amount: numAmount,
      clientReference,
      idempotencyKey,
      ipAddress
    });

    if (!result.assigned && result.status === 'PENDING') {
      return res.status(422).json({
        success: false,
        message: result.message || 'No eligible vendor is currently available for this payment request',
        data: {
          status: 'PENDING'
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Payment request assigned successfully',
      data: {
        transactionId: result.transactionId,
        amount: result.amount,
        paymentMethod: result.paymentMethod,
        status: result.status,
        paymentDetails: result.paymentDetails,
        tierAtTransaction: result.tierAtTransaction || null,
        commissionPercentage: result.commissionPercentage !== undefined ? result.commissionPercentage : 0,
        commissionAmount: result.commissionAmount !== undefined ? result.commissionAmount : 0
      }
    });
  } catch (error) {
    console.error('createPaymentRequest Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to process payment request');
  }
};

/**
 * @desc    Client Submits Payment Details for Assigned Vendor Request (Stage 2)
 * @route   POST /api/client/payment/submit (or /api/client/payment-submit)
 * @access  Private (Authenticated Client)
 */
const submitPayment = async (req, res) => {
  try {
    const clientId = req.user?.id || req.client?._id;
    if (!clientId) {
      return sendError(res, 401, 'Unauthorized. Client authentication is required.');
    }

    const {
      paymentRequestId,
      transactionId,
      amount,
      paymentMethod,
      walletId,
      bankId
    } = req.body;

    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await paymentSubmissionService.submitClientPayment({
      clientId,
      paymentRequestId: paymentRequestId || req.body.transactionIdInternal || req.body.id,
      amount,
      paymentMethod,
      transactionId,
      walletId,
      bankId,
      ipAddress
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('submitPayment Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to submit payment details');
  }
};

/**
 * @desc    Get Client Platform Balance & Ledger Transactions
 * @route   GET /api/client/balance
 * @access  Private (Authenticated Client)
 */
const getClientBalance = async (req, res) => {
  try {
    const clientId = req.user?.id || req.client?._id;
    const { page, limit } = req.query;

    const result = await paymentSubmissionService.getClientBalanceAndHistory(clientId, { page, limit });
    return sendSuccess(res, 200, 'Client balance retrieved successfully', result);
  } catch (error) {
    console.error('getClientBalance Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve client balance');
  }
};

/**
 * @desc    Get Client's own Payment Requests / Transactions
 * @route   GET /api/client/payment-requests (or /api/client/transactions)
 * @access  Private (Authenticated Client)
 */
const getClientPaymentRequests = async (req, res) => {
  try {
    const clientId = req.user?.id || req.client?._id;
    const { page = 1, limit = 20, status = null } = req.query;

    const numPage = Math.max(1, parseInt(page, 10) || 1);
    const numLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (numPage - 1) * numLimit;

    const query = { clientId: clientId.toString() };
    if (status && status !== 'all') {
      query.status = status;
    }

    const [transactions, total] = await Promise.all([
      ClientTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numLimit)
        .select(
          'transactionId externalTransactionId requestedAmount allocatedAmount submittedAmount approvedAmount paymentMethod status allocationStatus paymentDetails tierAtTransaction commissionPercentage commissionAmount rejectionReason submittedAt approvedAt createdAt'
        ),
      ClientTransaction.countDocuments(query)
    ]);

    return sendSuccess(res, 200, 'Client payment requests retrieved successfully', {
      transactions,
      pagination: {
        total,
        page: numPage,
        limit: numLimit,
        totalPages: Math.ceil(total / numLimit)
      }
    });
  } catch (error) {
    console.error('getClientPaymentRequests Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve payment requests');
  }
};

module.exports = {
  createPaymentRequest,
  submitPayment,
  getClientBalance,
  getClientPaymentRequests
};
