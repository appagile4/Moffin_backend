const fcfsService = require('../services/fcfsService');
const allocationService = require('../services/allocationService');

/**
 * Standard helpers
 */
const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const sendError = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, message });
};

/**
 * @desc    Get FCFS Queue list (Admin / SuperAdmin)
 * @route   GET /api/admin/fcfs/vendors
 * @access  Private (Admin / SuperAdmin)
 */
const getQueue = async (req, res) => {
  try {
    const { isActive, page, limit } = req.query;
    const result = await fcfsService.getQueue({ isActive, page, limit });
    return sendSuccess(res, 200, 'FCFS queue retrieved successfully', result);
  } catch (error) {
    console.error('getQueue Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve FCFS queue');
  }
};

/**
 * @desc    Get Vendor's individual FCFS Queue status
 * @route   GET /api/vendors/fcfs-status
 * @access  Private (Vendor)
 */
const getVendorQueueStatus = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const status = await fcfsService.getVendorQueueStatus(vendorId);
    return sendSuccess(res, 200, 'Vendor FCFS status retrieved successfully', { status });
  } catch (error) {
    console.error('getVendorQueueStatus Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve FCFS status');
  }
};

/**
 * @desc    Reorder vendor priority position (SuperAdmin only)
 * @route   PATCH /api/admin/fcfs/reorder
 * @access  Private (SuperAdmin)
 */
const reorderQueue = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { vendorId, newPriorityPosition } = req.body;

    if (!vendorId || !newPriorityPosition) {
      return sendError(res, 400, 'Please provide vendorId and newPriorityPosition');
    }

    const updated = await fcfsService.reorderQueue(vendorId, newPriorityPosition, adminId);
    return sendSuccess(res, 200, 'FCFS priority reordered successfully', { queueEntry: updated });
  } catch (error) {
    console.error('reorderQueue Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to reorder FCFS queue');
  }
};

/**
 * @desc    Allocate client transaction to next eligible FCFS vendor
 * @route   POST /api/client/transactions/allocate (or /api/fcfs/allocate)
 * @access  Public / System / Client API
 */
const allocateTransaction = async (req, res) => {
  try {
    const { clientId, requestedAmount, clientReference } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || null;

    const result = await allocationService.allocateClientTransaction({
      clientId,
      requestedAmount,
      clientReference,
      ipAddress
    });

    return sendSuccess(res, 200, 'Client transaction allocated successfully', result);
  } catch (error) {
    console.error('allocateTransaction Error:', error.message);
    return sendError(res, 400, error.message || 'Transaction allocation failed');
  }
};

/**
 * @desc    Get all allocated client transactions (Admin)
 * @route   GET /api/admin/fcfs/transactions
 * @access  Private (Admin)
 */
const getClientTransactions = async (req, res) => {
  try {
    const { page, limit, vendorId, clientId } = req.query;
    const result = await allocationService.getClientTransactions({
      page,
      limit,
      vendorId,
      clientId
    });
    return sendSuccess(res, 200, 'Client transactions retrieved successfully', result);
  } catch (error) {
    console.error('getClientTransactions Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to fetch client transactions');
  }
};

module.exports = {
  getQueue,
  getVendorQueueStatus,
  reorderQueue,
  allocateTransaction,
  getClientTransactions
};
