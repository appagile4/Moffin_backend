const express = require('express');
const router = express.Router();

// Admin Auth
const {
  adminLogin,
  getAdminProfile
} = require('../controllers/adminAuthController');

// Vendor Management
const {
  getPendingVendors,
  getAllVendors,
  getVendorById,
  approveVendor,
  rejectVendor,
  activateVendor,
  deactivateVendor
} = require('../controllers/vendorController');

// TopUp Management
const {
  adminGetAllTopUps,
  adminRespondTopUp,
  adminGetAllConfirmations,
  adminApprovePayment,
  adminRejectPayment
} = require('../controllers/topUpController');

// Payment Destinations
const {
  createDestination,
  getDestinations,
  getDestinationById,
  updateDestination,
  deleteDestination,
  toggleDestinationActive
} = require('../controllers/paymentDestinationController');

// Wallets & Ledger
const {
  adminGetVendorWallet,
  adminGetVendorTransactions
} = require('../controllers/walletController');

// FCFS & Client Allocation
const {
  getQueue,
  reorderQueue,
  getClientTransactions
} = require('../controllers/fcfsController');

// Tiers
const {
  getTiers,
  createTier,
  updateTier
} = require('../controllers/tierController');

// Middleware
const {
  authMiddleware,
  validateObjectId
} = require('../middleware/authMiddleware');

const {
  adminAuth,
  superAdminAuth
} = require('../middleware/roleMiddleware');

const upload = require('../middleware/uploadMiddleware');

// =============================================================================
// 1. ADMIN AUTHENTICATION (Login only, no registration)
// =============================================================================
router.post('/login', adminLogin);
router.get('/me', authMiddleware, adminAuth, getAdminProfile);

// =============================================================================
// 2. VENDOR APPROVAL & ACCOUNT MANAGEMENT
// =============================================================================
router.get('/vendors/pending', authMiddleware, adminAuth, getPendingVendors);
router.get('/vendors', authMiddleware, adminAuth, getAllVendors);
router.get('/vendors/:vendorId', authMiddleware, adminAuth, validateObjectId('vendorId'), getVendorById);
router.patch('/vendors/:vendorId/approve', authMiddleware, superAdminAuth, validateObjectId('vendorId'), approveVendor);
router.patch('/vendors/:vendorId/reject', authMiddleware, superAdminAuth, validateObjectId('vendorId'), rejectVendor);
router.patch('/vendors/:vendorId/activate', authMiddleware, superAdminAuth, validateObjectId('vendorId'), activateVendor);
router.patch('/vendors/:vendorId/deactivate', authMiddleware, superAdminAuth, validateObjectId('vendorId'), deactivateVendor);

// =============================================================================
// 3. TOP-UP REQUEST MANAGEMENT
// =============================================================================
router.get('/topups', authMiddleware, adminAuth, adminGetAllTopUps);
router.post('/topups/:id/respond', authMiddleware, adminAuth, validateObjectId('id'), adminRespondTopUp);

// =============================================================================
// 4. PAYMENT VERIFICATION & APPROVAL / REJECTION
// =============================================================================
router.get('/payment-confirmations', authMiddleware, adminAuth, adminGetAllConfirmations);
router.post(
  ['/payment-confirmations/:id/approve', '/topups/:id/approve'],
  authMiddleware,
  superAdminAuth,
  validateObjectId('id'),
  adminApprovePayment
);
router.post(
  ['/payment-confirmations/:id/reject', '/topups/:id/reject'],
  authMiddleware,
  superAdminAuth,
  validateObjectId('id'),
  adminRejectPayment
);

// =============================================================================
// 5. COMPANY PAYMENT DESTINATIONS (Bank / Wallet)
// =============================================================================
router.get('/payment-destinations', authMiddleware, adminAuth, getDestinations);
router.post('/payment-destinations', authMiddleware, superAdminAuth, upload.single('qrCode'), createDestination);
router.get('/payment-destinations/:id', authMiddleware, adminAuth, validateObjectId('id'), getDestinationById);
router.patch('/payment-destinations/:id', authMiddleware, superAdminAuth, validateObjectId('id'), upload.single('qrCode'), updateDestination);
router.patch('/payment-destinations/:id/toggle', authMiddleware, superAdminAuth, validateObjectId('id'), toggleDestinationActive);
router.delete('/payment-destinations/:id', authMiddleware, superAdminAuth, validateObjectId('id'), deleteDestination);

// =============================================================================
// 6. VENDOR WALLET & LEDGER MONITORING
// =============================================================================
router.get('/vendors/:vendorId/wallet', authMiddleware, adminAuth, validateObjectId('vendorId'), adminGetVendorWallet);
router.get('/vendors/:vendorId/transactions', authMiddleware, adminAuth, validateObjectId('vendorId'), adminGetVendorTransactions);

// =============================================================================
// 7. FCFS PRIORITY QUEUE & CLIENT TRANSACTIONS
// =============================================================================
router.get('/fcfs/vendors', authMiddleware, adminAuth, getQueue);
router.patch('/fcfs/reorder', authMiddleware, superAdminAuth, reorderQueue);
router.get('/fcfs/transactions', authMiddleware, adminAuth, getClientTransactions);

// =============================================================================
// 8. VENDOR TIERS & COMMISSION RULES
// =============================================================================
router.get('/tiers', authMiddleware, adminAuth, getTiers);
router.post('/tiers', authMiddleware, superAdminAuth, createTier);
router.patch('/tiers/:id', authMiddleware, superAdminAuth, validateObjectId('id'), updateTier);
// =============================================================================
// 9. AUDIT LOGS
// =============================================================================
const AuditLog = require('../models/auditLogModel');
router.get('/audit-logs', authMiddleware, adminAuth, async (req, res, next) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(100);
    res.status(200).json({ success: true, count: logs.length, data: { logs } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
