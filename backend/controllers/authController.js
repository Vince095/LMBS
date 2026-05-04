/**
 * Auth controller - HTTP entry points for /api/auth.
 */

const authService = require('../services/authService');
const { HttpError } = require('../middleware/error');

async function register(req, res, next) {
    try {
        const result = await authService.register(req.body || {});
        res.status(201).json(result);
    } catch (err) { next(err); }
}

async function login(req, res, next) {
    try {
        const result = await authService.login(req.body || {});
        res.json(result);
    } catch (err) { next(err); }
}

async function logout(_req, res, _next) {
    // JWTs are stateless - there's nothing to revoke server-side without a
    // blacklist, and the stitch design doesn't introduce one. Tell the
    // client to drop the token on its side.
    res.json({ success: true });
}

async function me(req, res, next) {
    try {
        if (!req.user) throw new HttpError(401, 'Not authenticated');
        const user = await authService.getCurrent(req.user.id);
        res.json(user);
    } catch (err) { next(err); }
}

async function changePassword(req, res, next) {
    try {
        if (!req.user) throw new HttpError(401, 'Not authenticated');
        await authService.changePassword(req.user.id, req.body || {});
        res.json({ success: true });
    } catch (err) { next(err); }
}

module.exports = { register, login, logout, me, changePassword };
