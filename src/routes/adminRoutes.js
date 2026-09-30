const express = require('express');
const router = express.Router();

const {
  getPendingVendors,
  getAllVendors,
  getVendorById,
  approveVendor,
  rejectVendor,
  activateVendor,
  deactivateVendor
} = require('../controllers/vendorController');

const {
  authMiddleware,
  validateObjectId
} = require('../middleware/authMiddleware');

const {
  adminAuth,
  superAdminAuth
} = require('../middleware/roleMiddleware');

const {
  adminLogin,
  getAdminProfile
} = require('../controllers/adminAuthController');

// =============================================================================
// 1. ADMIN AUTHENTICATION (Login only, no registration)
// =============================================================================
router.post('/login', adminLogin);
router.get('/me', authMiddleware, adminAuth, getAdminProfile);

// =============================================================================
// 2. ADMIN / SUPERADMIN VENDOR MANAGEMENT & APPROVAL ROUTES
// =============================================================================

// List pending vendors (Admin & SuperAdmin)
router.get('/vendors/pending', authMiddleware, adminAuth, getPendingVendors);

// List all vendors with filtering, pagination & search (Admin & SuperAdmin)
router.get('/vendors', authMiddleware, adminAuth, getAllVendors);

// Get complete vendor details by ID (Admin & SuperAdmin)
router.get('/vendors/:vendorId', authMiddleware, adminAuth, validateObjectId('vendorId'), getVendorById);

// Approve vendor verification (SuperAdmin only)
router.patch(
  '/vendors/:vendorId/approve',
  authMiddleware,
  superAdminAuth,
  validateObjectId('vendorId'),
  approveVendor
);

// Reject vendor verification (SuperAdmin only)
router.patch(
  '/vendors/:vendorId/reject',
  authMiddleware,
  superAdminAuth,
  validateObjectId('vendorId'),
  rejectVendor
);

// Activate vendor account (SuperAdmin only)
router.patch(
  '/vendors/:vendorId/activate',
  authMiddleware,
  superAdminAuth,
  validateObjectId('vendorId'),
  activateVendor
);

// Deactivate vendor account (SuperAdmin only)
router.patch(
  '/vendors/:vendorId/deactivate',
  authMiddleware,
  superAdminAuth,
  validateObjectId('vendorId'),
  deactivateVendor
);

module.exports = router;
