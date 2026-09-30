const AuditLog = require('../models/auditLogModel');

/**
 * Log an administrative or financial action
 * @param {Object} params
 */
const logAction = async ({
  actor,
  actorRole = 'system',
  action,
  targetType,
  targetId,
  metadata = {},
  ipAddress = null,
  session = null
}) => {
  try {
    const logDoc = new AuditLog({
      actor: actor || 'system',
      actorRole,
      action,
      targetType,
      targetId,
      metadata,
      ipAddress,
      timestamp: new Date()
    });

    if (session) {
      await logDoc.save({ session });
    } else {
      await logDoc.save();
    }
    return logDoc;
  } catch (err) {
    console.error('AuditLog Error:', err.message);
    // Don't break main transaction if standalone logging fails
  }
};

module.exports = {
  logAction
};
