const walletService = require('../services/walletService');

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
 * @desc    Get authenticated vendor's wallet balance
 * @route   GET /api/vendors/wallet
 * @access  Private (Vendor)
 */
const getVendorWallet = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const wallet = await walletService.getWalletBalance(vendorId);
    return sendSuccess(res, 200, 'Vendor wallet retrieved successfully', { wallet });
  } catch (error) {
    console.error('getVendorWallet Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve wallet');
  }
};

/**
 * @desc    Get authenticated vendor's wallet ledger transactions
 * @route   GET /api/vendors/wallet/transactions
 * @access  Private (Vendor)
 */
const getVendorTransactions = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const { page, limit, transactionType } = req.query;

    const result = await walletService.getWalletTransactions(vendorId, {
      page,
      limit,
      transactionType
    });
    return sendSuccess(res, 200, 'Wallet ledger transactions retrieved successfully', result);
  } catch (error) {
    console.error('getVendorTransactions Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve wallet transactions');
  }
};

/**
 * @desc    Admin: Get specific vendor's wallet
 * @route   GET /api/admin/vendors/:vendorId/wallet
 * @access  Private (Admin / SuperAdmin)
 */
const adminGetVendorWallet = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const wallet = await walletService.getWalletBalance(vendorId);
    return sendSuccess(res, 200, 'Vendor wallet retrieved successfully', { wallet });
  } catch (error) {
    console.error('adminGetVendorWallet Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve vendor wallet');
  }
};

/**
 * @desc    Admin: Get specific vendor's wallet ledger transactions
 * @route   GET /api/admin/vendors/:vendorId/transactions
 * @access  Private (Admin / SuperAdmin)
 */
const adminGetVendorTransactions = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page, limit, transactionType } = req.query;

    const result = await walletService.getWalletTransactions(vendorId, {
      page,
      limit,
      transactionType
    });
    return sendSuccess(res, 200, 'Vendor ledger transactions retrieved successfully', result);
  } catch (error) {
    console.error('adminGetVendorTransactions Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve vendor transactions');
  }
};

/**
 * @desc    Get authenticated vendor's live overview stats (Total top up, deposit, withdraw, commission)
 * @route   GET /api/vendors/wallet/overview-stats
 * @access  Private (Vendor)
 */
const getVendorOverviewStats = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const timeframe = req.query.timeframe || 'month';
    const stats = await walletService.getVendorOverviewStats(vendorId, timeframe);
    return sendSuccess(res, 200, 'Vendor overview statistics retrieved successfully', { stats });
  } catch (error) {
    console.error('getVendorOverviewStats Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve overview statistics');
  }
};

module.exports = {
  getVendorWallet,
  getVendorTransactions,
  getVendorOverviewStats,
  adminGetVendorWallet,
  adminGetVendorTransactions
};
