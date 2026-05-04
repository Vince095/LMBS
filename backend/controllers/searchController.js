/**
 * Search controller — wraps searchService for HTTP.
 */

const searchService = require('../services/searchService');

function num(value) {
    if (value === undefined || value === null || value === '') return undefined;
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
}

async function publicSearch(req, res, next) {
    try {
        const { pin, deedNumber, lng, lat, radiusMeters, limit } = req.query;
        res.json(await searchService.publicSearch({
            pin,
            deedNumber,
            lng: num(lng),
            lat: num(lat),
            radiusMeters: num(radiusMeters),
            limit: num(limit),
        }));
    } catch (err) { next(err); }
}

async function advancedSearch(req, res, next) {
    try {
        res.json(await searchService.advancedSearch({
            ownerLnid: req.query.ownerLnid,
            ownerName: req.query.ownerName,
            district: req.query.district,
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            limit: num(req.query.limit),
        }));
    } catch (err) { next(err); }
}

module.exports = { publicSearch, advancedSearch };
