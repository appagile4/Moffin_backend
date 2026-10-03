const express = require('express');
const router = express.Router();

const {
  registerClient,
  loginClient,
  getClientProfile,
  updateClientProfile
} = require('../controllers/clientAuthController');

const {
  createPaymentRequest,
  submitPayment,
  getClientBalance,
  getClientPaymentRequests
} = require('../controllers/clientPaymentController');

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
router.put('/profile', authMiddleware, clientRoleAuth, clientAuth, updateClientProfile);
router.put('/me', authMiddleware, clientRoleAuth, clientAuth, updateClientProfile);

// =============================================================================
// 3. CLIENT BALANCE & TRANSACTION HISTORY
// =============================================================================
router.get('/balance', authMiddleware, clientRoleAuth, clientAuth, getClientBalance);
router.get('/transactions', authMiddleware, clientRoleAuth, clientAuth, getClientPaymentRequests);

// =============================================================================
// 4. CLIENT PAYMENT REQUEST & FCFS VENDOR ALLOCATION (STAGE 1)
// =============================================================================
router.post('/payment-request', authMiddleware, clientRoleAuth, clientAuth, createPaymentRequest);
router.post('/payment-requests', authMiddleware, clientRoleAuth, clientAuth, createPaymentRequest);
router.get('/payment-requests', authMiddleware, clientRoleAuth, clientAuth, getClientPaymentRequests);

// =============================================================================
// 5. CLIENT PAYMENT SUBMISSION & UTR CONFIRMATION (STAGE 2)
// =============================================================================
router.post('/payment/submit', authMiddleware, clientRoleAuth, clientAuth, submitPayment);
router.post('/payment-submit', authMiddleware, clientRoleAuth, clientAuth, submitPayment);

// =============================================================================
// 6. LEGACY / SYSTEM FCFS ALLOCATION
// =============================================================================
router.post('/transactions/allocate', allocateTransaction);

module.exports = router;
