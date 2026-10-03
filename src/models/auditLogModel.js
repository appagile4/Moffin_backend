const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    actorRole: {
      type: String,
      enum: ['super_admin', 'admin', 'staff', 'vendor', 'client', 'system'],
      required: true,
      index: true
    },
    action: {
      type: String,
      required: [true, 'Audit action name is required'],
      index: true
    },
    targetType: {
      type: String,
      required: true,
      index: true
    },
    targetId: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: null
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
