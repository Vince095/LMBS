/**
 * JWT authentication middleware.
 *
 * Authentication is REQUIRED BY DEFAULT. server.js mounts this globally after
 * the few public endpoints (health, login, register), so every other route
 * rejects anonymous requests with 401. There is no "permissive" mode.
 *
 * The token carries the user id, role and — only once the user has proved
 * control of it by signing a challenge — the verified wallet address.
 */

const jwt = require('jsonwebtoken');
const env = require('../config/env');

function decodeToken(token) {
    try {
        return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    } catch (_) {
        return null;
    }
}

function authMiddleware(options) {
    const required = !options || options.required !== false;

    return (req, res, next) => {
        const header = req.headers.authorization || '';
        const m = header.match(/^Bearer\s+(.+)$/i);
        const token = m && m[1];

        if (token) {
            const claims = decodeToken(token);
            if (claims) {
                req.user = {
                    id: claims.sub,
                    address: claims.walletVerified && claims.address ? claims.address.toLowerCase() : undefined,
                    walletVerified: !!claims.walletVerified,
                    email: claims.email,
                    role: claims.role,
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

/** Requires the caller to have linked and verified a wallet (for on-chain actions). */
function requireVerifiedWallet(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!req.user.walletVerified || !req.user.address) {
        return res.status(403).json({ error: 'A verified wallet is required. Link your wallet in your profile first.' });
    }
    return next();
}

module.exports = { authMiddleware, requireVerifiedWallet, decodeToken };
