/**
 * /api/chain — chain configuration, indexed request read model, identity anchors.
 * All routes require authentication (mounted behind the global auth guard).
 */
const express = require('express');
const ctl = require('../controllers/chainController');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.get('/config', ctl.config);
router.get('/requests', ctl.listRequests);
router.get('/requests/:id', ctl.getRequest);
router.get('/identity-anchor/:userId', rbac(['REGISTRY_OFFICER']), ctl.identityAnchor);
router.post('/sync', rbac(['ADMIN']), ctl.sync);

module.exports = router;
