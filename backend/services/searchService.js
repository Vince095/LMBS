/**
 * Search service — SRS FR-SQ-001..005.
 *
 *   publicSearch  -- by PIN, deed number, or coordinates (FR-SQ-001).
 *   advanced      -- authenticated, by owner LNID/name, district, date range
 *                   (FR-SQ-002).
 *
 * Performance budget: 3 seconds for up to 10,000 concurrent users
 * (FR-SQ-005). The Mongo indexes declared in `models/Parcel.js` cover all of
 * these queries.
 */

const { Parcel, TitleDeed, Encumbrance, Dispute } = require('../models');

async function decorate(parcels) {
    return Promise.all(parcels.map(async (p) => {
        const obj = p.toObject ? p.toObject() : p;
        const [activeEnc, activeDisp] = await Promise.all([
            Encumbrance.countDocuments({ parcelPin: obj.pin, status: 'ACTIVE' }),
            Dispute.countDocuments({ parcelPin: obj.pin, status: { $in: ['OPEN', 'UNDER_REVIEW'] } }),
        ]);
        return { ...obj, hasActiveEncumbrance: activeEnc > 0, hasActiveDispute: activeDisp > 0 };
    }));
}

async function publicSearch({ pin, deedNumber, lng, lat, radiusMeters = 1000, limit = 25 }) {
    const filters = [];

    if (pin) filters.push({ pin });

    if (deedNumber) {
        const deed = await TitleDeed.findOne({ deedNumber });
        if (deed) filters.push({ pin: deed.parcelPin });
    }

    if (typeof lng === 'number' && typeof lat === 'number') {
        filters.push({
            location: {
                $near: {
                    $geometry: { type: 'Point', coordinates: [lng, lat] },
                    $maxDistance: radiusMeters,
                },
            },
        });
    }

    if (!filters.length) return [];

    const parcels = await Parcel.find(filters.length === 1 ? filters[0] : { $or: filters })
        .limit(Math.min(limit, 100));
    return decorate(parcels);
}

async function advancedSearch({ ownerLnid, ownerName, district, status, fromDate, toDate, limit = 50 }) {
    const filters = {};
    if (district) filters.district = district;
    if (status) filters.status = status;
    if (fromDate || toDate) {
        filters.createdAt = {};
        if (fromDate) filters.createdAt.$gte = new Date(fromDate);
        if (toDate) filters.createdAt.$lte = new Date(toDate);
    }

    let pinFilter;
    if (ownerLnid || ownerName) {
        const deedFilter = {};
        if (ownerLnid) deedFilter['owners.lnid'] = ownerLnid;
        if (ownerName) deedFilter['owners.fullName'] = new RegExp(ownerName, 'i');
        const deeds = await TitleDeed.find(deedFilter).select('parcelPin').limit(500);
        pinFilter = { pin: { $in: deeds.map((d) => d.parcelPin) } };
    }

    const finalFilter = pinFilter ? { ...filters, ...pinFilter } : filters;
    if (!Object.keys(finalFilter).length) return [];

    const parcels = await Parcel.find(finalFilter).limit(Math.min(limit, 200));
    return decorate(parcels);
}

module.exports = { publicSearch, advancedSearch };
