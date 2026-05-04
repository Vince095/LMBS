/**
 * /api/audit — audit log query (NFR-013).
 *
 * Read-only endpoints for the Auditor role. The audit trail is written
 * automatically by the audit middleware; this router exposes a query interface
 * for compliance reporting.
 */

const express = require('express');
const { AuditLog } = require('../models');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.get('/', rbac(['AUDITOR', 'ADMIN']), async (req, res, next) => {
    try {
        const { actorAddress, action, resourceType, fromDate, toDate, limit = 100 } = req.query;
        const filter = {};
        if (actorAddress) filter.actorAddress = actorAddress.toLowerCase();
        if (action) filter.action = action;
        if (resourceType) filter.resourceType = resourceType;
        if (fromDate || toDate) {
            filter.timestamp = {};
            if (fromDate) filter.timestamp.$gte = new Date(fromDate);
            if (toDate) filter.timestamp.$lte = new Date(toDate);
        }
        const entries = await AuditLog.find(filter)
            .sort({ timestamp: -1 })
            .limit(Math.min(Number(limit) || 100, 500));
        res.json(entries);
    } catch (err) { next(err); }
});

module.exports = router;
