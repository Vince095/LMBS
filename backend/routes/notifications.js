/**
 * /api/notifications — in-app notification centre (FR-NA-002).
 */

const express = require('express');
const ctl = require('../controllers/notificationController');

const router = express.Router();

router.get('/by-address/:address', ctl.listForUser);
router.post('/:id/read', ctl.markRead);
router.post('/', ctl.send);

module.exports = router;
