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

const {
  getClientBankAccounts,
  addClientBankAccount,
  updateClientBankAccount,
  deleteClientBankAccount,
  setDefaultClientBankAccount,
  toggleClientBankAccount,
  getClientWallets,
  addClientWallet,
  updateClientWallet,
  deleteClientWallet,
  setDefaultClientWallet,
  toggleClientWallet
} = require('../controllers/clientBankWalletController');

const upload = require('../middleware/uploadMiddleware');

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
// 2B. CLIENT BANK ACCOUNTS MANAGEMENT
// =============================================================================
router.get('/bank-accounts', authMiddleware, clientRoleAuth, clientAuth, getClientBankAccounts);
router.post('/bank-accounts', authMiddleware, clientRoleAuth, clientAuth, addClientBankAccount);
router.put('/bank-accounts/:bankAccountId', authMiddleware, clientRoleAuth, clientAuth, updateClientBankAccount);
router.delete('/bank-accounts/:bankAccountId', authMiddleware, clientRoleAuth, clientAuth, deleteClientBankAccount);
router.patch('/bank-accounts/:bankAccountId/default', authMiddleware, clientRoleAuth, clientAuth, setDefaultClientBankAccount);
router.patch('/bank-accounts/:bankAccountId/toggle', authMiddleware, clientRoleAuth, clientAuth, toggleClientBankAccount);

// =============================================================================
// 2C. CLIENT WALLETS & QR CODE MANAGEMENT
// =============================================================================
router.get('/wallets', authMiddleware, clientRoleAuth, clientAuth, getClientWallets);
router.post('/wallets', authMiddleware, clientRoleAuth, clientAuth, upload.single('qrCode'), addClientWallet);
router.put('/wallets/:walletId', authMiddleware, clientRoleAuth, clientAuth, upload.single('qrCode'), updateClientWallet);
router.delete('/wallets/:walletId', authMiddleware, clientRoleAuth, clientAuth, deleteClientWallet);
router.patch('/wallets/:walletId/default', authMiddleware, clientRoleAuth, clientAuth, setDefaultClientWallet);
router.patch('/wallets/:walletId/toggle', authMiddleware, clientRoleAuth, clientAuth, toggleClientWallet);

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
