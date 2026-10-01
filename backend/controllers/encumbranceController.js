/**
 * Encumbrance controller — mortgages, liens, easements, caveats.
 *
 * SEC-ENC-01: Only FINANCIAL_INST or REGISTRY_OFFICER/ADMIN may register
 *             an encumbrance.
 * SEC-ENC-02: Only the registering institution or REGISTRY_OFFICER/ADMIN
 *             may discharge an encumbrance.
 * FR-OT-003: Transfer is blocked while any ACTIVE encumbrance exists.
 */

const encumbranceService = require('../services/encumbranceService');
const { Encumbrance } = require('../models');
const { HttpError } = require('../middleware/error');

/* ── GET /api/encumbrances  ─────────────────────────────────────────────────── */
async function list(req, res, next) {
    try {
        const limit  = Math.min(Number(req.query.limit) || 50, 200);
        const page   = Math.max(Number(req.query.page)  || 1,  1);
        const skip   = (page - 1) * limit;

        const filter = {};
        if (req.query.status)    filter.status    = req.query.status;
        if (req.query.type)      filter.type      = req.query.type;
        if (req.query.parcelPin) filter.parcelPin = req.query.parcelPin;
        // Holder filter (financial institution viewing their own)
        if (req.query.holderAddress) {
            filter['holder.address'] = req.query.holderAddress.toLowerCase();
        }

        const [encumbrances, total] = await Promise.all([
            Encumbrance.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Encumbrance.countDocuments(filter),
        ]);

        res.json({ encumbrances, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
}

/* ── GET /api/encumbrances/:encumbranceId  ──────────────────────────────────── */
async function getOne(req, res, next) {
    try {
        const enc = await Encumbrance.findOne({ encumbranceId: req.params.encumbranceId }).lean();
        if (!enc) throw new HttpError(404, `Encumbrance ${req.params.encumbranceId} not found`);
        res.json(enc);
    } catch (err) { next(err); }
}

/* ── POST /api/encumbrances  ────────────────────────────────────────────────── */
async function register(req, res, next) {
    try {
        const { parcelPin, type, holder } = req.body;
        if (!parcelPin || !type || !holder?.name) {
            throw new HttpError(400, 'parcelPin, type and holder.name are required');
        }

        const VALID_TYPES = ['MORTGAGE', 'LIEN', 'EASEMENT', 'CAVEAT'];
        if (!VALID_TYPES.includes(type)) {
            throw new HttpError(400, `type must be one of: ${VALID_TYPES.join(', ')}`);
        }

        // Record who registered it
        const registeredBy = req.user?.address || 'system';
        res.status(201).json(
            await encumbranceService.register({ ...req.body, registeredBy })
        );
    } catch (err) { next(err); }
}

/* ── POST /api/encumbrances/:encumbranceId/discharge  ───────────────────────── */
async function discharge(req, res, next) {
    try {
        const enc = await Encumbrance.findOne({ encumbranceId: req.params.encumbranceId });
        if (!enc) throw new HttpError(404, 'Encumbrance not found');
        if (enc.status !== 'ACTIVE') {
            throw new HttpError(409, `Encumbrance is already ${enc.status}.`);
        }

        // SEC-ENC-02: only holder or officer may discharge
        const callerAddr = (req.user?.address || '').toLowerCase();
        const isOfficer  = req.user?.role === 'REGISTRY_OFFICER' || req.user?.role === 'ADMIN';
        if (!isOfficer && callerAddr !== (enc.holder.address || '').toLowerCase()) {
            throw new HttpError(403, 'Only the encumbrance holder or a Registry Officer may discharge (SEC-ENC-02).');
        }

        // Recorded from the authenticated caller, never from the request body.
        const dischargedBy = callerAddr || String(req.user.id);
        const updated = await encumbranceService.discharge(req.params.encumbranceId, dischargedBy);
        res.json(updated);
    } catch (err) { next(err); }
}

/* ── GET /api/encumbrances/by-parcel/:parcelPin  ────────────────────────────── */
async function listByParcel(req, res, next) {
    try {
        res.json(await encumbranceService.listByParcel(req.params.parcelPin));
    } catch (err) { next(err); }
}

/* ── GET /api/encumbrances/by-parcel/:parcelPin/unencumbered  ───────────────── */
async function checkUnencumbered(req, res, next) {
    try {
        res.json({
            parcelPin: req.params.parcelPin,
            unencumbered: await encumbranceService.isUnencumbered(req.params.parcelPin),
        });
    } catch (err) { next(err); }
}

module.exports = { list, getOne, register, discharge, listByParcel, checkUnencumbered };
