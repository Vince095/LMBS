/**
 * audit_log collection — SAD §5.3 (capped, 50 GB) and SRS NFR-013.
 *
 * Append-only audit trail covering every state-changing API call. Records
 * actor identity, action, target resource, IP, and timestamp.
 *
 * NOTE: We declare this as a normal collection in Mongoose because Mongoose
 * doesn't expose a built-in capping helper; the deployment script should run
 * `db.runCommand({ convertToCapped: 'audit_log', size: 50 * 1024**3 })` once.
 */

const { Schema, model } = require('mongoose');

const auditLogSchema = new Schema({
    actorId: { type: String, index: true },
    actorAddress: { type: String, lowercase: true, index: true },
    actorRole: String,

    action: { type: String, required: true, index: true },
    resourceType: { type: String, index: true },
    resourceId: { type: String, index: true },

    method: String,
    path: String,
    statusCode: Number,
    requestBody: Schema.Types.Mixed,
    responseSummary: Schema.Types.Mixed,

    ipAddress: String,
    userAgent: String,
    blockchainTxId: String,

    timestamp: { type: Date, default: Date.now, index: true },
}, {
    versionKey: false,
    collection: 'audit_log',
});

// SAD §5.4: TTL not strictly applicable (we want indefinite), but we DO want
// time-based queries for compliance reports.
auditLogSchema.index({ timestamp: -1 });

module.exports = model('AuditLog', auditLogSchema);
