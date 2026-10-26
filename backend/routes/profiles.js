/**
 * /api/profiles — user profiles (OFF-CHAIN personal data).
 *
 * Personal data (name, email, phone, address, date of birth, LNID) lives only
 * in MongoDB and is never written to the blockchain.
 * The former unauthenticated POST /store (which could create any profile,
 * including a role) has been removed; accounts are created via /api/auth/register.
 */
const express = require('express');
const ctl = require('../controllers/profileController');
const { rbac, selfOrRoles } = require('../middleware/rbac');

const router = express.Router();

router.get('/me', ctl.getMe);
router.put('/me', ctl.updateMe);
router.get('/list', rbac(['REGISTRY_OFFICER', 'AUDITOR']), ctl.listAll);
router.get('/:address', selfOrRoles((req) => req.params.address, ['REGISTRY_OFFICER', 'NOTARY', 'AUDITOR']), ctl.get);

module.exports = router;
