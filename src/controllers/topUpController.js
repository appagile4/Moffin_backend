const topUpService = require('../services/topUpService');

/**
 * Standard helpers
 */
const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const sendError = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, message });
};

// =============================================================================
// VENDOR TOP-UP CONTROLLERS
// =============================================================================

/**
 * @desc    Vendor creates a top-up request
 * @route   POST /api/vendors/topups (or /api/vendor/topups)
 * @access  Private (Vendor)
 */
const createTopUp = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const {
      requestedAmount,
      preferredPaymentMethod,
      selectedBankAccountId,
      selectedBankAccountIds,
      selectedWalletId,
      selectedWalletIds,
      notes
    } = req.body;

    const topUp = await topUpService.createTopUpRequest(vendorId, {
      requestedAmount,
      preferredPaymentMethod,
      selectedBankAccountId,
      selectedBankAccountIds,
      selectedWalletId,
      selectedWalletIds,
      notes
    });

    return sendSuccess(res, 201, 'Top-up request created successfully', {
      topUpRequestId: topUp._id,
      topUpId: topUp.topUpId,
      requestedAmount: topUp.requestedAmount,
      preferredPaymentMethod: topUp.preferredPaymentMethod,
      status: topUp.status,
      createdAt: topUp.createdAt
    });
  } catch (error) {
    console.error('createTopUp Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to create top-up request');
  }
};

/**
 * @desc    Get authenticated vendor's top-up requests
 * @route   GET /api/vendors/topups
 * @access  Private (Vendor)
 */
const getVendorTopUps = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const { page, limit, status } = req.query;

    const result = await topUpService.getVendorTopUps(vendorId, { page, limit, status });
    return sendSuccess(res, 200, 'Top-up requests retrieved successfully', result);
  } catch (error) {
    console.error('getVendorTopUps Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve top-up requests');
  }
};

/**
 * @desc    Get single top-up request by ID
 * @route   GET /api/vendors/topups/:id
 * @access  Private (Vendor)
 */
const getTopUpById = async (req, res) => {
  try {
    const vendorId = req.user.role === 'vendor' ? (req.user.id || req.user._id) : null;
    const topUp = await topUpService.getTopUpById(req.params.id, vendorId);

    return sendSuccess(res, 200, 'Top-up details retrieved successfully', { topUp });
  } catch (error) {
    console.error('getTopUpById Error:', error.message);
    return sendError(res, 404, error.message || 'Top-up request not found');
  }
};

/**
 * @desc    Vendor submits payment confirmation with screenshot proof
 * @route   POST /api/vendors/topups/:id/payment-confirmation
 * @access  Private (Vendor)
 */
const submitPaymentConfirmation = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const topUpRequestId = req.params.id;
    const { amountPaid, paymentDestinationId, paymentMethod, transactionId, transactionDate, note } = req.body;
    const fileBuffer = req.file?.buffer;

    const confirmation = await topUpService.submitPaymentConfirmation(
      vendorId,
      topUpRequestId,
      {
        amountPaid,
        paymentDestinationId,
        paymentMethod,
        transactionId,
        transactionDate,
        note
      },
      fileBuffer
    );

    return sendSuccess(res, 201, 'Payment confirmation submitted successfully', {
      confirmationId: confirmation.confirmationId,
      status: confirmation.status,
      amountPaid: confirmation.amountPaid,
      transactionId: confirmation.transactionId,
      paymentProof: confirmation.paymentProof
    });
  } catch (error) {
    console.error('submitPaymentConfirmation Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to submit payment confirmation');
  }
};

/**
 * @desc    Get vendor's payment confirmations
 * @route   GET /api/vendors/payment-confirmations
 * @access  Private (Vendor)
 */
const getVendorConfirmations = async (req, res) => {
  try {
    const vendorId = req.user.id || req.user._id;
    const { page, limit, status } = req.query;

    const result = await topUpService.getPaymentConfirmations({ vendorId, page, limit, status });
    return sendSuccess(res, 200, 'Payment confirmations retrieved successfully', result);
  } catch (error) {
    console.error('getVendorConfirmations Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to retrieve payment confirmations');
  }
};

/**
 * @desc    Get single payment confirmation by ID
 * @route   GET /api/vendors/payment-confirmations/:id
 * @access  Private (Vendor)
 */
const getPaymentConfirmationById = async (req, res) => {
  try {
    const vendorId = req.user.role === 'vendor' ? (req.user.id || req.user._id) : null;
    const confirmation = await topUpService.getPaymentConfirmationById(req.params.id, vendorId);

    return sendSuccess(res, 200, 'Payment confirmation details retrieved successfully', {
      confirmation
    });
  } catch (error) {
    console.error('getPaymentConfirmationById Error:', error.message);
    return sendError(res, 404, error.message || 'Payment confirmation not found');
  }
};

// =============================================================================
// SUPERADMIN TOP-UP CONTROLLERS
// =============================================================================

/**
 * @desc    SuperAdmin: List all top-up requests
 * @route   GET /api/admin/topups
 * @access  Private (SuperAdmin / Admin)
 */
const adminGetAllTopUps = async (req, res) => {
  try {
    const { page, limit, status, vendorId } = req.query;
    const result = await topUpService.getAllTopUpsAdmin({ page, limit, status, vendorId });

    return sendSuccess(res, 200, 'All top-up requests retrieved successfully', result);
  } catch (error) {
    console.error('adminGetAllTopUps Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to fetch top-up requests');
  }
};

/**
 * @desc    SuperAdmin: Respond to vendor top-up with selected payment destinations
 * @route   POST /api/admin/topups/:id/respond
 * @access  Private (SuperAdmin / Admin)
 */
const adminRespondTopUp = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const topUpId = req.params.id;
    const {
      selectedDestinationIds,
      selectedDestinations,
      paymentDestinationId,
      destinationId,
      destinationIds,
      approvedAmount,
      adminMessage,
      adminNotes,
      notes
    } = req.body;

    const topUp = await topUpService.adminRespondTopUp(topUpId, adminId, {
      selectedDestinationIds: selectedDestinationIds || selectedDestinations,
      paymentDestinationId,
      destinationId,
      destinationIds,
      approvedAmount,
      adminMessage: adminMessage || adminNotes || notes
    });

    return sendSuccess(res, 200, 'Top-up request response submitted', {
      topUpRequestId: topUp._id,
      topUpId: topUp.topUpId,
      status: topUp.status,
      approvedAmount: topUp.adminResponse?.approvedAmount,
      selectedDestinations: topUp.adminResponse?.selectedDestinations
    });
  } catch (error) {
    console.error('adminRespondTopUp Error:', error.message);
    return sendError(res, 400, error.message || 'Failed to respond to top-up request');
  }
};

/**
 * @desc    SuperAdmin: List all payment confirmations
 * @route   GET /api/admin/payment-confirmations
 * @access  Private (SuperAdmin / Admin)
 */
const adminGetAllConfirmations = async (req, res) => {
  try {
    const { page, limit, status } = req.query;
    const result = await topUpService.getPaymentConfirmations({ page, limit, status });

    return sendSuccess(res, 200, 'All payment confirmations retrieved successfully', result);
  } catch (error) {
    console.error('adminGetAllConfirmations Error:', error.message);
    return sendError(res, 500, error.message || 'Failed to fetch payment confirmations');
  }
};

/**
 * @desc    SuperAdmin: Approve payment confirmation and atomically credit vendor balance
 * @route   POST /api/admin/payment-confirmations/:id/approve
 * @access  Private (SuperAdmin only)
 */
const adminApprovePayment = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const confirmationId = req.params.id;

    const result = await topUpService.adminApprovePayment(confirmationId, adminId);

    return sendSuccess(res, 200, 'Payment verified and vendor balance updated', {
      status: result.confirmation.status,
      creditedAmount: result.confirmation.amountPaid,
      vendorId: result.confirmation.vendorId,
      walletBalance: result.wallet.balance,
      transactionNumber: result.transaction.transactionNumber
    });
  } catch (error) {
    console.error('adminApprovePayment Error:', error.message);
    return sendError(res, 400, error.message || 'Payment approval failed');
  }
};

/**
 * @desc    SuperAdmin: Reject payment confirmation
 * @route   POST /api/admin/payment-confirmations/:id/reject
 * @access  Private (SuperAdmin only)
 */
const adminRejectPayment = async (req, res) => {
  try {
    const adminId = req.user.id || req.user._id;
    const confirmationId = req.params.id;
    const { rejectionReason } = req.body;

    const confirmation = await topUpService.adminRejectPayment(confirmationId, adminId, rejectionReason);

    return sendSuccess(res, 200, 'Payment confirmation rejected', {
      confirmationId: confirmation.confirmationId,
      status: confirmation.status,
      rejectionReason: confirmation.rejectionReason
    });
  } catch (error) {
    console.error('adminRejectPayment Error:', error.message);
    return sendError(res, 400, error.message || 'Payment rejection failed');
  }
};

/**
 * @desc    Check if a transaction ID is available / unique in real-time
 * @route   GET /api/vendors/topups/check-transaction-id
 * @access  Private (Vendor)
 */
const checkTransactionIdAvailability = async (req, res) => {
  try {
    const { transactionId } = req.query;
    if (!transactionId || !transactionId.trim()) {
      return sendError(res, 400, 'Transaction ID is required');
    }
    const result = await topUpService.checkTransactionIdAvailable(transactionId);
    return sendSuccess(res, 200, 'Transaction ID status', result);
  } catch (error) {
    console.error('checkTransactionIdAvailability Error:', error.message);
    return sendError(res, 500, 'Failed to verify transaction ID');
  }
};

module.exports = {
  // Vendor
  createTopUp,
  getVendorTopUps,
  getTopUpById,
  checkTransactionIdAvailability,
  submitPaymentConfirmation,
  getVendorConfirmations,
  getPaymentConfirmationById,

  // Admin
  adminGetAllTopUps,
  adminRespondTopUp,
  adminGetAllConfirmations,
  adminApprovePayment,
  adminRejectPayment
};
