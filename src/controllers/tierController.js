const tierService = require('../services/tierService');
const {
  getOrCreateMonthlyRecord,
  recalculateVendorMonthlyTier,
  setManualCommission,
  removeManualCommission,
  getAdminMonthlyAnalytics,
  getKolkataDate
} = require('../services/tierCalculationService');
const { runMonthlyResetJob } = require('../jobs/monthlyTierResetJob');
const VendorMonthlyTier = require('../models/vendorMonthlyTierModel');
const TierMovementLog = require('../models/tierMovementLogModel');

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
 * 1. Get all vendor tiers
 * @route GET /api/admin/tiers and /api/vendors/tiers
 * @access Private
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
 * 2. Get tier by ID
 * @route GET /api/admin/tiers/:id
 * @access Private (Admin)
 */
const getTierById = async (req, res) => {
  try {
    const tier = await tierService.getTierById(req.params.id);
    return sendSuccess(res, 200, 'Vendor tier retrieved successfully', { tier });
  } catch (error) {
    console.error('getTierById Error:', error.message);
    return sendError(res, 404, error.message || 'Tier not found');
  }
};

/**
 * 3. Create a new vendor tier (SuperAdmin)
 * @route POST /api/admin/tiers
 * @access Private (SuperAdmin)
 */
const createTier = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const tier = await tierService.createTier(req.body, adminId);
    return sendSuccess(res, 201, 'Vendor tier created successfully', { tier });
  } catch (error) {
    console.error('createTier Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to create tier');
  }
};

/**
 * 4. Update a vendor tier (SuperAdmin)
 * @route PATCH /api/admin/tiers/:id
 * @access Private (SuperAdmin)
 */
const updateTier = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const tier = await tierService.updateTier(req.params.id, req.body, adminId);
    return sendSuccess(res, 200, 'Vendor tier updated successfully', { tier });
  } catch (error) {
    console.error('updateTier Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to update tier');
  }
};

/**
 * 5. Delete a vendor tier (SuperAdmin)
 * @route DELETE /api/admin/tiers/:id
 * @access Private (SuperAdmin)
 */
const deleteTier = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const result = await tierService.deleteTier(req.params.id, adminId);
    return sendSuccess(res, 200, result.message);
  } catch (error) {
    console.error('deleteTier Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to delete tier');
  }
};

/**
 * 6. Get vendor's current month tier progress (Vendor & Admin)
 * @route GET /api/vendors/tier-progress & GET /api/admin/vendors/:vendorId/tier-progress
 * @access Private
 */
const getVendorCurrentProgress = async (req, res) => {
  try {
    const vendorId = req.params.vendorId || req.user.id || req.user._id;
    const record = await recalculateVendorMonthlyTier(vendorId);

    const isMaxTier = !record.nextTierId || record.currentTierDisplayName === 'Ace';
    const progressData = {
      vendorId: record.vendorId,
      year: record.year,
      month: record.month,
      monthLabel: record.monthLabel,
      totalMonthlyTopUp: record.totalTopUp,
      currentTier: {
        id: record.currentTierId,
        name: record.currentTierName,
        displayName: record.currentTierDisplayName
      },
      currentTierName: record.currentTierDisplayName || record.currentTierName,
      nextTier: {
        id: record.nextTierId,
        name: record.nextTierName,
        displayName: record.nextTierName
      },
      nextTierName: record.nextTierName,
      amountToNextTier: record.amountToNextTier,
      progressPercentage: record.progressPercentage,
      isMaxTier,
      commissionMode: record.commissionMode,
      effectiveCommissionRate: record.effectiveCommissionRate,
      manualCommissionRate: record.manualCommissionRate,
      manualCommissionReason: record.manualCommissionReason,
      commission: {
        mode: record.commissionMode,
        effectiveRate: record.effectiveCommissionRate,
        manualRate: record.manualCommissionRate,
        manualReason: record.manualCommissionReason
      },
      lastUpdatedAt: record.lastUpdatedAt
    };

    return sendSuccess(res, 200, 'Current tier progress retrieved successfully', {
      progress: progressData,
      ...progressData
    });
  } catch (error) {
    console.error('getVendorCurrentProgress Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve progress');
  }
};

/**
 * 7. Get vendor's historical monthly performance records (Vendor & Admin)
 * @route GET /api/vendors/monthly-history & GET /api/admin/vendors/:vendorId/monthly-history
 * @access Private
 */
const getVendorMonthlyHistory = async (req, res) => {
  try {
    const vendorId = req.params.vendorId || req.user.id || req.user._id;
    const history = await VendorMonthlyTier.find({ vendorId })
      .sort({ year: -1, month: -1 });

    return sendSuccess(res, 200, 'Monthly tier history retrieved successfully', { history });
  } catch (error) {
    console.error('getVendorMonthlyHistory Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve history');
  }
};

/**
 * 8. Get vendor's tier movement transition logs (Vendor & Admin)
 * @route GET /api/vendors/tier-movements & GET /api/admin/vendors/:vendorId/tier-movements
 * @access Private
 */
const getVendorTierMovements = async (req, res) => {
  try {
    const rawVendorId = req.params.vendorId || req.user?.id || req.user?._id;
    if (!rawVendorId) {
      return sendError(res, 400, 'Vendor ID is required');
    }

    const query = mongoose.Types.ObjectId.isValid(rawVendorId)
      ? { $or: [{ vendorId: new mongoose.Types.ObjectId(rawVendorId) }, { vendorId: rawVendorId.toString() }] }
      : { vendorId: rawVendorId };

    const movements = await TierMovementLog.find(query)
      .sort({ changedAt: -1 })
      .limit(50);

    return sendSuccess(res, 200, 'Tier movement logs retrieved successfully', { movements });
  } catch (error) {
    console.error('getVendorTierMovements Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve logs');
  }
};

/**
 * 9. SuperAdmin: Set manual commission override on a vendor
 * @route POST /api/admin/vendors/:vendorId/manual-commission
 * @access Private (SuperAdmin)
 */
const handleSetManualCommission = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { vendorId } = req.params;
    const { rate, commissionRate, manualCommissionRate, reason } = req.body;

    const targetRate = commissionRate !== undefined
      ? commissionRate
      : (rate !== undefined ? rate : manualCommissionRate);

    const record = await setManualCommission(vendorId, { rate: targetRate, reason }, adminId);

    return sendSuccess(res, 200, 'Manual commission override assigned successfully', {
      commissionMode: record.commissionMode,
      effectiveCommissionRate: record.effectiveCommissionRate,
      manualCommissionRate: record.manualCommissionRate,
      manualCommissionReason: record.manualCommissionReason,
      currentTierId: record.currentTierId,
      currentTierName: record.currentTierName,
      currentTierDisplayName: record.currentTierDisplayName
    });
  } catch (error) {
    console.error('handleSetManualCommission Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to set manual commission');
  }
};

/**
 * 10. SuperAdmin: Remove manual commission override (restore AUTO)
 * @route DELETE /api/admin/vendors/:vendorId/manual-commission
 * @access Private (SuperAdmin)
 */
const handleRemoveManualCommission = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const { vendorId } = req.params;

    const record = await removeManualCommission(vendorId, adminId);

    return sendSuccess(res, 200, 'Manual commission override removed. Auto tier commission restored.', {
      commissionMode: record.commissionMode,
      effectiveCommissionRate: record.effectiveCommissionRate,
      currentTierId: record.currentTierId,
      currentTierName: record.currentTierName,
      currentTierDisplayName: record.currentTierDisplayName
    });
  } catch (error) {
    console.error('handleRemoveManualCommission Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to remove manual commission');
  }
};

/**
 * 11. SuperAdmin: Get Monthly Dashboard Analytics
 * @route GET /api/admin/tiers/analytics
 * @access Private (Admin / SuperAdmin)
 */
const getAdminTierAnalytics = async (req, res) => {
  try {
    const { year, month } = req.query;
    const analytics = await getAdminMonthlyAnalytics(year, month);
    return sendSuccess(res, 200, 'Monthly tier analytics retrieved successfully', { analytics });
  } catch (error) {
    console.error('getAdminTierAnalytics Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve analytics');
  }
};

/**
 * 12. SuperAdmin: Trigger Monthly Finalization / Reset
 * @route POST /api/admin/tiers/run-monthly-reset
 * @access Private (SuperAdmin)
 */
const handleRunMonthlyReset = async (req, res) => {
  try {
    const { year, month } = req.body;
    const result = await runMonthlyResetJob(year, month);
    return sendSuccess(res, 200, 'Monthly cycle finalization completed successfully', result);
  } catch (error) {
    console.error('handleRunMonthlyReset Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to run monthly reset');
  }
};

module.exports = {
  getTiers,
  getTierById,
  createTier,
  updateTier,
  deleteTier,
  getVendorCurrentProgress,
  getVendorMonthlyHistory,
  getVendorTierMovements,
  handleSetManualCommission,
  handleRemoveManualCommission,
  getAdminTierAnalytics,
  handleRunMonthlyReset
};
