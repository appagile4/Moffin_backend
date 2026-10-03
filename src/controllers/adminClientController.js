const mongoose = require('mongoose');
const Client = require('../models/clientModel');
const { logAction } = require('../services/auditService');

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
// 1. ADMIN CLIENT STATISTICS
// =============================================================================

/**
 * @desc    Get real-time statistics of all registered clients for Admin Dashboard
 * @route   GET /api/admin/clients/stats
 * @access  Private (Admin / SuperAdmin)
 */
const getAdminClientStats = async (req, res) => {
  try {
    const [
      totalClients,
      activeClients,
      inactiveClients,
      blockedClients,
      verifiedClients,
      unverifiedClients
    ] = await Promise.all([
      Client.countDocuments(),
      Client.countDocuments({ status: 'active', isActive: true, isBlocked: false }),
      Client.countDocuments({
        $or: [
          { status: 'inactive', isBlocked: false },
          { isActive: false, isBlocked: false }
        ]
      }),
      Client.countDocuments({
        $or: [
          { status: 'blocked' },
          { isBlocked: true }
        ]
      }),
      Client.countDocuments({ isVerified: true }),
      Client.countDocuments({ isVerified: false })
    ]);

    return sendSuccess(res, 200, 'Client statistics retrieved successfully', {
      totalClients,
      activeClients,
      inactiveClients,
      blockedClients,
      verifiedClients,
      unverifiedClients
    });
  } catch (error) {
    console.error('getAdminClientStats Error:', error);
    return sendError(res, 500, error.message || 'Error fetching client statistics');
  }
};

// =============================================================================
// 2. ADMIN CLIENT LIST WITH PAGINATION, SEARCH, AND FILTERS
// =============================================================================

/**
 * @desc    Get paginated list of clients with search and status filters
 * @route   GET /api/admin/clients
 * @access  Private (Admin / SuperAdmin)
 */
const getAdminClients = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};

    // 1. Status and Verification Filters
    if (status) {
      const cleanStatus = status.toLowerCase().trim();
      if (cleanStatus === 'active') {
        query.status = 'active';
        query.isActive = true;
        query.isBlocked = false;
      } else if (cleanStatus === 'inactive') {
        query.$or = [
          { status: 'inactive', isBlocked: false },
          { isActive: false, isBlocked: false }
        ];
      } else if (cleanStatus === 'blocked') {
        query.$or = [
          { status: 'blocked' },
          { isBlocked: true }
        ];
      } else if (cleanStatus === 'verified') {
        query.isVerified = true;
      } else if (cleanStatus === 'unverified') {
        query.isVerified = false;
      }
    }

    // 2. Search Keyword (Name, Email, Mobile, Platform, Business, or ID)
    if (search && search.trim()) {
      const term = search.trim();
      const searchRegex = new RegExp(term, 'i');

      const searchConditions = [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        { mobile: searchRegex },
        { whatsappNumber: searchRegex },
        { alternativeMobileNumber: searchRegex },
        { platformUrl: searchRegex },
        { businessType: searchRegex },
        { telegramIds: searchRegex }
      ];

      // If search keyword is a valid ObjectId, search by _id as well
      if (isValidObjectId(term)) {
        searchConditions.push({ _id: new mongoose.Types.ObjectId(term) });
      }

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    // 3. Sorting
    const sortField = ['createdAt', 'firstName', 'lastName', 'email', 'status', 'lastLoginAt'].includes(sortBy)
      ? sortBy
      : 'createdAt';
    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortDirection };

    // 4. Query Database
    const [clients, total] = await Promise.all([
      Client.find(query)
        .select('-password')
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Client.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limitNum) || 1;

    return sendSuccess(res, 200, 'Clients retrieved successfully', {
      clients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages
      }
    });
  } catch (error) {
    console.error('getAdminClients Error:', error);
    return sendError(res, 500, error.message || 'Error fetching clients list');
  }
};

// =============================================================================
// 3. ADMIN CLIENT DETAILS
// =============================================================================

/**
 * @desc    Get complete details of a specific client
 * @route   GET /api/admin/clients/:clientId
 * @access  Private (Admin / SuperAdmin)
 */
const getAdminClientById = async (req, res) => {
  try {
    const { clientId } = req.params;

    if (!isValidObjectId(clientId)) {
      return sendError(res, 400, 'Invalid client ID format');
    }

    const client = await Client.findById(clientId).select('-password');
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    return sendSuccess(res, 200, 'Client details retrieved successfully', { client });
  } catch (error) {
    console.error('getAdminClientById Error:', error);
    return sendError(res, 500, error.message || 'Error fetching client details');
  }
};

// =============================================================================
// 4. ADMIN CLIENT STATUS MANAGEMENT (Activate / Deactivate / Block / Unblock)
// =============================================================================

/**
 * @desc    Update client account status (active / inactive / blocked / isVerified)
 * @route   PATCH /api/admin/clients/:clientId/status
 * @access  Private (Admin / SuperAdmin)
 */
const updateAdminClientStatus = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { status, isActive, isBlocked, isVerified, reason } = req.body;

    if (!isValidObjectId(clientId)) {
      return sendError(res, 400, 'Invalid client ID format');
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return sendError(res, 404, 'Client not found');
    }

    const oldStatus = {
      status: client.status,
      isActive: client.isActive,
      isBlocked: client.isBlocked,
      isVerified: client.isVerified
    };

    // 1. Process explicit status update
    if (status !== undefined) {
      const cleanStatus = status.toLowerCase().trim();
      if (!['active', 'inactive', 'blocked'].includes(cleanStatus)) {
        return sendError(res, 400, "Invalid status. Allowed values are 'active', 'inactive', 'blocked'");
      }

      client.status = cleanStatus;
      if (cleanStatus === 'active') {
        client.isActive = true;
        client.isBlocked = false;
      } else if (cleanStatus === 'inactive') {
        client.isActive = false;
        client.isBlocked = false;
      } else if (cleanStatus === 'blocked') {
        client.isActive = false;
        client.isBlocked = true;
      }
    } else {
      // 2. Process boolean flag updates
      if (isBlocked !== undefined) {
        client.isBlocked = Boolean(isBlocked);
        if (client.isBlocked) {
          client.status = 'blocked';
          client.isActive = false;
        } else if (client.status === 'blocked') {
          client.status = 'active';
          client.isActive = true;
        }
      }

      if (isActive !== undefined && !client.isBlocked) {
        client.isActive = Boolean(isActive);
        client.status = client.isActive ? 'active' : 'inactive';
      }
    }

    // 3. Process verification status update
    if (isVerified !== undefined) {
      client.isVerified = Boolean(isVerified);
    }

    await client.save();

    const safeClient = client.toObject();
    delete safeClient.password;

    // 4. Audit Log
    await logAction({
      actor: req.user?.id || 'admin',
      actorRole: req.user?.role || 'admin',
      action: 'CLIENT_STATUS_UPDATED',
      targetType: 'Client',
      targetId: client._id.toString(),
      metadata: {
        oldStatus,
        newStatus: {
          status: client.status,
          isActive: client.isActive,
          isBlocked: client.isBlocked,
          isVerified: client.isVerified
        },
        reason: reason || null
      }
    });

    return sendSuccess(res, 200, `Client status successfully updated to '${client.status}'`, {
      client: safeClient
    });
  } catch (error) {
    console.error('updateAdminClientStatus Error:', error);
    return sendError(res, 500, error.message || 'Error updating client status');
  }
};

module.exports = {
  getAdminClientStats,
  getAdminClients,
  getAdminClientById,
  updateAdminClientStatus
};
