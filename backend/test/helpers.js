const jwt = require('jsonwebtoken');

function token(claims = {}, opts = {}) {
    return jwt.sign(
        { sub: claims.sub || '64b000000000000000000001', role: claims.role || 'CITIZEN', walletVerified: !!claims.address, address: claims.address, ...claims },
        opts.secret || process.env.JWT_SECRET,
        { expiresIn: opts.expiresIn || '10m', algorithm: 'HS256' },
    );
}

const bearer = (claims, opts) => ({ Authorization: `Bearer ${token(claims, opts)}` });

module.exports = { token, bearer };
