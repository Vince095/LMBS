/**
 * /api/profiles — user profile management.
 *
 * /me routes require authentication (Bearer token).
 * /store and /:address remain backward-compatible for the legacy flow.
 */

const express = require('express');
const ctl = require('../controllers/profileController');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Self-service profile (requires auth)
router.get('/me',  authMiddleware({ required: true }), ctl.getMe);
router.put('/me',  authMiddleware({ required: true }), ctl.updateMe);

// Legacy routes (backward-compatible)
router.post('/store', ctl.store);
router.get('/list', ctl.listAll);
router.get('/:address', ctl.get);

module.exports = router;
