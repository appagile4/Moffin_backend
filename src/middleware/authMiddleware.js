const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Vendor = require('../models/vendorModel');

/**
 * Standard error response helper for middleware
 */
const sendAuthError = (res, statusCode, message) => {
  return res.status(statusCode).json({
    success: false,
    message
  });
};

/**
 * 1. Base Authentication Middleware
 * Validates the JWT Bearer token and attaches decoded payload { id, role } to req.user.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendAuthError(res, 401, 'Access denied. No token provided or invalid authorization format.');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return sendAuthError(res, 401, 'Access denied. Token is missing.');
    }

    const secret = process.env.JWT_SECRET || 'moffin_jwt_secret_key_default_2026';
    const decoded = jwt.verify(token, secret);

    if (!decoded || !decoded.id || !decoded.role) {
      return sendAuthError(res, 401, 'Invalid token payload structure.');
    }

    // Attach verified user payload to request
    req.user = {
      id: decoded.id,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return sendAuthError(res, 401, 'Session expired. Please log in again.');
    }
    if (error.name === 'JsonWebTokenError') {
      return sendAuthError(res, 401, 'Invalid token. Authorization failed.');
    }
    return sendAuthError(res, 401, 'Authentication failed.');
  }
};

/**
 * 2. Vendor Authentication Middleware
 * Ensures the authenticated user has role 'vendor', exists in DB, is active, and attaches req.vendor.
 */
const vendorAuth = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'vendor') {
      return sendAuthError(res, 403, 'Forbidden. Vendor access required.');
    }

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) {
      return sendAuthError(res, 404, 'Vendor account not found.');
    }

    if (!vendor.isActive) {
      return sendAuthError(res, 403, 'Vendor account is deactivated. Please contact support.');
    }

    req.vendor = vendor;
    next();
  } catch (error) {
    console.error('vendorAuth error:', error);
    return sendAuthError(res, 500, 'Error verifying vendor authentication.');
  }
};

/**
 * 3. Verified Vendor Authentication Middleware
 * Ensures vendor is authenticated, active, AND has verificationStatus === 'approved'.
 */
const verifiedVendorAuth = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'vendor') {
      return sendAuthError(res, 403, 'Forbidden. Vendor access required.');
    }

    const vendor = req.vendor || (await Vendor.findById(req.user.id));
    if (!vendor) {
      return sendAuthError(res, 404, 'Vendor account not found.');
    }

    if (!vendor.isActive) {
      return sendAuthError(res, 403, 'Vendor account is deactivated. Please contact support.');
    }

    if (vendor.verificationStatus !== 'approved') {
      return sendAuthError(
        res,
        403,
        `Action forbidden. Your vendor account status is '${vendor.verificationStatus}'. Approved status required.`
      );
    }

    req.vendor = vendor;
    next();
  } catch (error) {
    console.error('verifiedVendorAuth error:', error);
    return sendAuthError(res, 500, 'Error checking vendor verification status.');
  }
};

/**
 * 4. Active User Middleware
 * Generic check to verify if the authenticated user/vendor account is currently active.
 */
const activeUserAuth = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return sendAuthError(res, 401, 'Unauthorized. Please authenticate.');
    }

    if (req.user.role === 'vendor') {
      const vendor = req.vendor || (await Vendor.findById(req.user.id).select('isActive'));
      if (!vendor) {
        return sendAuthError(res, 404, 'User account not found.');
      }
      if (!vendor.isActive) {
        return sendAuthError(res, 403, 'Your account is deactivated. Please contact support.');
      }
    }

    next();
  } catch (error) {
    console.error('activeUserAuth error:', error);
    return sendAuthError(res, 500, 'Error verifying user status.');
  }
};

/**
 * 5. Validate MongoDB ObjectId Middleware Factory
 * Validates request parameters (e.g., :vendorId, :bankAccountId, :walletId) before hitting controllers.
 */
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return sendAuthError(res, 400, `Invalid ${paramName} format. Must be a valid 24-character hexadecimal ObjectId.`);
    }
    next();
  };
};

module.exports = {
  authMiddleware,
  vendorAuth,
  verifiedVendorAuth,
  activeUserAuth,
  validateObjectId
};
