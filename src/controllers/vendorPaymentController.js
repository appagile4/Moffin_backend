const paymentSubmissionService = require('../services/paymentSubmissionService');

/**
 * Standard response helpers
 */
const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const sendError = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, message });
};

/**
 * @desc    Vendor gets incoming assigned payment requests
 * @route   GET /api/vendors/payment-requests (or /api/vendor/payment-requests)
 * @access  Private (Vendor)
 */
const getVendorPaymentRequests = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.vendor?._id;
    const { page, limit, status } = req.query;

    const result = await paymentSubmissionService.getVendorPaymentRequests(vendorId, {
      page,
      limit,
      status
    });

    return sendSuccess(res, 200, 'Assigned payment requests retrieved successfully', result);
  } catch (error) {
    console.error('getVendorPaymentRequests Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve payment requests');
  }
};

/**
 * @desc    Vendor gets single payment request details
 * @route   GET /api/vendors/payment/:paymentId (or /api/vendor/payment/:paymentId)
 * @access  Private (Vendor)
 */
const getVendorPaymentById = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.vendor?._id;
    const { paymentId } = req.params;

    const tx = await paymentSubmissionService.getVendorPaymentById(paymentId, vendorId);
    return sendSuccess(res, 200, 'Payment request details retrieved successfully', { transaction: tx });
  } catch (error) {
    console.error('getVendorPaymentById Error:', error.message);
    return sendError(res, 404, error.message || 'Payment request not found');
  }
};

/**
 * @desc    Vendor approves client payment & triggers Atomic Settlement
 * @route   POST /api/vendors/payment/:paymentId/approve (or /api/vendor/payment/:paymentId/approve)
 * @access  Private (Vendor)
 */
const approvePayment = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.vendor?._id;
    const { paymentId } = req.params;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await paymentSubmissionService.vendorApprovePayment(paymentId, vendorId, ipAddress);
    return res.status(200).json(result);
  } catch (error) {
    console.error('approvePayment Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to approve payment');
  }
};

/**
 * @desc    Vendor rejects client payment
 * @route   POST /api/vendors/payment/:paymentId/reject (or /api/vendor/payment/:paymentId/reject)
 * @access  Private (Vendor)
 */
const rejectPayment = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.vendor?._id;
    const { paymentId } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await paymentSubmissionService.vendorRejectPayment(paymentId, vendorId, reason, ipAddress);
    return res.status(200).json(result);
  } catch (error) {
    console.error('rejectPayment Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to reject payment');
  }
};

module.exports = {
  getVendorPaymentRequests,
  getVendorPaymentById,
  approvePayment,
  rejectPayment
};
