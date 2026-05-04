/**
 * /api/certificates/:id — composes a Blockchain Certificate response.
 */

const express = require('express');
const ctl = require('../controllers/certificateController');

const router = express.Router();
router.get('/:id', ctl.get);

module.exports = router;
