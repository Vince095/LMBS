/**
 * Dispute controller — REST handlers for the dispute resolution module.
 *
 * FR-DR-001..007 implementation.
 *
 * Security rules:
 *  SEC-DISPUTE-01: Only REGISTRY_OFFICER or ADMIN may assign / resolve disputes.
 *  SEC-DISPUTE-02: An officer cannot assign a dispute to themselves if they are
 *                  the filing party (filerAddress === callerAddress).
 *  SEC-DISPUTE-03: A resolved or withdrawn dispute cannot be reassigned.
 */

const disputeService = require('../services/disputeService');
const { Dispute, User, Parcel } = require('../models');
const { HttpError } = require('../middleware/error');

/* ── helpers ────────────────────────────────────────────────────────────────── */
const TERMINAL_STATUSES = ['RESOLVED', 'WITHDRAWN'];

/* ── GET /api/disputes  ─────────────────────────────────────────────────────── */
async function list(req, res, next) {
    try {
        const limit  = Math.min(Number(req.query.limit) || 50, 200);
        const page   = Math.max(Number(req.query.page)  || 1,  1);
        const skip   = (page - 1) * limit;

        const filter = {};
        if (req.query.status)           filter.status    = req.query.status;
        if (req.query.parcelPin)        filter.parcelPin = req.query.parcelPin;
        if (req.query.assignedOfficer)  filter.assignedOfficer = req.query.assignedOfficer;
        // My disputes: only show disputes filed by or assigned to caller
        if (req.query.mine === 'true' && req.user) {
            const addr = (req.user.address || '').toLowerCase();
            filter.$or = [{ filerAddress: addr }, { assignedOfficer: addr }];
        }

        const [disputes, total] = await Promise.all([
            Dispute.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Dispute.countDocuments(filter),
        ]);

        res.json({ disputes, total, page, limit, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
}

/* ── GET /api/disputes/:disputeId  ─────────────────────────────────────────── */
async function getOne(req, res, next) {
    try {
        const dispute = await Dispute.findOne({ disputeId: req.params.disputeId }).lean();
        if (!dispute) throw new HttpError(404, `Dispute ${req.params.disputeId} not found`);
        res.json(dispute);
    } catch (err) { next(err); }
}

/* ── POST /api/disputes  ────────────────────────────────────────────────────── */
async function file(req, res, next) {
    try {
        const { parcelPin, tokenId, filerLnid, filerAddress, description, evidence } = req.body;
        if (!parcelPin || !filerAddress || !description) {
            throw new HttpError(400, 'parcelPin, filerAddress and description are required');
        }
        const dispute = await disputeService.file({
            parcelPin, tokenId, filerLnid, filerAddress, description, evidence,
        });
        res.status(201).json(dispute);
    } catch (err) { next(err); }
}

/* ── POST /api/disputes/:disputeId/assign  ──────────────────────────────────── */
async function assign(req, res, next) {
    try {
        const { officerAddress, officerName, notes } = req.body;
        if (!officerAddress) throw new HttpError(400, 'officerAddress is required');

        const dispute = await Dispute.findOne({ disputeId: req.params.disputeId });
        if (!dispute) throw new HttpError(404, `Dispute ${req.params.disputeId} not found`);

        // SEC-DISPUTE-03: cannot reassign a terminal dispute
        if (TERMINAL_STATUSES.includes(dispute.status)) {
            throw new HttpError(409,
                `Dispute is already ${dispute.status} and cannot be reassigned.`
            );
        }

        // SEC-DISPUTE-02: officer cannot self-assign a dispute they filed
        const callerAddr = (req.user?.address || '').toLowerCase();
        const targetAddr = officerAddress.toLowerCase();
        if (callerAddr && targetAddr === dispute.filerAddress) {
            throw new HttpError(403,
                'Cannot assign a dispute to the officer who filed it (SEC-DISPUTE-02).'
            );
        }

        const resolvedName = officerName || await User.findOne({ address: targetAddr }).then(u => u?.name || targetAddr);

        dispute.assignedOfficer = targetAddr;
        dispute.status = 'UNDER_REVIEW';
        if (notes) {
            dispute.notes.push({
                author: callerAddr || 'system',
                note: `Assigned to ${resolvedName}. ${notes}`,
                addedAt: new Date(),
            });
        }
        await dispute.save();

        // Notify the assigned officer
        const notify = require('../services/notificationService');
        await notify.sendInApp({
            address: targetAddr,
            subject: `Dispute ${dispute.disputeId} assigned to you`,
            body: `You have been assigned to review dispute ${dispute.disputeId} on parcel ${dispute.parcelPin}.`,
            relatedEntity: { type: 'dispute', id: dispute.disputeId },
        });

        res.json(dispute);
    } catch (err) { next(err); }
}

/* ── POST /api/disputes/:disputeId/evidence  ────────────────────────────────── */
async function submitEvidence(req, res, next) {
    try {
        const updated = await disputeService.submitEvidence(req.params.disputeId, req.body);
        if (!updated) throw new HttpError(404, 'Dispute not found');
        res.json(updated);
    } catch (err) { next(err); }
}

/* ── POST /api/disputes/:disputeId/notes  ───────────────────────────────────── */
async function addNote(req, res, next) {
    try {
        const { author, note } = req.body;
        if (!note?.trim()) throw new HttpError(400, 'note text is required');
        const callerAddr = req.user?.address || author || 'unknown';
        const updated = await disputeService.addNote(req.params.disputeId, callerAddr, note);
        if (!updated) throw new HttpError(404, 'Dispute not found');
        res.json(updated);
    } catch (err) { next(err); }
}

/* ── POST /api/disputes/:disputeId/resolve  ─────────────────────────────────── */
async function resolve(req, res, next) {
    try {
        const { decision, notes, courtOrderRef } = req.body;
        if (!decision) throw new HttpError(400, 'decision is required (UPHELD | DISMISSED | WITHDRAWN | ESCALATED)');

        const dispute = await Dispute.findOne({ disputeId: req.params.disputeId });
        if (!dispute) throw new HttpError(404, 'Dispute not found');
        if (TERMINAL_STATUSES.includes(dispute.status)) {
            throw new HttpError(409, `Dispute is already ${dispute.status}.`);
        }

        const resolvedBy = req.user?.address || 'unknown';
        const updated = await disputeService.resolve(req.params.disputeId, {
            resolvedBy, decision, notes, courtOrderRef,
        });
        res.json(updated);
    } catch (err) { next(err); }
}

/* ── POST /api/disputes/:disputeId/escalate  ────────────────────────────────── */
async function escalate(req, res, next) {
    try {
        const { escalatedTo } = req.body;
        if (!escalatedTo?.trim()) throw new HttpError(400, 'escalatedTo is required');
        const updated = await disputeService.escalate(req.params.disputeId, escalatedTo);
        if (!updated) throw new HttpError(404, 'Dispute not found');
        res.json(updated);
    } catch (err) { next(err); }
}

/* ── POST /api/disputes/:disputeId/withdraw  ────────────────────────────────── */
async function withdraw(req, res, next) {
    try {
        const dispute = await Dispute.findOne({ disputeId: req.params.disputeId });
        if (!dispute) throw new HttpError(404, 'Dispute not found');

        const callerAddr = (req.user?.address || '').toLowerCase();
        const isOfficer  = req.user?.role === 'REGISTRY_OFFICER' || req.user?.role === 'ADMIN';

        // Only the filer or an officer may withdraw
        if (!isOfficer && callerAddr !== dispute.filerAddress) {
            throw new HttpError(403, 'Only the filer or a Registry Officer may withdraw a dispute.');
        }
        if (TERMINAL_STATUSES.includes(dispute.status)) {
            throw new HttpError(409, `Dispute is already ${dispute.status}.`);
        }

        const parcelPin = dispute.parcelPin;
        dispute.status = 'WITHDRAWN';
        dispute.resolution = {
            resolvedAt: new Date(),
            resolvedBy: callerAddr,
            decision: 'WITHDRAWN',
            notes: req.body.reason || 'Withdrawn by ' + callerAddr,
        };
        await dispute.save();

        // TC-DR-005 / FR-DR-007: unblock parcel if no other open disputes remain
        const stillDisputed = await Dispute.exists({
            parcelPin,
            status: { $in: ['OPEN', 'UNDER_REVIEW'] },
        });
        if (!stillDisputed) {
            await Parcel.updateOne({ pin: parcelPin }, { $set: { status: 'ACTIVE' } });
        }

        res.json(dispute);
    } catch (err) { next(err); }
}

/* ── GET /api/disputes/by-parcel/:parcelPin  ─────────────────────────────────── */
async function listByParcel(req, res, next) {
    try {
        res.json(await disputeService.listByParcel(req.params.parcelPin));
    } catch (err) { next(err); }
}

module.exports = { list, getOne, file, assign, submitEvidence, addNote, resolve, escalate, withdraw, listByParcel };
