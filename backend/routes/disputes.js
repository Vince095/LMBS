/**
 * /api/disputes — Dispute Resolution module (FR-DR-001..007).
 */

const express = require('express');
const ctl = require('../controllers/disputeController');
const { authMiddleware } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

const validateDisputeId = (req, res, next) => {
    const { disputeId } = req.params;
    const disputeIdRegex = /^[A-Z0-9-]+$/;
    
    if (disputeId && !disputeIdRegex.test(disputeId)) {
        return res.status(400).json({ 
            error: 'Invalid Dispute ID format. Must be alphanumeric with hyphens.' 
        });
    }
    next();
};

// All dispute routes require authentication.
router.use(authMiddleware({ required: true }));

// ── Read ──────────────────────────────────────────────────────────────────────
// GET  /api/disputes               — paginated list (any authenticated user)
router.get('/', ctl.list);

// GET  /api/disputes/:disputeId    — single dispute
router.get('/:disputeId', validateDisputeId, ctl.getOne);

// GET  /api/disputes/by-parcel/:pin — disputes for one parcel
router.get('/by-parcel/:parcelPin', ctl.listByParcel);

// ── File & evidence ───────────────────────────────────────────────────────────
// POST /api/disputes               — any registered user may file
router.post('/', ctl.file);

// POST /api/disputes/:disputeId/evidence
router.post('/:disputeId/evidence', ctl.submitEvidence);

// ── Filer action ──────────────────────────────────────────────────────────────
// POST /api/disputes/:disputeId/withdraw — filer or officer
router.post('/:disputeId/withdraw', ctl.withdraw);

// ── Officer actions (REGISTRY_OFFICER or ADMIN) ───────────────────────────────
// POST /api/disputes/:disputeId/assign
router.post('/:disputeId/assign',   rbac(['REGISTRY_OFFICER', 'ADMIN']), ctl.assign);

// POST /api/disputes/:disputeId/notes
router.post('/:disputeId/notes',    rbac(['REGISTRY_OFFICER', 'ADMIN']), ctl.addNote);

// POST /api/disputes/:disputeId/resolve
router.post('/:disputeId/resolve',  rbac(['REGISTRY_OFFICER', 'ADMIN']), ctl.resolve);

// POST /api/disputes/:disputeId/escalate
router.post('/:disputeId/escalate', rbac(['REGISTRY_OFFICER', 'ADMIN']), ctl.escalate);

module.exports = router;
