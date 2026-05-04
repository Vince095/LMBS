/**
 * /api/signatures — encrypted off-chain validator signature documents.
 *
 * Crypto helpers moved to services/cryptoService.js.
 */

const express = require('express');
const ctl = require('../controllers/signatureController');

const router = express.Router();

router.post('/store', ctl.store);
router.get('/:documentId', ctl.get);

module.exports = router;
