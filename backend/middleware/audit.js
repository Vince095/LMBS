/**
 * Audit middleware.
 *
 * Logs every state-changing request (POST/PUT/PATCH/DELETE) into the
 * `audit_log` collection asynchronously. Read requests are NOT logged here to
 * keep the audit trail focused on actions; reads can be aggregated separately
 * via Kong access logs (SAD §6.1).
 */

const env = require('../config/env');
const { AuditLog } = require('../models');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function summariseBody(body) {
    if (!body) return undefined;
    try {
        const json = JSON.parse(JSON.stringify(body));
        // Strip likely-sensitive fields.
        ['mnemonicPhrase', 'password', 'privateKey', 'secret', 'token'].forEach((k) => {
            if (k in json) json[k] = '<redacted>';
        });
        return json;
    } catch {
        return undefined;
    }
}

function inferResource(path) {
    // /api/<resource>/...
    const m = path.match(/^\/api\/([^/?]+)(?:\/([^/?]+))?/);
    return m ? { resourceType: m[1], resourceId: m[2] } : { resourceType: 'unknown' };
}

function auditMiddleware() {
    if (!env.auditEnabled) {
        return (_req, _res, next) => next();
    }

    return (req, res, next) => {
        if (!MUTATING_METHODS.has(req.method)) return next();

        const startedAt = Date.now();
        const originalJson = res.json.bind(res);
        let responsePreview;

        res.json = (body) => {
            try {
                responsePreview = body && typeof body === 'object'
                    ? Object.keys(body).slice(0, 8).reduce((acc, k) => { acc[k] = typeof body[k]; return acc; }, {})
                    : undefined;
            } catch { /* ignore */ }
            return originalJson(body);
        };

        res.on('finish', () => {
            const { resourceType, resourceId } = inferResource(req.path);
            const entry = {
                actorId: req.user?.id,
                actorAddress: req.user?.address,
                actorRole: req.user?.role,
                action: req.method,
                resourceType,
                resourceId,
                method: req.method,
                path: req.originalUrl || req.url,
                statusCode: res.statusCode,
                requestBody: summariseBody(req.body),
                responseSummary: responsePreview,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                timestamp: new Date(startedAt),
            };

            AuditLog.create(entry).catch((err) => {
                /* eslint-disable no-console */
                console.error('[audit] failed to persist entry:', err.message);
                /* eslint-enable no-console */
            });
        });

        next();
    };
}

module.exports = { auditMiddleware };
