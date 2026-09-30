/**
 * Standard error response helper for role middleware
 */
const sendRoleError = (res, statusCode, message) => {
  return res.status(statusCode).json({
    success: false,
    message
  });
};

/**
 * Generic Role Authorization Middleware Factory
 * Accepts one or more authorized roles.
 * Example:
 *   roleMiddleware('super_admin')
 *   roleMiddleware('admin', 'super_admin')
 *   roleMiddleware('staff', 'admin', 'super_admin')
 */
const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return sendRoleError(res, 401, 'Unauthorized. Please log in.');
    }

    if (!allowedRoles.includes(req.user.role)) {
      return sendRoleError(
        res,
        403,
        `Forbidden. Access restricted to roles: [${allowedRoles.join(', ')}]. Your role: '${req.user.role}'`
      );
    }

    next();
  };
};

/**
 * Super Admin Exclusive Authorization Middleware
 * Allows ONLY users with role: 'super_admin'
 */
const superAdminAuth = roleMiddleware('super_admin');

/**
 * Admin Level Authorization Middleware
 * Allows users with role: 'admin' OR 'super_admin'
 */
const adminAuth = roleMiddleware('admin', 'super_admin');

module.exports = {
  roleMiddleware,
  superAdminAuth,
  adminAuth
};
