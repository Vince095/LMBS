const express = require('express');
const ctl = require('../controllers/networkController');
const router = express.Router();

router.get('/status',    ctl.status);
router.get('/tx/:txHash', ctl.getTransaction);

module.exports = router;
