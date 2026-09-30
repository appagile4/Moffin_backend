const tierService = require('../services/tierService');

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
 * @desc    Get all vendor tiers
 * @route   GET /api/admin/tiers (and /api/vendors/tiers)
 * @access  Private (Vendor / Admin)
 */
const getTiers = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'vendor') {
      filter.isActive = true;
    } else if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true' || req.query.isActive === true;
    }

    const tiers = await tierService.getAllTiers(filter);
    return sendSuccess(res, 200, 'Vendor tiers retrieved successfully', { tiers });
  } catch (error) {
    console.error('getTiers Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve tiers');
  }
};

/**
 * @desc    Create a new vendor tier (SuperAdmin)
 * @route   POST /api/admin/tiers
 * @access  Private (SuperAdmin)
 */
const createTier = async (req, res) => {
  try {
    const tier = await tierService.createTier(req.body);
    return sendSuccess(res, 201, 'Vendor tier created successfully', { tier });
  } catch (error) {
    console.error('createTier Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to create tier');
  }
};

/**
 * @desc    Update a vendor tier (SuperAdmin)
 * @route   PATCH /api/admin/tiers/:id
 * @access  Private (SuperAdmin)
 */
const updateTier = async (req, res) => {
  try {
    const tier = await tierService.updateTier(req.params.id, req.body);
    if (!tier) {
      return sendError(res, 404, 'Vendor tier not found');
    }
    return sendSuccess(res, 200, 'Vendor tier updated successfully', { tier });
  } catch (error) {
    console.error('updateTier Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to update tier');
  }
};

module.exports = {
  getTiers,
  createTier,
  updateTier
};
