/**
 * /api/admin — system administration (ADMIN role only).
 *
 * All routes require authentication + ADMIN role.
 */

const express = require('express');
const ctl = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.use(authMiddleware({ required: true }));
router.use(rbac(['ADMIN']));

router.get('/stats',                     ctl.stats);
router.get('/users',                     ctl.listUsers);
router.get('/users/:userId',             ctl.getUser);
router.put('/users/:userId',             ctl.updateUser);
router.post('/users/:userId/deactivate', ctl.deactivateUser);
router.post('/users/:userId/activate',   ctl.activateUser);

module.exports = router;
