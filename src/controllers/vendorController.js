const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Vendor = require('../models/vendorModel');
const VendorMonthlyTier = require('../models/vendorMonthlyTierModel');
const { getKolkataDate } = require('../services/tierCalculationService');
const { uploadToCloudinary } = require('../config/cloudinary');
const { syncVendorToQueue } = require('../services/fcfsService');

/**
 * Helper: Generate JWT Token
 */
const generateToken = (vendorId) => {
  return jwt.sign(
    { id: vendorId, role: 'vendor' },
    process.env.JWT_SECRET || 'moffin_jwt_secret_key_default_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Helper: Validate MongoDB ObjectId
 */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Helper: Send standardized success response
 */
const sendSuccess = (res, statusCode, message, data = {}) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

/**
 * Helper: Send standardized error response
 */
const sendError = (res, statusCode, message) => {
  return res.status(statusCode).json({
    success: false,
    message
  });
};

// =============================================================================
// 1. AUTH / REGISTRATION CONTROLLERS
// =============================================================================

/**
 * @desc    Register a new vendor
 * @route   POST /api/vendors/register
 * @access  Public
 */
const registerVendor = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      mobileNumber,
      whatsappNumber,
      telegramId,
      profilePhoto,
      document
    } = req.body;

    // 1. Validate required fields
    if (!firstName || !lastName || !email || !password || !mobileNumber) {
      return sendError(res, 400, 'Please provide all required fields (firstName, lastName, email, password, mobileNumber)');
    }

    if (password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters long');
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanMobile = mobileNumber.trim();

    // 2. Check for duplicate email
    const existingEmail = await Vendor.findOne({ email: cleanEmail });
    if (existingEmail) {
      return sendError(res, 409, 'A vendor with this email address already exists');
    }

    // 3. Check for duplicate mobile number
    const existingMobile = await Vendor.findOne({ mobileNumber: cleanMobile });
    if (existingMobile) {
      return sendError(res, 409, 'A vendor with this mobile number already exists');
    }

    // 4. Handle Cloudinary Profile Photo Upload if file provided
    let finalProfilePhoto = profilePhoto ? profilePhoto.trim() : null;
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'moffin_vendors/profile_photos');
        finalProfilePhoto = uploadResult.secure_url;
      } catch (uploadErr) {
        console.error('Cloudinary Upload Error during registration:', uploadErr);
        return sendError(res, 500, `Image upload failed: ${uploadErr.message}`);
      }
    }

    // 5. Hash password securely
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 6. Create new vendor
    const newVendor = await Vendor.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: cleanEmail,
      password: hashedPassword,
      mobileNumber: cleanMobile,
      whatsappNumber: whatsappNumber ? whatsappNumber.trim() : null,
      telegramId: telegramId ? telegramId.trim() : null,
      profilePhoto: finalProfilePhoto,
      document: document ? document.trim() : null,
      verificationStatus: 'pending',
      isActive: true,
      bankAccounts: [],
      wallets: []
    });

    // 6. Sync Vendor to FCFS Priority Queue
    try {
      await syncVendorToQueue(newVendor._id);
    } catch (qErr) {
      console.warn('[FCFS Queue Sync] Warning syncing vendor on register:', qErr.message);
    }

    // 7. Return safe vendor data (password is omitted)
    const vendorResponse = newVendor.toObject();
    delete vendorResponse.password;

    return sendSuccess(res, 201, 'Vendor registered successfully. Verification is pending.', {
      vendor: vendorResponse
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return sendError(res, 409, `Duplicate value for ${field}. Please use another value.`);
    }
    console.error('registerVendor Error:', error);
    return sendError(res, 500, error.message || 'Internal server error during vendor registration');
  }
};

/**
 * @desc    Login vendor & obtain JWT token
 * @route   POST /api/vendors/login
 * @access  Public
 */
const loginVendor = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Please provide both email and password');
    }

    const cleanEmail = email.toLowerCase().trim();

    // Find vendor and explicitly include password for comparison
    const vendor = await Vendor.findOne({ email: cleanEmail }).select('+password');
    if (!vendor) {
      return sendError(res, 401, 'Invalid email or password credentials');
    }

    // Check if account is active
    if (!vendor.isActive) {
      return sendError(res, 403, 'Your account has been deactivated. Please contact support.');
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password credentials');
    }

    // Generate token
    const token = generateToken(vendor._id);

    // Prepare safe vendor object
    const vendorResponse = vendor.toObject();
    delete vendorResponse.password;

    return sendSuccess(res, 200, 'Login successful', {
      token,
      vendor: vendorResponse
    });
  } catch (error) {
    console.error('loginVendor Error:', error);
    return sendError(res, 500, error.message || 'Internal server error during vendor login');
  }
};

/**
 * @desc    Get current authenticated vendor profile
 * @route   GET /api/vendors/me
 * @access  Private (Vendor)
 */
const getVendorProfile = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid authenticated vendor ID');
    }

    const { recalculateVendorMonthlyTier } = require('../services/tierCalculationService');
    const monthlyRecord = await recalculateVendorMonthlyTier(vendorId);

    const vendor = await Vendor.findById(vendorId).populate('currentTierId');
    if (!vendor) {
      return sendError(res, 404, 'Vendor profile not found');
    }

    const vendorObj = vendor.toObject();
    if (monthlyRecord) {
      vendorObj.currentTierDisplayName = monthlyRecord.currentTierDisplayName || monthlyRecord.currentTierName;
      vendorObj.currentTierName = monthlyRecord.currentTierName;
      vendorObj.currentTier = vendorObj.currentTierDisplayName;
      vendorObj.effectiveCommissionRate = monthlyRecord.effectiveCommissionRate;
      vendorObj.commissionMode = monthlyRecord.commissionMode;
      vendorObj.manualCommissionRate = monthlyRecord.manualCommissionRate;
      vendorObj.totalMonthlyTopUp = monthlyRecord.totalTopUp;
    }

    return sendSuccess(res, 200, 'Vendor profile retrieved successfully', { vendor: vendorObj });
  } catch (error) {
    console.error('getVendorProfile Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while retrieving profile');
  }
};

// =============================================================================
// 2. PERSONAL INFORMATION CONTROLLERS
// =============================================================================

/**
 * @desc    Update personal information of authenticated vendor
 * @route   PUT /api/vendors/me
 * @access  Private (Vendor)
 */
const updateVendorProfile = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid authenticated vendor ID');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor profile not found');
    }

    const {
      firstName,
      lastName,
      mobileNumber,
      whatsappNumber,
      telegramId,
      profilePhoto
    } = req.body;

    // Check if mobile number is being changed and if it conflicts with another vendor
    if (mobileNumber && mobileNumber.trim() !== vendor.mobileNumber) {
      const existingMobile = await Vendor.findOne({
        mobileNumber: mobileNumber.trim(),
        _id: { $ne: vendorId }
      });
      if (existingMobile) {
        return sendError(res, 409, 'Mobile number is already registered to another vendor');
      }
      vendor.mobileNumber = mobileNumber.trim();
    }

    // Handle image file upload to Cloudinary if file provided
    if (req.file) {
      try {
        const uploadResult = await uploadToCloudinary(req.file.buffer, 'moffin_vendors/profile_photos');
        vendor.profilePhoto = uploadResult.secure_url;
      } catch (uploadErr) {
        console.error('Cloudinary Upload Error during profile update:', uploadErr);
        return sendError(res, 500, `Image upload failed: ${uploadErr.message}`);
      }
    } else if (profilePhoto !== undefined) {
      vendor.profilePhoto = profilePhoto ? profilePhoto.trim() : null;
    }

    // Update only allowed profile fields
    if (firstName !== undefined) vendor.firstName = firstName.trim();
    if (lastName !== undefined) vendor.lastName = lastName.trim();
    if (whatsappNumber !== undefined) vendor.whatsappNumber = whatsappNumber ? whatsappNumber.trim() : null;
    if (telegramId !== undefined) vendor.telegramId = telegramId ? telegramId.trim() : null;

    const updatedVendor = await vendor.save();

    return sendSuccess(res, 200, 'Vendor profile updated successfully', {
      vendor: updatedVendor
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('updateVendorProfile Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while updating profile');
  }
};

/**
 * @desc    Upload profile photo directly to Cloudinary and update vendor
 * @route   POST /api/vendors/me/profile-photo
 * @access  Private (Vendor)
 */
const uploadProfilePhoto = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid authenticated vendor ID');
    }

    if (!req.file) {
      return sendError(res, 400, 'Please select an image file to upload');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor profile not found');
    }

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(req.file.buffer, 'moffin_vendors/profile_photos');

    // Save secure URL to MongoDB
    vendor.profilePhoto = uploadResult.secure_url;
    await vendor.save();

    return sendSuccess(res, 200, 'Profile photo uploaded successfully to Cloudinary', {
      profilePhoto: vendor.profilePhoto
    });
  } catch (error) {
    console.error('uploadProfilePhoto Error:', error);
    return sendError(res, 500, error.message || 'Internal server error during profile photo upload');
  }
};

// =============================================================================
// 3. PASSWORD MANAGEMENT CONTROLLERS
// =============================================================================

/**
 * @desc    Change password for authenticated vendor
 * @route   PUT /api/vendors/change-password
 * @access  Private (Vendor)
 */
const changeVendorPassword = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid authenticated vendor ID');
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 400, 'Please provide both currentPassword and newPassword');
    }

    if (newPassword.length < 6) {
      return sendError(res, 400, 'New password must be at least 6 characters long');
    }

    // Fetch vendor including hidden password
    const vendor = await Vendor.findById(vendorId).select('+password');
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, vendor.password);
    if (!isMatch) {
      return sendError(res, 400, 'Incorrect current password');
    }

    // Hash and update new password
    const salt = await bcrypt.genSalt(10);
    vendor.password = await bcrypt.hash(newPassword, salt);

    await vendor.save();

    return sendSuccess(res, 200, 'Password changed successfully');
  } catch (error) {
    console.error('changeVendorPassword Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while changing password');
  }
};

// =============================================================================
// 4. BANK ACCOUNT MANAGEMENT CONTROLLERS
// =============================================================================

/**
 * @desc    Add a new bank account to authenticated vendor
 * @route   POST /api/vendors/bank-accounts
 * @access  Private (Vendor)
 */
const addBankAccount = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid authenticated vendor ID');
    }

    const { accountNumber, ifscCode, bankName, accountHolderName, branchName, isDefault } = req.body;

    if (!accountNumber || !ifscCode || !bankName || !accountHolderName || !branchName) {
      return sendError(res, 400, 'Please provide all required bank details (accountNumber, ifscCode, bankName, accountHolderName, branchName)');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    // If this is the vendor's first bank account, automatically make it default
    const shouldBeDefault = Boolean(isDefault) || vendor.bankAccounts.length === 0;

    // If setting as default, reset all other bank accounts to false
    if (shouldBeDefault) {
      vendor.bankAccounts.forEach((acc) => {
        acc.isDefault = false;
      });
    }

    const newBankAccount = {
      accountNumber: accountNumber.trim(),
      ifscCode: ifscCode.trim().toUpperCase(),
      bankName: bankName.trim(),
      accountHolderName: accountHolderName.trim(),
      branchName: branchName.trim(),
      isDefault: shouldBeDefault
    };

    vendor.bankAccounts.push(newBankAccount);
    await vendor.save();

    const addedAccount = vendor.bankAccounts[vendor.bankAccounts.length - 1];

    return sendSuccess(res, 201, 'Bank account added successfully', {
      bankAccount: addedAccount,
      bankAccounts: vendor.bankAccounts
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('addBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while adding bank account');
  }
};

/**
 * @desc    Get all bank accounts of authenticated vendor
 * @route   GET /api/vendors/bank-accounts
 * @access  Private (Vendor)
 */
const getBankAccounts = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid authenticated vendor ID');
    }

    const vendor = await Vendor.findById(vendorId).select('bankAccounts');
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    return sendSuccess(res, 200, 'Bank accounts retrieved successfully', {
      bankAccounts: vendor.bankAccounts || []
    });
  } catch (error) {
    console.error('getBankAccounts Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while retrieving bank accounts');
  }
};

/**
 * @desc    Update a specific bank account of authenticated vendor
 * @route   PUT /api/vendors/bank-accounts/:bankAccountId
 * @access  Private (Vendor)
 */
const updateBankAccount = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    const { bankAccountId } = req.params;

    if (!isValidObjectId(vendorId) || !isValidObjectId(bankAccountId)) {
      return sendError(res, 400, 'Invalid vendor ID or bank account ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const bankAccount = vendor.bankAccounts.id(bankAccountId);
    if (!bankAccount) {
      return sendError(res, 404, 'Bank account not found');
    }

    const { accountNumber, ifscCode, bankName, accountHolderName, branchName, isDefault } = req.body;

    if (accountNumber !== undefined) bankAccount.accountNumber = accountNumber.trim();
    if (ifscCode !== undefined) bankAccount.ifscCode = ifscCode.trim().toUpperCase();
    if (bankName !== undefined) bankAccount.bankName = bankName.trim();
    if (accountHolderName !== undefined) bankAccount.accountHolderName = accountHolderName.trim();
    if (branchName !== undefined) bankAccount.branchName = branchName.trim();

    // Handle default account toggle
    if (isDefault === true) {
      vendor.bankAccounts.forEach((acc) => {
        acc.isDefault = acc._id.toString() === bankAccountId;
      });
    }

    await vendor.save();

    return sendSuccess(res, 200, 'Bank account updated successfully', {
      bankAccount,
      bankAccounts: vendor.bankAccounts
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('updateBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while updating bank account');
  }
};

/**
 * @desc    Delete a specific bank account
 * @route   DELETE /api/vendors/bank-accounts/:bankAccountId
 * @access  Private (Vendor)
 */
const deleteBankAccount = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    const { bankAccountId } = req.params;

    if (!isValidObjectId(vendorId) || !isValidObjectId(bankAccountId)) {
      return sendError(res, 400, 'Invalid vendor ID or bank account ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const accountToDelete = vendor.bankAccounts.id(bankAccountId);
    if (!accountToDelete) {
      return sendError(res, 404, 'Bank account not found');
    }

    const wasDefault = accountToDelete.isDefault;

    // Remove subdocument
    vendor.bankAccounts.pull(bankAccountId);

    // If deleted account was default and others exist, make first one default
    if (wasDefault && vendor.bankAccounts.length > 0) {
      vendor.bankAccounts[0].isDefault = true;
    }

    await vendor.save();

    return sendSuccess(res, 200, 'Bank account deleted successfully', {
      bankAccounts: vendor.bankAccounts
    });
  } catch (error) {
    console.error('deleteBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while deleting bank account');
  }
};

/**
 * @desc    Set a bank account as default
 * @route   PATCH /api/vendors/bank-accounts/:bankAccountId/default
 * @access  Private (Vendor)
 */
const setDefaultBankAccount = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    const { bankAccountId } = req.params;

    if (!isValidObjectId(vendorId) || !isValidObjectId(bankAccountId)) {
      return sendError(res, 400, 'Invalid vendor ID or bank account ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const targetAccount = vendor.bankAccounts.id(bankAccountId);
    if (!targetAccount) {
      return sendError(res, 404, 'Bank account not found');
    }

    // Set target account as default and others to false
    vendor.bankAccounts.forEach((acc) => {
      acc.isDefault = acc._id.toString() === bankAccountId;
    });

    await vendor.save();

    return sendSuccess(res, 200, 'Default bank account updated successfully', {
      bankAccount: targetAccount,
      bankAccounts: vendor.bankAccounts
    });
  } catch (error) {
    console.error('setDefaultBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while setting default bank account');
  }
};

// =============================================================================
// 5. WALLET MANAGEMENT CONTROLLERS
// =============================================================================

/**
 * @desc    Add a new wallet to authenticated vendor
 * @route   POST /api/vendors/wallets
 * @access  Private (Vendor)
 */
const addWallet = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid authenticated vendor ID');
    }

    const { walletName, walletId, isDefault } = req.body;
    let qrCode = req.body.qrCode;

    if (!walletName || !walletId) {
      return sendError(res, 400, 'Please provide walletName and walletId');
    }

    // Upload QR code to Cloudinary if file was provided
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'moffin_vendors/wallet_qr');
      qrCode = uploadResult.secure_url;
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    // If first wallet or explicitly marked default
    const shouldBeDefault = Boolean(isDefault === true || isDefault === 'true') || vendor.wallets.length === 0;

    if (shouldBeDefault) {
      vendor.wallets.forEach((w) => {
        w.isDefault = false;
      });
    }

    const newWallet = {
      walletName: walletName.trim(),
      walletId: walletId.trim(),
      qrCode: qrCode ? qrCode.trim() : null,
      isDefault: shouldBeDefault
    };

    vendor.wallets.push(newWallet);
    await vendor.save();

    const addedWallet = vendor.wallets[vendor.wallets.length - 1];

    return sendSuccess(res, 201, 'Wallet added successfully', {
      wallet: addedWallet,
      wallets: vendor.wallets
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('addWallet Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while adding wallet');
  }
};

/**
 * @desc    Get all wallets of authenticated vendor
 * @route   GET /api/vendors/wallets
 * @access  Private (Vendor)
 */
const getWallets = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid authenticated vendor ID');
    }

    const vendor = await Vendor.findById(vendorId).select('wallets');
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    return sendSuccess(res, 200, 'Wallets retrieved successfully', {
      wallets: vendor.wallets || []
    });
  } catch (error) {
    console.error('getWallets Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while retrieving wallets');
  }
};

/**
 * @desc    Update a specific wallet of authenticated vendor
 * @route   PUT /api/vendors/wallets/:walletSubId
 * @access  Private (Vendor)
 */
const updateWallet = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    const { walletSubId } = req.params;

    if (!isValidObjectId(vendorId) || !isValidObjectId(walletSubId)) {
      return sendError(res, 400, 'Invalid vendor ID or wallet subdocument ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const wallet = vendor.wallets.id(walletSubId);
    if (!wallet) {
      return sendError(res, 404, 'Wallet not found');
    }

    const { walletName, walletId: newWalletAddress, isDefault } = req.body;
    let qrCode = req.body.qrCode;

    // Upload new QR code to Cloudinary if file was provided
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'moffin_vendors/wallet_qr');
      qrCode = uploadResult.secure_url;
    }

    if (walletName !== undefined) wallet.walletName = walletName.trim();
    if (newWalletAddress !== undefined) {
      wallet.walletId = newWalletAddress.trim();
    }
    if (qrCode !== undefined) wallet.qrCode = qrCode ? qrCode.trim() : null;

    if (isDefault === true || isDefault === 'true') {
      vendor.wallets.forEach((w) => {
        w.isDefault = w._id.toString() === walletSubId;
      });
    }

    await vendor.save();

    return sendSuccess(res, 200, 'Wallet updated successfully', {
      wallet,
      wallets: vendor.wallets
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('updateWallet Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while updating wallet');
  }
};

/**
 * @desc    Delete a specific wallet
 * @route   DELETE /api/vendors/wallets/:walletSubId
 * @access  Private (Vendor)
 */
const deleteWallet = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    const { walletSubId } = req.params;

    if (!isValidObjectId(vendorId) || !isValidObjectId(walletSubId)) {
      return sendError(res, 400, 'Invalid vendor ID or wallet subdocument ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const walletToDelete = vendor.wallets.id(walletSubId);
    if (!walletToDelete) {
      return sendError(res, 404, 'Wallet not found');
    }

    const wasDefault = walletToDelete.isDefault;

    // Remove subdocument
    vendor.wallets.pull(walletSubId);

    // If deleted wallet was default, make the first remaining one default
    if (wasDefault && vendor.wallets.length > 0) {
      vendor.wallets[0].isDefault = true;
    }

    await vendor.save();

    return sendSuccess(res, 200, 'Wallet deleted successfully', {
      wallets: vendor.wallets
    });
  } catch (error) {
    console.error('deleteWallet Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while deleting wallet');
  }
};

/**
 * @desc    Set a wallet as default
 * @route   PATCH /api/vendors/wallets/:walletSubId/default
 * @access  Private (Vendor)
 */
const setDefaultWallet = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    const { walletSubId } = req.params;

    if (!isValidObjectId(vendorId) || !isValidObjectId(walletSubId)) {
      return sendError(res, 400, 'Invalid vendor ID or wallet subdocument ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const targetWallet = vendor.wallets.id(walletSubId);
    if (!targetWallet) {
      return sendError(res, 404, 'Wallet not found');
    }

    // Set target wallet as default and others to false
    vendor.wallets.forEach((w) => {
      w.isDefault = w._id.toString() === walletSubId;
    });

    await vendor.save();

    return sendSuccess(res, 200, 'Default wallet updated successfully', {
      wallet: targetWallet,
      wallets: vendor.wallets
    });
  } catch (error) {
    console.error('setDefaultWallet Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while setting default wallet');
  }
};

// =============================================================================
// 6. SUPERADMIN MANAGEMENT CONTROLLERS
// =============================================================================

/**
 * @desc    Get all vendors with pending verification status (SuperAdmin)
 * @route   GET /api/admin/vendors/pending
 * @access  Private (SuperAdmin)
 */
const getPendingVendors = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = { verificationStatus: 'pending' };

    const [vendors, total] = await Promise.all([
      Vendor.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Vendor.countDocuments(query)
    ]);

    return sendSuccess(res, 200, 'Pending vendors retrieved successfully', {
      vendors,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('getPendingVendors Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while fetching pending vendors');
  }
};

/**
 * @desc    Get all vendors with pagination and filters (SuperAdmin)
 * @route   GET /api/admin/vendors
 * @access  Private (SuperAdmin)
 */
const getAllVendors = async (req, res) => {
  try {
    const { verificationStatus, isActive, search } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const query = {};

    // Filter by verification status
    if (verificationStatus && ['pending', 'approved', 'rejected'].includes(verificationStatus)) {
      query.verificationStatus = verificationStatus;
    }

    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true' || isActive === true;
    }

    // Search by firstName, lastName, email, or mobileNumber
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { mobileNumber: searchRegex }
      ];
    }

    const [vendors, total] = await Promise.all([
      Vendor.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Vendor.countDocuments(query)
    ]);

    // Enrich vendors with current month tier and commission state
    const { year, month } = getKolkataDate();
    const vendorIds = vendors.map(v => v._id);
    const monthlyTiers = await VendorMonthlyTier.find({
      vendorId: { $in: vendorIds },
      year,
      month
    }).lean();

    const monthlyTierMap = {};
    monthlyTiers.forEach(m => {
      monthlyTierMap[m.vendorId.toString()] = m;
    });

    const enrichedVendors = vendors.map(v => {
      const vObj = v.toObject ? v.toObject() : { ...v };
      const m = monthlyTierMap[v._id.toString()];
      if (m) {
        vObj.currentTierName = m.currentTierDisplayName || m.currentTierName;
        vObj.currentTierDisplayName = m.currentTierDisplayName || m.currentTierName;
        vObj.commissionMode = m.commissionMode || 'AUTO';
        vObj.manualCommissionRate = m.manualCommissionRate;
        vObj.manualCommissionReason = m.manualCommissionReason;
        vObj.effectiveCommissionRate = m.effectiveCommissionRate;
        vObj.totalMonthlyTopUp = m.totalTopUp || 0;
      } else {
        vObj.currentTierName = vObj.currentTier || 'Bronze V';
        vObj.currentTierDisplayName = vObj.currentTier || 'Bronze V';
        vObj.commissionMode = vObj.commissionMode || 'AUTO';
        vObj.manualCommissionRate = vObj.manualCommissionRate || null;
        vObj.effectiveCommissionRate = vObj.effectiveCommissionRate || 1.0;
        vObj.totalMonthlyTopUp = 0;
      }
      return vObj;
    });

    return sendSuccess(res, 200, 'Vendors retrieved successfully', {
      vendors: enrichedVendors,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('getAllVendors Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while fetching vendors');
  }
};

/**
 * @desc    Get complete vendor details by ID (SuperAdmin)
 * @route   GET /api/admin/vendors/:vendorId
 * @access  Private (SuperAdmin)
 */
const getVendorById = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid vendor ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    const { year, month } = getKolkataDate();
    const m = await VendorMonthlyTier.findOne({ vendorId: vendor._id, year, month }).lean();
    const vObj = vendor.toObject ? vendor.toObject() : { ...vendor };
    if (m) {
      vObj.currentTierName = m.currentTierDisplayName || m.currentTierName;
      vObj.currentTierDisplayName = m.currentTierDisplayName || m.currentTierName;
      vObj.commissionMode = m.commissionMode || 'AUTO';
      vObj.manualCommissionRate = m.manualCommissionRate;
      vObj.manualCommissionReason = m.manualCommissionReason;
      vObj.effectiveCommissionRate = m.effectiveCommissionRate;
      vObj.totalMonthlyTopUp = m.totalTopUp || 0;
    }

    return sendSuccess(res, 200, 'Vendor details retrieved successfully', { vendor: vObj });
  } catch (error) {
    console.error('getVendorById Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while fetching vendor details');
  }
};

/**
 * @desc    Approve vendor verification (SuperAdmin)
 * @route   PATCH /api/admin/vendors/:vendorId/approve
 * @access  Private (SuperAdmin)
 */
const approveVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid vendor ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    vendor.verificationStatus = 'approved';
    vendor.rejectionReason = null;

    const updatedVendor = await vendor.save();

    return sendSuccess(res, 200, 'Vendor approved successfully', {
      vendor: updatedVendor
    });
  } catch (error) {
    console.error('approveVendor Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while approving vendor');
  }
};

/**
 * @desc    Reject vendor verification (SuperAdmin)
 * @route   PATCH /api/admin/vendors/:vendorId/reject
 * @access  Private (SuperAdmin)
 */
const rejectVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { rejectionReason } = req.body;

    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid vendor ID format');
    }

    if (!rejectionReason || rejectionReason.trim() === '') {
      return sendError(res, 400, 'Please provide a valid rejectionReason');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    vendor.verificationStatus = 'rejected';
    vendor.rejectionReason = rejectionReason.trim();

    const updatedVendor = await vendor.save();

    return sendSuccess(res, 200, 'Vendor rejected successfully', {
      vendor: updatedVendor
    });
  } catch (error) {
    console.error('rejectVendor Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while rejecting vendor');
  }
};

/**
 * @desc    Activate a vendor account (SuperAdmin)
 * @route   PATCH /api/admin/vendors/:vendorId/activate
 * @access  Private (SuperAdmin)
 */
const activateVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid vendor ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    vendor.isActive = true;
    const updatedVendor = await vendor.save();

    return sendSuccess(res, 200, 'Vendor account activated successfully', {
      vendor: updatedVendor
    });
  } catch (error) {
    console.error('activateVendor Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while activating vendor');
  }
};

/**
 * @desc    Deactivate a vendor account (SuperAdmin)
 * @route   PATCH /api/admin/vendors/:vendorId/deactivate
 * @access  Private (SuperAdmin)
 */
const deactivateVendor = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!isValidObjectId(vendorId)) {
      return sendError(res, 400, 'Invalid vendor ID format');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      return sendError(res, 404, 'Vendor not found');
    }

    vendor.isActive = false;
    const updatedVendor = await vendor.save();

    return sendSuccess(res, 200, 'Vendor account deactivated successfully', {
      vendor: updatedVendor
    });
  } catch (error) {
    console.error('deactivateVendor Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while deactivating vendor');
  }
};

module.exports = {
  // Auth / Registration
  registerVendor,
  loginVendor,
  getVendorProfile,

  // Personal Info
  updateVendorProfile,
  uploadProfilePhoto,

  // Password
  changeVendorPassword,

  // Bank Accounts
  addBankAccount,
  getBankAccounts,
  updateBankAccount,
  deleteBankAccount,
  setDefaultBankAccount,

  // Wallets
  addWallet,
  getWallets,
  updateWallet,
  deleteWallet,
  setDefaultWallet,

  // SuperAdmin Management
  getPendingVendors,
  getAllVendors,
  getVendorById,
  approveVendor,
  rejectVendor,
  activateVendor,
  deactivateVendor
};
