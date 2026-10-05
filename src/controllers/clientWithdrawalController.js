const clientWithdrawalService = require('../services/clientWithdrawalService');

const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const sendError = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, message });
};

/**
 * Client: Create a new withdrawal request
 * @route POST /api/client/withdrawals
 */
const clientCreateWithdrawal = async (req, res) => {
  try {
    const clientId = req.user.id || req.user._id;
    const {
      amount,
      destinationType,
      destinationDetails,
      selectedAccountId,
      isManualDestination,
      notes
    } = req.body;

    const result = await clientWithdrawalService.createClientWithdrawalRequest({
      clientId,
      amount,
      destinationType,
      destinationDetails,
      selectedAccountId,
      isManualDestination,
      notes,
      ipAddress: req.ip
    });

    return sendSuccess(res, 201, result.message, { withdrawal: result.withdrawal });
  } catch (error) {
    console.error('clientCreateWithdrawal Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to create withdrawal request');
  }
};

/**
 * Client: Get all withdrawal requests for authenticated client
 * @route GET /api/client/withdrawals
 */
const clientGetWithdrawals = async (req, res) => {
  try {
    const clientId = req.user.id || req.user._id;
    const { page, limit, status } = req.query;

    const result = await clientWithdrawalService.getClientWithdrawals(clientId, {
      page,
      limit,
      status
    });

    return sendSuccess(res, 200, 'Withdrawal requests retrieved successfully', result);
  } catch (error) {
    console.error('clientGetWithdrawals Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to fetch withdrawal requests');
  }
};

/**
 * Client: Get specific withdrawal request / receipt details
 * @route GET /api/client/withdrawals/:id
 */
const clientGetWithdrawalById = async (req, res) => {
  try {
    const clientId = req.user.id || req.user._id;
    const { id } = req.params;

    const withdrawal = await clientWithdrawalService.getClientWithdrawalById(id, clientId);
    return sendSuccess(res, 200, 'Withdrawal request retrieved successfully', { withdrawal });
  } catch (error) {
    console.error('clientGetWithdrawalById Error:', error.message);
    return sendError(res, 404, error.message || 'Withdrawal request not found');
  }
};

/**
 * Client: Verify and approve received withdrawal payment ("Paisa aa gaya hai")
 * @route POST /api/client/withdrawals/:id/approve
 */
const clientApproveWithdrawal = async (req, res) => {
  try {
    const clientId = req.user.id || req.user._id;
    const { id } = req.params;

    const result = await clientWithdrawalService.clientApproveWithdrawal(id, clientId, req.ip);
    return sendSuccess(res, 200, result.message, result.data);
  } catch (error) {
    console.error('clientApproveWithdrawal Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to approve withdrawal');
  }
};

/**
 * Client: Reject withdrawal payment (not received)
 * @route POST /api/client/withdrawals/:id/reject
 */
const clientRejectWithdrawal = async (req, res) => {
  try {
    const clientId = req.user.id || req.user._id;
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const result = await clientWithdrawalService.clientRejectWithdrawal(id, clientId, rejectionReason, req.ip);
    return sendSuccess(res, 200, result.message, { withdrawal: result.withdrawal });
  } catch (error) {
    console.error('clientRejectWithdrawal Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to reject withdrawal');
  }
};

/**
 * Admin: Get all client withdrawal requests with statistics & filters
 * @route GET /api/admin/client-withdrawals
 */
const adminGetClientWithdrawals = async (req, res) => {
  try {
    const { page, limit, status, search } = req.query;

    const result = await clientWithdrawalService.adminGetClientWithdrawals({
      page,
      limit,
      status,
      search
    });

    return sendSuccess(res, 200, 'All client withdrawals retrieved successfully', result);
  } catch (error) {
    console.error('adminGetClientWithdrawals Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to fetch client withdrawals');
  }
};

/**
 * Admin: Get specific client withdrawal details with Client-to-Vendor transaction history & vendor commissions
 * @route GET /api/admin/client-withdrawals/:id
 */
const adminGetClientWithdrawalById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await clientWithdrawalService.adminGetClientWithdrawalDetails(id);
    return sendSuccess(res, 200, 'Client withdrawal details and transaction history retrieved successfully', result);
  } catch (error) {
    console.error('adminGetClientWithdrawalById Error:', error.message);
    return sendError(res, 404, error.message || 'Client withdrawal request not found');
  }
};

/**
 * Admin: Send payment proof, admin commission deduction, and UTR reference for client withdrawal
 * @route POST /api/admin/client-withdrawals/:id/send-payment
 */
const adminSendClientWithdrawalPayment = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { id } = req.params;
    const { adminCommission, adminCommissionPercentage, vendorCommissionDeducted, transactionId, adminNotes } = req.body;

    let paymentProof = null;
    if (req.file) {
      paymentProof = req.file.path || req.file.secure_url || req.file.url;
    } else if (req.body.paymentProof) {
      paymentProof = req.body.paymentProof;
    }

    const result = await clientWithdrawalService.adminSendClientWithdrawalPayment({
      withdrawalId: id,
      adminId,
      adminCommission: adminCommission !== undefined ? Number(adminCommission) : undefined,
      adminCommissionPercentage: adminCommissionPercentage !== undefined ? Number(adminCommissionPercentage) : undefined,
      vendorCommissionDeducted: vendorCommissionDeducted !== undefined ? Number(vendorCommissionDeducted) : undefined,
      transactionId,
      paymentProof,
      adminNotes,
      ipAddress: req.ip
    });

    return sendSuccess(res, 200, result.message, { withdrawal: result.withdrawal });
  } catch (error) {
    console.error('adminSendClientWithdrawalPayment Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to submit client withdrawal payment proof');
  }
};

/**
 * Admin: Get Profit Analytics, Client breakdown, and profit ledger records
 * @route GET /api/admin/profits
 */
const adminGetProfitAnalytics = async (req, res) => {
  try {
    const { page, limit, search, clientId, status } = req.query;

    const result = await clientWithdrawalService.adminGetProfitAnalytics({
      page,
      limit,
      search,
      clientId,
      status
    });

    return sendSuccess(res, 200, 'Admin profit analytics retrieved successfully', result);
  } catch (error) {
    console.error('adminGetProfitAnalytics Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to fetch profit analytics');
  }
};

module.exports = {
  clientCreateWithdrawal,
  clientGetWithdrawals,
  clientGetWithdrawalById,
  clientApproveWithdrawal,
  clientRejectWithdrawal,
  adminGetClientWithdrawals,
  adminGetClientWithdrawalById,
  adminSendClientWithdrawalPayment,
  adminGetProfitAnalytics
};
