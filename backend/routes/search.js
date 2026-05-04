/**
 * /api/search — public + authenticated parcel search (FR-SQ-001..002).
 */

const express = require('express');
const ctl = require('../controllers/searchController');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

// FR-SQ-001 — public search by PIN/deed/coords.
router.get('/public', ctl.publicSearch);

// FR-SQ-002 — authenticated advanced search.
router.get('/advanced', rbac(['REGISTRY_OFFICER', 'AUDITOR', 'NOTARY', 'SURVEYOR']), ctl.advancedSearch);

module.exports = router;
