/**
 * Role-Based Access Control middleware
 *
 * Usage:
 *   router.post('/foo', rbac(['REGISTRY_OFFICER', 'ADMIN']), handler);
 *
 * Behaves consistently with auth.js: when env.requireAuth is false the
 * middleware logs the would-be denial but still allows the request through, so
 * we don't break the existing frontend during the targeted refactor. When
 * env.requireAuth is true it returns 403 to unauthorised users.
 */

const env = require('../config/env');

function rbac(allowedRoles = []) {
    const allow = new Set(allowedRoles.map((r) => r.toUpperCase()));

    return (req, res, next) => {
        const role = (req.user?.role || '').toUpperCase();
        const ok = allow.size === 0 || allow.has(role) || role === 'ADMIN';

        if (!ok) {
            if (env.requireAuth) {
                return res.status(403).json({
                    error: 'Forbidden',
                    requiredRole: [...allow],
                    actualRole: role || null,
                });
            }
            /* eslint-disable no-console */
            console.warn(`[rbac] would-deny ${req.method} ${req.path}: role=${role || 'none'} required=${[...allow].join('|')}`);
            /* eslint-enable no-console */
        }

        return next();
    };
}

module.exports = { rbac };
