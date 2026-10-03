const express = require('express');
const router = express.Router();

const {
  registerClient,
  loginClient,
  getClientProfile
} = require('../controllers/clientAuthController');

const {
  allocateTransaction
} = require('../controllers/fcfsController');

const {
  authMiddleware,
  clientAuth
} = require('../middleware/authMiddleware');

const {
  clientRoleAuth
} = require('../middleware/roleMiddleware');

// =============================================================================
// 1. PUBLIC AUTHENTICATION ROUTES
// =============================================================================
router.post('/register', registerClient);
router.post('/login', loginClient);

// =============================================================================
// 2. PROTECTED CLIENT PROFILE ROUTES
// =============================================================================
router.get('/profile', authMiddleware, clientRoleAuth, clientAuth, getClientProfile);
router.get('/me', authMiddleware, clientRoleAuth, clientAuth, getClientProfile);

// =============================================================================
// 3. FCFS TRANSACTION ALLOCATION (Existing Route)
// =============================================================================
router.post('/transactions/allocate', allocateTransaction);

module.exports = router;
