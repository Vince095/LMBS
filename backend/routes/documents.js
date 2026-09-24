const express = require('express');
const env = require('../config/env');
const ctl = require('../controllers/documentController');

const router = express.Router();
// base64 inflates by ~4/3
router.post('/', express.json({ limit: Math.ceil(env.maxDocumentBytes * 1.4) }), ctl.upload);
router.get('/:docId', ctl.download);
router.get('/:docId/verify', ctl.verify);

module.exports = router;
