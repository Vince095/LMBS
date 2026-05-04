/**
 * JWT authentication middleware 
 *
 * Permissive by default (env.requireAuth = false) - decodes the Bearer token
 * if present and attaches req.user, but lets anonymous traffic through. Use
 * authMiddleware({ required: true }) to gate a route hard.
 */

const jwt = (() => {
    try { return require('jsonwebtoken'); } catch (_) { return null; }
})();

const env = require('../config/env');

function decodeToken(token) {
    if (!jwt) return null;
    try {
        return jwt.verify(token, env.jwtSecret);
    } catch (_) {
        return null;
    }
}

function authMiddleware(options) {
    const opts = options || {};
    const required = opts.required == null ? env.requireAuth : opts.required;

    return (req, res, next) => {
        const header = req.headers.authorization || '';
        const m = header.match(/^Bearer\s+(.+)$/i);
        const token = m && m[1];

        if (token) {
            const claims = decodeToken(token);
            if (claims) {
                req.user = {
                    id: claims.sub,
                    address: claims.address ? claims.address.toLowerCase() : undefined,
                    email: claims.email,
                    role: claims.role,
                    lnid: claims.lnid,
                };
                req.token = token;
            }
        }

        if (required && !req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return next();
    };
}

module.exports = { authMiddleware, decodeToken };
