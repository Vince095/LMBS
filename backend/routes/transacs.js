/**
 * /api/transacs — chain-transaction telemetry log (kept for back-compat).
 *
 * NOTE: New code should write to the AuditLog collection (see middleware/audit.js).
 * This route is preserved so the existing frontend telemetry hooks keep working.
 */

const express = require('express');
const { getCollections } = require('../config/db');

const router = express.Router();

router.post('/log', async (req, res, next) => {
    try {
        const { lms_trancs } = getCollections();
        if (!lms_trancs) return res.status(500).json({ error: 'Database not initialized' });

        const { txHash, type, from, to, amount, details } = req.body;

        const result = await lms_trancs.insertOne({
            txHash,
            type,
            from: from ? from.toLowerCase() : null,
            to: to ? to.toLowerCase() : null,
            amount,
            details,
            timestamp: new Date(),
        });

        res.json({ success: true, result });
    } catch (err) { next(err); }
});

router.get('/analytics', async (req, res, next) => {
    try {
        const { lms_trancs } = getCollections();
        if (!lms_trancs) return res.status(500).json({ error: 'Database not initialized' });

        const count = await lms_trancs.countDocuments();
        const recent = await lms_trancs.find().sort({ timestamp: -1 }).limit(10).toArray();
        res.json({ totalTransactions: count, recent });
    } catch (err) { next(err); }
});

module.exports = router;
