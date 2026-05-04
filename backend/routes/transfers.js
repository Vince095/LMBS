/**
 * /api/transfers — Transfer Ownership workflow (FR-OT-002..009).
 *
 * Workflow steps (in order):
 *   PENDING_OWNER   → owner consent
 *   PENDING_KYC     → KYC verification
 *   PENDING_NOTARY  → notary certification
 *   PENDING_OFFICER → Registry Officer approval (SELF-DEALING BLOCKED)
 *   COMPLETE        → TitleDeed updated, ownership transferred
 *
 * All mutations require auth. The validator self-dealing guard is enforced
 * inside transferController.advance() (SEC-TRANSFER-01).
 */

const express = require('express');
const ctl = require('../controllers/transferController');
const { rbac } = require('../middleware/rbac');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// All transfer routes require authentication
router.use(authMiddleware({ required: true }));

// List / create
router.get('/',        ctl.list);
router.get('/pending', rbac(['REGISTRY_OFFICER', 'ADMIN']), ctl.pending);
router.post('/',       ctl.initiate);

// Per-transfer actions
router.get('/:transferId',          ctl.getOne);
router.post('/:transferId/advance', ctl.advance);
router.post('/:transferId/cancel',  ctl.cancel);

module.exports = router;
