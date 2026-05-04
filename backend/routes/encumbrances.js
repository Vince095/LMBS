/**
 * /api/encumbrances — encumbrance management (mortgages, liens, easements, caveats).
 */

const express = require('express');
const ctl = require('../controllers/encumbranceController');
const { authMiddleware } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.use(authMiddleware({ required: true }));

// ── Read (all authenticated users) ───────────────────────────────────────────
router.get('/', ctl.list);
router.get('/by-parcel/:parcelPin', ctl.listByParcel);
router.get('/by-parcel/:parcelPin/unencumbered', ctl.checkUnencumbered);
router.get('/:encumbranceId', ctl.getOne);

// ── Write (FINANCIAL_INST, REGISTRY_OFFICER, ADMIN) ───────────────────────────
router.post('/',
    rbac(['FINANCIAL_INST', 'REGISTRY_OFFICER', 'ADMIN']),
    ctl.register
);

router.post('/:encumbranceId/discharge',
    rbac(['FINANCIAL_INST', 'REGISTRY_OFFICER', 'ADMIN']),
    ctl.discharge
);

module.exports = router;
