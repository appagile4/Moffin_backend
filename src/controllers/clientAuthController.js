const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Client = require('../models/clientModel');
const { logAction } = require('../services/auditService');

/**
 * Helper: Generate JWT Token for Client
 */
const generateClientToken = (client) => {
  return jwt.sign(
    { id: client._id, role: 'client', email: client.email },
    process.env.JWT_SECRET || 'moffin_jwt_secret_key_default_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

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

/**
 * Helper: Create safe client object without password
 */
const getSafeClient = (clientDoc) => {
  const obj = clientDoc.toObject ? clientDoc.toObject() : { ...clientDoc };
  delete obj.password;
  return obj;
};

// =============================================================================
// 1. CLIENT REGISTRATION
// =============================================================================

/**
 * @desc    Register a new client
 * @route   POST /api/auth/client/register or POST /api/client/register
 * @access  Public
 */
const registerClient = async (req, res) => {
  try {
    const { firstName, lastName, email, password, mobile, mobileNumber } = req.body;
    const clientMobile = mobile || mobileNumber;

    // 1. Validate required fields
    if (!firstName || !lastName || !email || !password || !clientMobile) {
      return sendError(
        res,
        400,
        'Please provide all required fields (firstName, lastName, email, password, mobile)'
      );
    }

    if (password.length < 6) {
      return sendError(res, 400, 'Password must be at least 6 characters long');
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanMobile = clientMobile.toString().trim();

    // 2. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return sendError(res, 400, 'Please provide a valid email address');
    }

    // 3. Check for duplicate email
    const existingEmail = await Client.findOne({ email: cleanEmail });
    if (existingEmail) {
      return sendError(res, 409, 'A client with this email address already exists');
    }

    // 4. Check for duplicate mobile
    const existingMobile = await Client.findOne({ mobile: cleanMobile });
    if (existingMobile) {
      return sendError(res, 409, 'A client with this mobile number already exists');
    }

    // 5. Hash password securely
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 6. Create client (Role is strictly forced to 'client')
    const newClient = await Client.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: cleanEmail,
      mobile: cleanMobile,
      password: hashedPassword,
      role: 'client',
      status: 'active',
      isActive: true,
      isBlocked: false,
      isVerified: true
    });

    // 7. Generate Token & Prepare Safe Response
    const token = generateClientToken(newClient);
    const safeClient = getSafeClient(newClient);

    // 8. Audit Log
    await logAction({
      actor: newClient._id.toString(),
      actorRole: 'client',
      action: 'CLIENT_REGISTERED',
      targetType: 'Client',
      targetId: newClient._id.toString(),
      metadata: { email: cleanEmail, mobile: cleanMobile }
    });

    return sendSuccess(res, 201, 'Client registered successfully', {
      token,
      client: safeClient
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
    console.error('registerClient Error:', error);
    return sendError(res, 500, error.message || 'Internal server error during client registration');
  }
};

// =============================================================================
// 2. CLIENT LOGIN
// =============================================================================

/**
 * @desc    Login client & obtain JWT token
 * @route   POST /api/auth/client/login or POST /api/client/login
 * @access  Public
 */
const loginClient = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Please provide both email and password');
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Find client with password
    const client = await Client.findOne({ email: cleanEmail }).select('+password');
    if (!client) {
      return sendError(res, 401, 'Invalid email or password credentials');
    }

    // 2. Verify account is not blocked
    if (client.isBlocked || client.status === 'blocked') {
      return sendError(res, 403, 'Your account has been blocked. Please contact support.');
    }

    // 3. Verify account is active
    if (!client.isActive || client.status === 'inactive') {
      return sendError(res, 403, 'Your account is deactivated. Please contact support.');
    }

    // 4. Compare password
    const isMatch = await bcrypt.compare(password, client.password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid email or password credentials');
    }

    // 5. Update lastLoginAt
    client.lastLoginAt = new Date();
    await client.save();

    // 6. Generate Token & Prepare Safe Response
    const token = generateClientToken(client);
    const safeClient = getSafeClient(client);

    // 7. Audit Log
    await logAction({
      actor: client._id.toString(),
      actorRole: 'client',
      action: 'CLIENT_LOGGED_IN',
      targetType: 'Client',
      targetId: client._id.toString(),
      metadata: { email: cleanEmail }
    });

    return sendSuccess(res, 200, 'Login successful', {
      token,
      client: safeClient
    });
  } catch (error) {
    console.error('loginClient Error:', error);
    return sendError(res, 500, error.message || 'Internal server error during client login');
  }
};

// =============================================================================
// 3. CLIENT PROFILE
// =============================================================================

/**
 * @desc    Get authenticated client profile
 * @route   GET /api/client/profile or GET /api/client/me
 * @access  Private (Client)
 */
const getClientProfile = async (req, res) => {
  try {
    const clientId = req.user?.id || req.user?._id;
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return sendError(res, 400, 'Invalid authenticated client ID');
    }

    const client = req.client || (await Client.findById(clientId));
    if (!client) {
      return sendError(res, 404, 'Client profile not found');
    }

    const safeClient = getSafeClient(client);

    return sendSuccess(res, 200, 'Client profile retrieved successfully', {
      client: safeClient
    });
  } catch (error) {
    console.error('getClientProfile Error:', error);
    return sendError(res, 500, error.message || 'Internal server error while retrieving client profile');
  }
};

module.exports = {
  registerClient,
  loginClient,
  getClientProfile,
  generateClientToken
};
