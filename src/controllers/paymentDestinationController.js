const destinationService = require('../services/paymentDestinationService');

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
 * @desc    Create a new payment destination (SuperAdmin)
 * @route   POST /api/admin/payment-destinations
 * @access  Private (SuperAdmin)
 */
const createDestination = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const destination = await destinationService.createDestination(req.body, adminId);
    return sendSuccess(res, 201, 'Payment destination created successfully', { destination });
  } catch (error) {
    console.error('createDestination Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to create payment destination');
  }
};

/**
 * @desc    Get all payment destinations (Admin: all, Vendor: active only)
 * @route   GET /api/admin/payment-destinations (and /api/vendors/payment-destinations)
 * @access  Private (Vendor / Admin)
 */
const getDestinations = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'vendor') {
      filter.isActive = true;
    } else if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true' || req.query.isActive === true;
    }
    if (req.query.type) {
      filter.type = req.query.type;
    }

    const destinations = await destinationService.getAllDestinations(filter);
    return sendSuccess(res, 200, 'Payment destinations retrieved successfully', { destinations });
  } catch (error) {
    console.error('getDestinations Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve payment destinations');
  }
};

/**
 * @desc    Get single payment destination by ID
 * @route   GET /api/admin/payment-destinations/:id
 * @access  Private (Admin)
 */
const getDestinationById = async (req, res) => {
  try {
    const destination = await destinationService.getDestinationById(req.params.id);
    if (!destination) {
      return sendError(res, 404, 'Payment destination not found');
    }
    return sendSuccess(res, 200, 'Payment destination retrieved successfully', { destination });
  } catch (error) {
    console.error('getDestinationById Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve payment destination');
  }
};

/**
 * @desc    Update payment destination (SuperAdmin)
 * @route   PATCH /api/admin/payment-destinations/:id
 * @access  Private (SuperAdmin)
 */
const updateDestination = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const destination = await destinationService.updateDestination(req.params.id, req.body, adminId);
    if (!destination) {
      return sendError(res, 404, 'Payment destination not found');
    }
    return sendSuccess(res, 200, 'Payment destination updated successfully', { destination });
  } catch (error) {
    console.error('updateDestination Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to update payment destination');
  }
};

/**
 * @desc    Delete payment destination (SuperAdmin)
 * @route   DELETE /api/admin/payment-destinations/:id
 * @access  Private (SuperAdmin)
 */
const deleteDestination = async (req, res) => {
  try {
    const destination = await destinationService.deleteDestination(req.params.id);
    if (!destination) {
      return sendError(res, 404, 'Payment destination not found');
    }
    return sendSuccess(res, 200, 'Payment destination deleted successfully');
  } catch (error) {
    console.error('deleteDestination Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to delete payment destination');
  }
};

module.exports = {
  createDestination,
  getDestinations,
  getDestinationById,
  updateDestination,
  deleteDestination
};
