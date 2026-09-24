/**
 * /api/titles — off-chain metadata for on-chain registrations.
 *
 * POST /           record metadata for a registration ALREADY submitted on-chain
 *                  by the caller's verified wallet (body.chainTxHash is verified)
 * POST /draft      save a wizard draft (off-chain only, 30-day TTL)
 * POST /import     CSV import of DRAFT parcels (no deeds are created)
 * POST /:deed/revoke, PATCH /:deed   officer-only off-chain annotations
 *                  (ownership can never be changed here)
 */
const express = require('express');
const ctl     = require('../controllers/titleController');
const { requireVerifiedWallet } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.post('/import', rbac(['REGISTRY_OFFICER']),
    express.text({ type: ['text/csv', 'text/plain', 'application/octet-stream'], limit: '5mb' }), ctl.importCsv);
router.post('/draft',  ctl.saveDraft);
router.get('/drafts',  ctl.listDrafts);
router.post('/',       requireVerifiedWallet, ctl.store);
router.post('/:deedNumber/revoke', rbac(['REGISTRY_OFFICER']), ctl.revoke);
router.patch('/:deedNumber', rbac(['REGISTRY_OFFICER']), ctl.amend);
router.get('/:parcelNumber', ctl.get);

module.exports = router;
