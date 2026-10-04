const mongoose = require('mongoose');
const Client = require('../models/clientModel');
const { uploadToCloudinary } = require('../config/cloudinary');

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
// 1. CLIENT BANK ACCOUNT CONTROLLERS
// =============================================================================

/**
 * @desc    Get all bank accounts of the authenticated client
 * @route   GET /api/client/bank-accounts
 * @access  Private (Client)
 */
const getClientBankAccounts = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    if (!isValidObjectId(clientId)) {
      return sendError(res, 400, 'Invalid authenticated client ID');
    }

    const client = await Client.findById(clientId).select('bankAccounts');
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    return sendSuccess(res, 200, 'Client bank accounts retrieved successfully', {
      bankAccounts: client.bankAccounts || []
    });
  } catch (error) {
    console.error('getClientBankAccounts Error:', error);
    return sendError(res, 500, error.message || 'Error fetching bank accounts');
  }
};

/**
 * @desc    Add a new bank account for authenticated client
 * @route   POST /api/client/bank-accounts
 * @access  Private (Client)
 */
const addClientBankAccount = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    if (!isValidObjectId(clientId)) {
      return sendError(res, 400, 'Invalid authenticated client ID');
    }

    const { accountNumber, ifscCode, bankName, accountHolderName, branchName, isDefault } = req.body;

    if (!accountNumber || !ifscCode || !bankName || !accountHolderName) {
      return sendError(res, 400, 'Account number, IFSC code, bank name, and account holder name are required');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    // Determine if this should be the default bank account
    const shouldBeDefault = Boolean(isDefault === true || isDefault === 'true') || client.bankAccounts.length === 0;

    // If marked default, unset default on any existing accounts
    if (shouldBeDefault && client.bankAccounts.length > 0) {
      client.bankAccounts.forEach((acc) => {
        acc.isDefault = false;
      });
    }

    const newAccount = {
      accountNumber: accountNumber.toString().trim(),
      ifscCode: ifscCode.toString().trim().toUpperCase(),
      bankName: bankName.toString().trim(),
      accountHolderName: accountHolderName.toString().trim(),
      branchName: branchName ? branchName.toString().trim() : '',
      isDefault: shouldBeDefault,
      isActive: true
    };

    client.bankAccounts.push(newAccount);
    await client.save();

    const createdAccount = client.bankAccounts[client.bankAccounts.length - 1];

    return sendSuccess(res, 201, 'Bank account added successfully', {
      bankAccount: createdAccount,
      bankAccounts: client.bankAccounts
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('addClientBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Error adding bank account');
  }
};

/**
 * @desc    Update a specific bank account of authenticated client
 * @route   PUT /api/client/bank-accounts/:bankAccountId
 * @access  Private (Client)
 */
const updateClientBankAccount = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    const { bankAccountId } = req.params;

    if (!isValidObjectId(clientId) || !isValidObjectId(bankAccountId)) {
      return sendError(res, 400, 'Invalid client ID or bank account ID');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const bankAccount = client.bankAccounts.id(bankAccountId);
    if (!bankAccount) {
      return sendError(res, 404, 'Bank account not found');
    }

    const { accountNumber, ifscCode, bankName, accountHolderName, branchName, isDefault, isActive } = req.body;

    if (accountNumber !== undefined) bankAccount.accountNumber = accountNumber.toString().trim();
    if (ifscCode !== undefined) bankAccount.ifscCode = ifscCode.toString().trim().toUpperCase();
    if (bankName !== undefined) bankAccount.bankName = bankName.toString().trim();
    if (accountHolderName !== undefined) bankAccount.accountHolderName = accountHolderName.toString().trim();
    if (branchName !== undefined) bankAccount.branchName = branchName.toString().trim();
    if (isActive !== undefined) bankAccount.isActive = Boolean(isActive === true || isActive === 'true');

    if (isDefault === true || isDefault === 'true') {
      client.bankAccounts.forEach((acc) => {
        acc.isDefault = acc._id.toString() === bankAccountId.toString();
      });
    }

    await client.save();

    return sendSuccess(res, 200, 'Bank account updated successfully', {
      bankAccount,
      bankAccounts: client.bankAccounts
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('updateClientBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Error updating bank account');
  }
};

/**
 * @desc    Delete a specific bank account of authenticated client
 * @route   DELETE /api/client/bank-accounts/:bankAccountId
 * @access  Private (Client)
 */
const deleteClientBankAccount = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    const { bankAccountId } = req.params;

    if (!isValidObjectId(clientId) || !isValidObjectId(bankAccountId)) {
      return sendError(res, 400, 'Invalid client ID or bank account ID');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const accountToDelete = client.bankAccounts.id(bankAccountId);
    if (!accountToDelete) {
      return sendError(res, 404, 'Bank account not found');
    }

    const wasDefault = accountToDelete.isDefault;
    client.bankAccounts.pull(bankAccountId);

    if (wasDefault && client.bankAccounts.length > 0) {
      client.bankAccounts[0].isDefault = true;
    }

    await client.save();

    return sendSuccess(res, 200, 'Bank account deleted successfully', {
      bankAccounts: client.bankAccounts
    });
  } catch (error) {
    console.error('deleteClientBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Error deleting bank account');
  }
};

/**
 * @desc    Set a bank account as default for authenticated client
 * @route   PATCH /api/client/bank-accounts/:bankAccountId/default
 * @access  Private (Client)
 */
const setDefaultClientBankAccount = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    const { bankAccountId } = req.params;

    if (!isValidObjectId(clientId) || !isValidObjectId(bankAccountId)) {
      return sendError(res, 400, 'Invalid client ID or bank account ID');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const targetAccount = client.bankAccounts.id(bankAccountId);
    if (!targetAccount) {
      return sendError(res, 404, 'Bank account not found');
    }

    client.bankAccounts.forEach((acc) => {
      acc.isDefault = acc._id.toString() === bankAccountId.toString();
    });

    await client.save();

    return sendSuccess(res, 200, 'Default bank account updated successfully', {
      bankAccount: targetAccount,
      bankAccounts: client.bankAccounts
    });
  } catch (error) {
    console.error('setDefaultClientBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Error setting default bank account');
  }
};

/**
 * @desc    Toggle active status of a bank account
 * @route   PATCH /api/client/bank-accounts/:bankAccountId/toggle
 * @access  Private (Client)
 */
const toggleClientBankAccount = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    const { bankAccountId } = req.params;

    if (!isValidObjectId(clientId) || !isValidObjectId(bankAccountId)) {
      return sendError(res, 400, 'Invalid client ID or bank account ID');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const targetAccount = client.bankAccounts.id(bankAccountId);
    if (!targetAccount) {
      return sendError(res, 404, 'Bank account not found');
    }

    targetAccount.isActive = !targetAccount.isActive;
    await client.save();

    return sendSuccess(res, 200, `Bank account ${targetAccount.isActive ? 'activated' : 'deactivated'} successfully`, {
      bankAccount: targetAccount,
      bankAccounts: client.bankAccounts
    });
  } catch (error) {
    console.error('toggleClientBankAccount Error:', error);
    return sendError(res, 500, error.message || 'Error toggling bank account status');
  }
};

// =============================================================================
// 2. CLIENT WALLET & QR CODE CONTROLLERS
// =============================================================================

/**
 * @desc    Get all wallets & UPI of authenticated client
 * @route   GET /api/client/wallets
 * @access  Private (Client)
 */
const getClientWallets = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    if (!isValidObjectId(clientId)) {
      return sendError(res, 400, 'Invalid authenticated client ID');
    }

    const client = await Client.findById(clientId).select('wallets');
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    return sendSuccess(res, 200, 'Client wallets retrieved successfully', {
      wallets: client.wallets || []
    });
  } catch (error) {
    console.error('getClientWallets Error:', error);
    return sendError(res, 500, error.message || 'Error fetching wallets');
  }
};

/**
 * @desc    Add a new wallet & QR code for authenticated client
 * @route   POST /api/client/wallets
 * @access  Private (Client)
 */
const addClientWallet = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    if (!isValidObjectId(clientId)) {
      return sendError(res, 400, 'Invalid authenticated client ID');
    }

    const { walletName, walletId, isDefault } = req.body;
    let qrCode = req.body.qrCode || null;

    if (!walletName || !walletId) {
      return sendError(res, 400, 'Wallet name and Wallet ID / UPI ID are required');
    }

    // Upload QR code to Cloudinary if file provided in multipart request
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'moffin_clients/wallet_qr');
      qrCode = uploadResult.secure_url;
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const shouldBeDefault = Boolean(isDefault === true || isDefault === 'true') || client.wallets.length === 0;

    if (shouldBeDefault && client.wallets.length > 0) {
      client.wallets.forEach((w) => {
        w.isDefault = false;
      });
    }

    const newWallet = {
      walletName: walletName.toString().trim(),
      walletId: walletId.toString().trim(),
      qrCode: qrCode ? qrCode.toString().trim() : null,
      isDefault: shouldBeDefault,
      isActive: true
    };

    client.wallets.push(newWallet);
    await client.save();

    const createdWallet = client.wallets[client.wallets.length - 1];

    return sendSuccess(res, 201, 'Wallet added successfully', {
      wallet: createdWallet,
      wallets: client.wallets
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('addClientWallet Error:', error);
    return sendError(res, 500, error.message || 'Error adding wallet');
  }
};

/**
 * @desc    Update a specific wallet & QR code of authenticated client
 * @route   PUT /api/client/wallets/:walletId
 * @access  Private (Client)
 */
const updateClientWallet = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    const { walletId } = req.params;

    if (!isValidObjectId(clientId) || !isValidObjectId(walletId)) {
      return sendError(res, 400, 'Invalid client ID or wallet ID format');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const targetWallet = client.wallets.id(walletId);
    if (!targetWallet) {
      return sendError(res, 404, 'Wallet not found');
    }

    const { walletName, walletId: newWalletAddress, isDefault, isActive } = req.body;
    let qrCode = req.body.qrCode;

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, 'moffin_clients/wallet_qr');
      qrCode = uploadResult.secure_url;
    }

    if (walletName !== undefined) targetWallet.walletName = walletName.toString().trim();
    if (newWalletAddress !== undefined) targetWallet.walletId = newWalletAddress.toString().trim();
    if (qrCode !== undefined) targetWallet.qrCode = qrCode ? qrCode.toString().trim() : targetWallet.qrCode;
    if (isActive !== undefined) targetWallet.isActive = Boolean(isActive === true || isActive === 'true');

    if (isDefault === true || isDefault === 'true') {
      client.wallets.forEach((w) => {
        w.isDefault = w._id.toString() === walletId.toString();
      });
    }

    await client.save();

    return sendSuccess(res, 200, 'Wallet updated successfully', {
      wallet: targetWallet,
      wallets: client.wallets
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return sendError(res, 400, messages.join(', '));
    }
    console.error('updateClientWallet Error:', error);
    return sendError(res, 500, error.message || 'Error updating wallet');
  }
};

/**
 * @desc    Delete a specific wallet of authenticated client
 * @route   DELETE /api/client/wallets/:walletId
 * @access  Private (Client)
 */
const deleteClientWallet = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    const { walletId } = req.params;

    if (!isValidObjectId(clientId) || !isValidObjectId(walletId)) {
      return sendError(res, 400, 'Invalid client ID or wallet ID format');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const walletToDelete = client.wallets.id(walletId);
    if (!walletToDelete) {
      return sendError(res, 404, 'Wallet not found');
    }

    const wasDefault = walletToDelete.isDefault;
    client.wallets.pull(walletId);

    if (wasDefault && client.wallets.length > 0) {
      client.wallets[0].isDefault = true;
    }

    await client.save();

    return sendSuccess(res, 200, 'Wallet deleted successfully', {
      wallets: client.wallets
    });
  } catch (error) {
    console.error('deleteClientWallet Error:', error);
    return sendError(res, 500, error.message || 'Error deleting wallet');
  }
};

/**
 * @desc    Set a wallet as default for authenticated client
 * @route   PATCH /api/client/wallets/:walletId/default
 * @access  Private (Client)
 */
const setDefaultClientWallet = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    const { walletId } = req.params;

    if (!isValidObjectId(clientId) || !isValidObjectId(walletId)) {
      return sendError(res, 400, 'Invalid client ID or wallet ID format');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const targetWallet = client.wallets.id(walletId);
    if (!targetWallet) {
      return sendError(res, 404, 'Wallet not found');
    }

    client.wallets.forEach((w) => {
      w.isDefault = w._id.toString() === walletId.toString();
    });

    await client.save();

    return sendSuccess(res, 200, 'Default wallet updated successfully', {
      wallet: targetWallet,
      wallets: client.wallets
    });
  } catch (error) {
    console.error('setDefaultClientWallet Error:', error);
    return sendError(res, 500, error.message || 'Error setting default wallet');
  }
};

/**
 * @desc    Toggle active status of a wallet
 * @route   PATCH /api/client/wallets/:walletId/toggle
 * @access  Private (Client)
 */
const toggleClientWallet = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    const { walletId } = req.params;

    if (!isValidObjectId(clientId) || !isValidObjectId(walletId)) {
      return sendError(res, 400, 'Invalid client ID or wallet ID format');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const targetWallet = client.wallets.id(walletId);
    if (!targetWallet) {
      return sendError(res, 404, 'Wallet not found');
    }

    targetWallet.isActive = !targetWallet.isActive;
    await client.save();

    return sendSuccess(res, 200, `Wallet ${targetWallet.isActive ? 'activated' : 'deactivated'} successfully`, {
      wallet: targetWallet,
      wallets: client.wallets
    });
  } catch (error) {
    console.error('toggleClientWallet Error:', error);
    return sendError(res, 500, error.message || 'Error toggling wallet status');
  }
};

module.exports = {
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
};
