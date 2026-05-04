/**
 * /api/auth - registration / login / logout / me / change-password.
 *
 * Login + register are public. /me + /change-password require a Bearer token.
 */

const express = require('express');
const ctl = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.post('/register', ctl.register);
router.post('/login', ctl.login);
router.post('/logout', ctl.logout);

// Strict auth on the protected endpoints regardless of env.requireAuth.
router.get('/me', authMiddleware({ required: true }), ctl.me);
router.post('/change-password', authMiddleware({ required: true }), ctl.changePassword);

module.exports = router;
