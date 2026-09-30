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
router.post('/wallets', authMiddleware, vendorAuth, addWallet);
router.get('/wallets', authMiddleware, vendorAuth, getWallets);
router.put(
  '/wallets/:walletSubId',
  authMiddleware,
  vendorAuth,
  validateObjectId('walletSubId'),
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

module.exports = router;
