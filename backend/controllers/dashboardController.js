const dashboardService = require('../services/dashboardService');

async function stats(_req, res, next) {
    try {
        res.json(await dashboardService.stats());
    } catch (err) { next(err); }
}

async function recentRegistrations(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        res.json(await dashboardService.recentRegistrations({ limit }));
    } catch (err) { next(err); }
}

module.exports = { stats, recentRegistrations };
