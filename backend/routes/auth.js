/**
 * /api/auth — registration, login, and wallet linking.
 *
 * Public:     POST /register, POST /login   (rate-limited)
 * Protected:  everything else
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const ctl = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const credentialLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT || 20),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts, try again later' },
});

router.post('/register', credentialLimiter, ctl.register);
router.post('/login', credentialLimiter, ctl.login);

router.use(authMiddleware({ required: true }));
router.post('/logout', ctl.logout);
router.get('/me', ctl.me);
router.post('/change-password', ctl.changePassword);
router.post('/wallet/challenge', ctl.walletChallenge);
router.post('/wallet/verify', ctl.walletVerify);

module.exports = router;
