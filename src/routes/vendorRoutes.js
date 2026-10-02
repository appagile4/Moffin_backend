const express = require('express');
const router = express.Router();

const {
  registerVendor,
  loginVendor,
  getVendorProfile,
  updateVendorProfile,
  uploadProfilePhoto,
  changeVendorPassword,
  addBankAccount,
  getBankAccounts,
  updateBankAccount,
  deleteBankAccount,
  setDefaultBankAccount,
  addWallet,
  getWallets,
  updateWallet,
  deleteWallet,
  setDefaultWallet
} = require('../controllers/vendorController');

const {
  createTopUp,
  getVendorTopUps,
  getTopUpById,
  checkTransactionIdAvailability,
  submitPaymentConfirmation,
  getVendorConfirmations,
  getPaymentConfirmationById
} = require('../controllers/topUpController');

const {
  getVendorWallet,
  getVendorTransactions,
  getVendorOverviewStats
} = require('../controllers/walletController');

const {
  getVendorQueueStatus
} = require('../controllers/fcfsController');

const {
  getDestinations
} = require('../controllers/paymentDestinationController');

const {
  getTiers,
  getVendorCurrentProgress,
  getVendorMonthlyHistory,
  getVendorTierMovements
} = require('../controllers/tierController');

const {
  authMiddleware,
  vendorAuth,
  validateObjectId
} = require('../middleware/authMiddleware');

const upload = require('../middleware/uploadMiddleware');

// =============================================================================
// 1. PUBLIC ROUTES (Authentication & Registration)
// =============================================================================
router.post('/register', upload.single('profilePhoto'), registerVendor);
router.post('/login', loginVendor);

// =============================================================================
// 2. VENDOR PROFILE ROUTES (Protected - Vendor only)
// =============================================================================
router.get('/me', authMiddleware, vendorAuth, getVendorProfile);
router.put('/me', authMiddleware, vendorAuth, upload.single('profilePhoto'), updateVendorProfile);
router.post('/me/profile-photo', authMiddleware, vendorAuth, upload.single('profilePhoto'), uploadProfilePhoto);
router.put('/change-password', authMiddleware, vendorAuth, changeVendorPassword);

// =============================================================================
// 3. BANK ACCOUNT MANAGEMENT ROUTES (Protected - Vendor only)
// =============================================================================
router.post('/bank-accounts', authMiddleware, vendorAuth, addBankAccount);
router.get('/bank-accounts', authMiddleware, vendorAuth, getBankAccounts);
router.put(
  '/bank-accounts/:bankAccountId',
  authMiddleware,
  vendorAuth,
  validateObjectId('bankAccountId'),
  updateBankAccount
);
router.delete(
  '/bank-accounts/:bankAccountId',
  authMiddleware,
  vendorAuth,
  validateObjectId('bankAccountId'),
  deleteBankAccount
);
router.patch(
  '/bank-accounts/:bankAccountId/default',
  authMiddleware,
  vendorAuth,
  validateObjectId('bankAccountId'),
  setDefaultBankAccount
);

// =============================================================================
// 4. WALLET MANAGEMENT ROUTES (Protected - Vendor only)
// =============================================================================
router.post('/wallets', authMiddleware, vendorAuth, upload.single('qrCode'), addWallet);
router.get('/wallets', authMiddleware, vendorAuth, getWallets);
router.put(
  '/wallets/:walletSubId',
  authMiddleware,
  vendorAuth,
  validateObjectId('walletSubId'),
  upload.single('qrCode'),
  updateWallet
);
router.delete(
  '/wallets/:walletSubId',
  authMiddleware,
  vendorAuth,
  validateObjectId('walletSubId'),
  deleteWallet
);
router.patch(
  '/wallets/:walletSubId/default',
  authMiddleware,
  vendorAuth,
  validateObjectId('walletSubId'),
  setDefaultWallet
);

// =============================================================================
// 5. TOP-UP REQUEST ROUTES (Protected - Vendor only)
// =============================================================================
router.post('/topups', authMiddleware, vendorAuth, createTopUp);
router.get('/topups', authMiddleware, vendorAuth, getVendorTopUps);
router.get('/topups/check-transaction-id', authMiddleware, vendorAuth, checkTransactionIdAvailability);
router.get('/topups/:id', authMiddleware, vendorAuth, validateObjectId('id'), getTopUpById);

// =============================================================================
// 6. PAYMENT CONFIRMATION & PROOF SUBMISSION (Protected - Vendor only)
// =============================================================================
router.post(
  ['/topups/:id/confirm-payment', '/topups/:id/payment-confirmation'],
  authMiddleware,
  vendorAuth,
  validateObjectId('id'),
  upload.single('paymentProof'),
  submitPaymentConfirmation
);
router.get('/payment-confirmations', authMiddleware, vendorAuth, getVendorConfirmations);
router.get(
  '/payment-confirmations/:id',
  authMiddleware,
  vendorAuth,
  validateObjectId('id'),
  getPaymentConfirmationById
);

// =============================================================================
// 7. FINANCIAL WALLET & LEDGER (Protected - Vendor only)
// =============================================================================
router.get('/wallet', authMiddleware, vendorAuth, getVendorWallet);
router.get('/wallet/overview-stats', authMiddleware, vendorAuth, getVendorOverviewStats);
router.get(['/wallet/transactions', '/wallet/ledger'], authMiddleware, vendorAuth, getVendorTransactions);

// =============================================================================
// 8. FCFS STATUS, PAYMENT DESTINATIONS & TIERS (Protected - Vendor only)
// =============================================================================
router.get('/fcfs-status', authMiddleware, vendorAuth, getVendorQueueStatus);
router.get('/payment-destinations', authMiddleware, vendorAuth, getDestinations);
router.get('/tiers', authMiddleware, vendorAuth, getTiers);
router.get('/tier-progress', authMiddleware, vendorAuth, getVendorCurrentProgress);
router.get('/monthly-history', authMiddleware, vendorAuth, getVendorMonthlyHistory);
router.get('/tier-movements', authMiddleware, vendorAuth, getVendorTierMovements);

module.exports = router;
