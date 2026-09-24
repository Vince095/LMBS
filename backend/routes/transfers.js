/**
 * /api/transfers — metadata for governed on-chain transfers.
 * Approval, rejection and cancellation are on-chain actions; the old
 * /advance and /cancel endpoints answer 410 Gone.
 */
const express = require('express');
const ctl = require('../controllers/transferController');
const { requireVerifiedWallet } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.get('/',        ctl.list);
router.get('/pending', rbac(['REGISTRY_OFFICER', 'NOTARY', 'AUDITOR']), ctl.pending);
router.post('/',       requireVerifiedWallet, ctl.initiate);
router.get('/:transferId',          ctl.getOne);
router.post('/:transferId/advance', ctl.advance);
router.post('/:transferId/cancel',  ctl.cancel);

module.exports = router;
