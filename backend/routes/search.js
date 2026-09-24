const express = require('express');
const ctl = require('../controllers/searchController');
const { rbac } = require('../middleware/rbac');

const router = express.Router();
// "public" = any authenticated user; there is no anonymous access.
router.get('/public', ctl.publicSearch);
router.get('/advanced', rbac(['REGISTRY_OFFICER', 'AUDITOR', 'NOTARY', 'SURVEYOR']), ctl.advancedSearch);

module.exports = router;
