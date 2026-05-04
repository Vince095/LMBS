/**
 * /api/titles — parcel & title-deed read/write.
 *
 * Routes:
 *   POST   /api/titles                    Register new parcel + title deed
 *   POST   /api/titles/store              Alias for above (legacy)
 *   POST   /api/titles/:deedNumber/revoke Revoke active deed (TC-TD-003)
 *   PATCH  /api/titles/:deedNumber        Amend deed + version history (TC-TD-005)
 *   GET    /api/titles/:parcelNumber      Get parcel + active deed
 */

const express = require('express');
const ctl     = require('../controllers/titleController');
const { authMiddleware } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

// Bulk CSV import — TC-LR-008 / FR-LR-007 (text/csv body, officer/admin only)
router.post(
    '/import',
    authMiddleware({ required: true }),
    rbac(['REGISTRY_OFFICER', 'ADMIN']),
    express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '5mb' }),
    ctl.importCsv
);

// Draft save/list — TC-LR-009 / FR-LR-008
router.post('/draft',  authMiddleware({ required: true }), ctl.saveDraft);
router.get('/drafts',  authMiddleware({ required: true }), ctl.listDrafts);

// Registration — any authenticated user (auth enforces role inside controller)
router.post('/',      authMiddleware({ required: true }), ctl.store);
router.post('/store', authMiddleware({ required: true }), ctl.store);

// Revoke — REGISTRY_OFFICER or ADMIN only
router.post(
    '/:deedNumber/revoke',
    authMiddleware({ required: true }),
    rbac(['REGISTRY_OFFICER', 'ADMIN']),
    ctl.revoke
);

// Amend — REGISTRY_OFFICER or ADMIN only
router.patch(
    '/:deedNumber',
    authMiddleware({ required: true }),
    rbac(['REGISTRY_OFFICER', 'ADMIN']),
    ctl.amend
);

// Read — public or auth-optional
router.get('/:parcelNumber', ctl.get);

module.exports = router;
