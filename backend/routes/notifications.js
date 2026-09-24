/**
 * /api/notifications — in-app notification centre (FR-NA-002).
 * Users read and mark only their own notifications; sending is for officers.
 */
const express = require('express');
const ctl = require('../controllers/notificationController');
const { rbac, selfOrRoles } = require('../middleware/rbac');

const router = express.Router();

router.get('/by-address/:address', selfOrRoles((req) => req.params.address, ['REGISTRY_OFFICER', 'AUDITOR']), ctl.listForUser);
router.post('/:id/read', ctl.markRead);
router.post('/', rbac(['REGISTRY_OFFICER']), ctl.send);

module.exports = router;
