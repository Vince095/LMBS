/**
 * /api/dashboard — feeds the GovTech LMBS Dashboard screen.
 */

const express = require('express');
const ctl = require('../controllers/dashboardController');

const router = express.Router();

router.get('/stats', ctl.stats);
router.get('/recent-registrations', ctl.recentRegistrations);

module.exports = router;
