const withdrawalService = require('../services/withdrawalService');

const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const sendError = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, message });
};

/**
 * Vendor: Create a new commission withdrawal request
 * @route POST /api/vendors/withdrawals
 */
const vendorCreateWithdrawal = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const {
      amount,
      destinationType,
      destinationDetails,
      selectedAccountId,
      isManualDestination,
      notes
    } = req.body;

    const result = await withdrawalService.createWithdrawalRequest({
      vendorId,
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
    console.error('vendorCreateWithdrawal Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to create withdrawal request');
  }
};

/**
 * Vendor: Get all withdrawal requests for authenticated vendor
 * @route GET /api/vendors/withdrawals
 */
const vendorGetWithdrawals = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const { page, limit, status } = req.query;

    const result = await withdrawalService.getVendorWithdrawals(vendorId, {
      page,
      limit,
      status
    });

    return sendSuccess(res, 200, 'Withdrawal requests retrieved successfully', result);
  } catch (error) {
    console.error('vendorGetWithdrawals Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to fetch withdrawal requests');
  }
};

/**
 * Vendor: Get specific withdrawal request details
 * @route GET /api/vendors/withdrawals/:id
 */
const vendorGetWithdrawalById = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const { id } = req.params;

    const withdrawal = await withdrawalService.getVendorWithdrawalById(id, vendorId);
    return sendSuccess(res, 200, 'Withdrawal request retrieved successfully', { withdrawal });
  } catch (error) {
    console.error('vendorGetWithdrawalById Error:', error.message);
    return sendError(res, 404, error.message || 'Withdrawal request not found');
  }
};

/**
 * Vendor: Verify and approve received withdrawal payment
 * @route POST /api/vendors/withdrawals/:id/approve
 */
const vendorApproveWithdrawal = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const { id } = req.params;

    const result = await withdrawalService.vendorApproveWithdrawal(id, vendorId, req.ip);
    return sendSuccess(res, 200, result.message, result.data);
  } catch (error) {
    console.error('vendorApproveWithdrawal Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to approve withdrawal');
  }
};

/**
 * Vendor: Reject withdrawal payment (not received)
 * @route POST /api/vendors/withdrawals/:id/reject
 */
const vendorRejectWithdrawal = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const { id } = req.params;
    const { rejectionReason } = req.body;

    const result = await withdrawalService.vendorRejectWithdrawal(id, vendorId, rejectionReason, req.ip);
    return sendSuccess(res, 200, result.message, { withdrawal: result.withdrawal });
  } catch (error) {
    console.error('vendorRejectWithdrawal Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to reject withdrawal');
  }
};

/**
 * Admin: Get all vendor withdrawal requests with stats
 * @route GET /api/admin/withdrawals
 */
const adminGetWithdrawals = async (req, res) => {
  try {
    const { page, limit, status, search } = req.query;

    const result = await withdrawalService.adminGetWithdrawals({
      page,
      limit,
      status,
      search
    });

    return sendSuccess(res, 200, 'All vendor withdrawals retrieved successfully', result);
  } catch (error) {
    console.error('adminGetWithdrawals Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to fetch vendor withdrawals');
  }
};

/**
 * Admin: Get specific withdrawal request details
 * @route GET /api/admin/withdrawals/:id
 */
const adminGetWithdrawalById = async (req, res) => {
  try {
    const { id } = req.params;
    const withdrawal = await withdrawalService.getVendorWithdrawalById(id);
    return sendSuccess(res, 200, 'Withdrawal request retrieved successfully', { withdrawal });
  } catch (error) {
    console.error('adminGetWithdrawalById Error:', error.message);
    return sendError(res, 404, error.message || 'Withdrawal request not found');
  }
};

/**
 * Admin: Send payment proof and UTR reference for a withdrawal request
 * @route POST /api/admin/withdrawals/:id/send-payment
 */
const adminSendWithdrawalPayment = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { id } = req.params;
    const { transactionId, adminNotes } = req.body;

    let paymentProof = null;
    if (req.file) {
      paymentProof = req.file.path || req.file.secure_url || req.file.url;
    } else if (req.body.paymentProof) {
      paymentProof = req.body.paymentProof;
    }

    const result = await withdrawalService.adminSendWithdrawalPayment({
      withdrawalId: id,
      adminId,
      transactionId,
      paymentProof,
      adminNotes,
      ipAddress: req.ip
    });

    return sendSuccess(res, 200, result.message, { withdrawal: result.withdrawal });
  } catch (error) {
    console.error('adminSendWithdrawalPayment Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to submit withdrawal payment proof');
  }
};

module.exports = {
  vendorCreateWithdrawal,
  vendorGetWithdrawals,
  vendorGetWithdrawalById,
  vendorApproveWithdrawal,
  vendorRejectWithdrawal,
  adminGetWithdrawals,
  adminGetWithdrawalById,
  adminSendWithdrawalPayment
};
