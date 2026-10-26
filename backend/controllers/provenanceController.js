const provenanceService = require('../services/provenanceService');
const { Parcel, TitleDeed } = require('../models');
const { HttpError } = require('../middleware/error');

/**
 * GET /api/parcels
 * Lists parcels with optional filters and page-based pagination.
 * Query params: district, status, landUse, limit (max 200), page (1-based).
 * Each row is enriched with currentOwner and deedNumber from the active TitleDeed.
 */
async function list(req, res, next) {
    try {
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const page  = Math.max(Number(req.query.page)  || 1,  1);
        const skip  = (page - 1) * limit;

        const filter = {};
        if (req.query.district) filter.district = req.query.district;
        if (req.query.status)   filter.status   = req.query.status;
        if (req.query.landUse)  filter.landUse  = req.query.landUse;

        const [parcels, total] = await Promise.all([
            Parcel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Parcel.countDocuments(filter),
        ]);

        const pins  = parcels.map(function(p) { return p.pin; });
        const deeds = await TitleDeed
            .find({ parcelPin: { $in: pins }, status: 'ACTIVE' })
            .select('parcelPin deedNumber owners')
            .lean();

        const deedMap = {};
        deeds.forEach(function(d) { deedMap[d.parcelPin] = d; });

        const enriched = parcels.map(function(p) {
            var deed  = deedMap[p.pin];
            var owner = deed && deed.owners && deed.owners[0] ? deed.owners[0].fullName : null;
            return Object.assign({}, p, {
                currentOwner: owner,
                deedNumber:   deed ? deed.deedNumber : null,
            });
        });

        res.json({ parcels: enriched, total: total, page: page, limit: limit, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
}

async function history(req, res, next) {
    try {
        var limit = Number(req.query.limit) || 50;
        res.json(await provenanceService.history(req.params.pin, { limit: limit }));
    } catch (err) { next(err); }
}

async function documents(req, res, next) {
    try {
        res.json(await provenanceService.documents(req.params.pin));
    } catch (err) { next(err); }
}

/**
 * GET /api/parcels/documents
 * Cross-parcel index of documents in the encrypted store.
 * Query params: type, district, limit (max 200), page (1-based).
 */
async function listDocuments(req, res, next) {
    try {
        res.json(await provenanceService.listDocuments({
            type: req.query.type,
            district: req.query.district,
            limit: Math.min(Number(req.query.limit) || 50, 200),
            page: Math.max(Number(req.query.page) || 1, 1),
        }));
    } catch (err) { next(err); }
}

async function gisHistory(req, res, next) {
    try {
        res.json(await provenanceService.gisHistory(req.params.pin));
    } catch (err) { next(err); }
}

async function notFoundIfMissing(_req, _res, next) {
    next(new HttpError(404, 'Use /api/parcels/:pin/{history|documents|gis-history}'));
}

module.exports = {
    list:              list,
    listDocuments:     listDocuments,
    history:           history,
    documents:         documents,
    gisHistory:        gisHistory,
    notFoundIfMissing: notFoundIfMissing,
    getParcel:         null, // set below
    search:            null, // set below
};

/**
 * GET /api/parcels/:pin
 * Full parcel detail: parcel + active deed + encumbrances + disputes + history summary.
 */
async function getParcel(req, res, next) {
    try {
        const { pin } = req.params;
        const { Encumbrance, Dispute } = require('../models');

        const [parcel, deed, encumbrances, disputes] = await Promise.all([
            Parcel.findOne({ pin }).lean(),
            TitleDeed.findOne({ parcelPin: pin, status: 'ACTIVE' }).lean(),
            Encumbrance.find({ parcelPin: pin }).sort({ createdAt: -1 }).lean(),
            Dispute.find({ parcelPin: pin }).sort({ createdAt: -1 }).lean(),
        ]);

        if (!parcel) {
            const { HttpError } = require('../middleware/error');
            throw new HttpError(404, `Parcel ${pin} not found`);
        }

        res.json({ parcel, deed, encumbrances, disputes });
    } catch (err) { next(err); }
}

/**
 * GET /api/parcels/search?q=…
 * Quick text search across pin, legacyAddress, district, landUse.
 * Returns up to 20 matches (for autocomplete / search-as-you-type).
 */
async function search(req, res, next) {
    try {
        const q = (req.query.q || '').trim();
        if (!q || q.length < 2) { return res.json({ parcels: [] }); }

        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        const parcels = await Parcel.find({
            $or: [
                { pin: regex },
                { legacyAddress: regex },
                { district: regex },
                { landUse: regex },
                { titleDeedRef: regex },
            ],
        }).limit(20).lean();

        const pins  = parcels.map((p) => p.pin);
        const deeds = await TitleDeed
            .find({ parcelPin: { $in: pins }, status: 'ACTIVE' })
            .select('parcelPin deedNumber owners').lean();
        const deedMap = {};
        deeds.forEach((d) => { deedMap[d.parcelPin] = d; });

        res.json({
            parcels: parcels.map((p) => ({
                ...p,
                currentOwner: deedMap[p.pin]?.owners?.[0]?.fullName || null,
                deedNumber:   deedMap[p.pin]?.deedNumber || null,
            })),
        });
    } catch (err) { next(err); }
}

module.exports.getParcel = getParcel;
module.exports.search    = search;
