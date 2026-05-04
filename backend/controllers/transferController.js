/**
 * Transfer workflow controller — SAD §5.3 / FR-OT-002..009.
 *
 * Workflow: PENDING_OWNER → PENDING_KYC → PENDING_NOTARY → PENDING_OFFICER → COMPLETE
 *
 * ┌─────────────────────── SECURITY RULES ────────────────────────────────────┐
 * │ SEC-TRANSFER-01: A REGISTRY_OFFICER may NOT approve a transfer in which   │
 * │   they are the toOwner or fromOwner (validator self-dealing prohibition).  │
 * │ SEC-TRANSFER-02: Only the fromOwner's wallet address may consent at the   │
 * │   OWNER_CONSENT step — no other party can advance that step.              │
 * │ SEC-TRANSFER-03: CITIZEN role cannot advance any step beyond OWNER_CONSENT│
 * └───────────────────────────────────────────────────────────────────────────┘
 */

const { Transfer, Parcel, TitleDeed, Notification, Encumbrance } = require('../models');
const { HttpError } = require('../middleware/error');
const { v4: uuidv4 } = require('uuid');

// Step machine — maps current status to next status
const NEXT_STATUS = {
    PENDING_OWNER:   'PENDING_KYC',
    PENDING_KYC:     'PENDING_NOTARY',
    PENDING_NOTARY:  'PENDING_OFFICER',
    PENDING_OFFICER: 'COMPLETE',
};

// Which roles may advance each step
const STEP_ROLES = {
    PENDING_OWNER:   ['CITIZEN', 'REGISTRY_OFFICER', 'ADMIN'],
    PENDING_KYC:     ['REGISTRY_OFFICER', 'ADMIN'],
    PENDING_NOTARY:  ['NOTARY', 'REGISTRY_OFFICER', 'ADMIN'],
    PENDING_OFFICER: ['REGISTRY_OFFICER', 'ADMIN'],
};

// Map status → workflow step name
const STATUS_TO_STEP = {
    PENDING_OWNER:   'OWNER_CONSENT',
    PENDING_KYC:     'KYC_VERIFIED',
    PENDING_NOTARY:  'NOTARY_CERTIFIED',
    PENDING_OFFICER: 'OFFICER_APPROVED',
};

function selfDealingCheck(user, transfer) {
    if (!user) return;
    const ua = (user.address || '').toLowerCase();
    const from = (transfer.fromOwner && transfer.fromOwner.address || '').toLowerCase();
    const to   = (transfer.toOwner   && transfer.toOwner.address   || '').toLowerCase();
    if (ua && (ua === to || ua === from)) {
        throw new HttpError(403,
            'Self-dealing prohibited: a Registry Officer may not approve a transfer in which they are a party (SEC-TRANSFER-01).'
        );
    }
}

/**
 * GET /api/transfers
 * Paginated transfer list with optional status and parcelPin filters.
 */
async function list(req, res, next) {
    try {
        var limit  = Math.min(Number(req.query.limit) || 50, 200);
        var page   = Math.max(Number(req.query.page)  || 1,  1);
        var skip   = (page - 1) * limit;
        var filter = {};
        if (req.query.status)    filter.status    = req.query.status;
        if (req.query.parcelPin) filter.parcelPin = req.query.parcelPin;
        // CITIZEN can only see their own transfers
        if (req.user && req.user.role === 'CITIZEN' && req.user.address) {
            var addr = req.user.address.toLowerCase();
            filter.$or = [
                { 'fromOwner.address': addr },
                { 'toOwner.address':   addr },
            ];
        }
        var [transfers, total] = await Promise.all([
            Transfer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Transfer.countDocuments(filter),
        ]);
        res.json({ transfers: transfers, total: total, page: page, limit: limit, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
}

/**
 * GET /api/transfers/pending
 * Transfers awaiting action, with self-dealing flag for the calling officer.
 */
async function pending(req, res, next) {
    try {
        var pendingStatuses = ['PENDING_OWNER', 'PENDING_KYC', 'PENDING_NOTARY', 'PENDING_OFFICER'];
        var filter = { status: { $in: pendingStatuses } };
        var limit  = Math.min(Number(req.query.limit) || 100, 200);

        var transfers = await Transfer.find(filter).sort({ createdAt: -1 }).limit(limit).lean();

        var ua = (req.user && req.user.address || '').toLowerCase();
        var enriched = transfers.map(function(t) {
            var from = (t.fromOwner && t.fromOwner.address || '').toLowerCase();
            var to   = (t.toOwner   && t.toOwner.address   || '').toLowerCase();
            return Object.assign({}, t, {
                isSelfDealing:  ua && (ua === from || ua === to),
                allowedRoles:   STEP_ROLES[t.status] || [],
                canAdvance:     ua
                    ? !!(STEP_ROLES[t.status] || []).includes((req.user && req.user.role) || '')
                      && !(ua === from || ua === to)
                    : false,
            });
        });
        res.json(enriched);
    } catch (err) { next(err); }
}

/**
 * POST /api/transfers
 * Initiate a new transfer (FR-OT-002).
 * Validates that the requester is the current parcel owner.
 */
async function initiate(req, res, next) {
    try {
        var { parcelPin, toOwner, considerationLSL, stampDutyLSL, isGiftTransfer } = req.body;
        if (!parcelPin || !toOwner || !toOwner.address) {
            throw new HttpError(400, 'parcelPin and toOwner.address are required');
        }

        // Verify parcel exists
        var parcel = await Parcel.findOne({ pin: parcelPin }).lean();
        if (!parcel) throw new HttpError(404, 'Parcel ' + parcelPin + ' not found');

        // ── TC-DR-002 / FR-DR-002: Block transfer on DISPUTED parcel ─────────
        if (parcel.status === 'DISPUTED') {
            throw new HttpError(409,
                'Parcel ' + parcelPin + ' has an active dispute. All transactions are suspended until the dispute is resolved.'
            );
        }

        // ── TC-OT-002 / FR-OT-003: Block transfer on ENCUMBERED parcel ───────
        var activeEnc = await Encumbrance.countDocuments({ parcelPin: parcelPin, status: 'ACTIVE' });
        if (activeEnc > 0) {
            throw new HttpError(409,
                'Parcel ' + parcelPin + ' has ' + activeEnc + ' active encumbrance(s). Discharge all encumbrances before initiating a transfer (FR-OT-003).'
            );
        }

        // Verify caller is the current owner (SEC-TRANSFER-02)
        var deed = await TitleDeed.findOne({ parcelPin: parcelPin, status: 'ACTIVE' }).lean();
        if (deed && req.user && req.user.address) {
            var callerAddr = req.user.address.toLowerCase();
            var ownerAddrs = (deed.owners || []).map(function(o) { return (o.address || '').toLowerCase(); });
            if (ownerAddrs.length > 0 && !ownerAddrs.includes(callerAddr)) {
                throw new HttpError(403, 'Only the current registered owner may initiate a transfer (SEC-TRANSFER-02)');
            }
        }

        // ── TC-OT-007 / FR-OT-008: Gift transfer requires officer override ───
        // considerationLSL = 0 is only allowed when isGiftTransfer=true AND
        // the caller is a REGISTRY_OFFICER or ADMIN.
        var consideration = Number(considerationLSL) || 0;
        var callerRole2 = (req.user && req.user.role) || 'CITIZEN';
        if (consideration === 0 && !isGiftTransfer) {
            throw new HttpError(422,
                'Zero-value transfers require the isGiftTransfer flag to be set to true and must be approved by a Registry Officer.'
            );
        }
        if (isGiftTransfer && !['REGISTRY_OFFICER', 'ADMIN'].includes(callerRole2)) {
            throw new HttpError(403,
                'Gift transfers (zero consideration) require a Registry Officer to submit the request (FR-OT-008).'
            );
        }

        var fromOwner = {
            address: req.user ? req.user.address : (deed && deed.owners && deed.owners[0] ? deed.owners[0].address : ''),
            fullName: deed && deed.owners && deed.owners[0] ? deed.owners[0].fullName : '',
        };

        var transfer = await Transfer.create({
            transferId: uuidv4(),
            parcelPin: parcelPin,
            tokenId: parcel.tokenId || null,
            fromOwner: fromOwner,
            toOwner: {
                address: toOwner.address.toLowerCase(),
                fullName: toOwner.fullName || '',
                lnid: toOwner.lnid || '',
            },
            considerationLSL: considerationLSL || 0,
            stampDutyLSL: stampDutyLSL || 0,
            isGiftTransfer: isGiftTransfer || false,
            status: 'PENDING_OWNER',
        });

        res.status(201).json(transfer);
    } catch (err) { next(err); }
}

/**
 * POST /api/transfers/:transferId/advance
 * Advance the transfer to the next workflow step.
 *
 * Guards:
 *  - Role must be in STEP_ROLES[currentStatus]
 *  - REGISTRY_OFFICER/ADMIN cannot be a party to the transfer (self-dealing)
 *  - OWNER_CONSENT step: caller must be fromOwner
 */
async function advance(req, res, next) {
    try {
        var transfer = await Transfer.findOne({ transferId: req.params.transferId });
        if (!transfer) throw new HttpError(404, 'Transfer not found');
        if (transfer.status === 'COMPLETE' || transfer.status === 'CANCELLED') {
            throw new HttpError(409, 'Transfer is already ' + transfer.status);
        }

        var callerRole = (req.user && req.user.role) || 'CITIZEN';
        var callerAddr = (req.user && req.user.address || '').toLowerCase();

        // Validate role is allowed for this step
        var allowed = STEP_ROLES[transfer.status] || [];
        if (!allowed.includes(callerRole) && callerRole !== 'ADMIN') {
            throw new HttpError(403,
                'Role ' + callerRole + ' may not advance step ' + transfer.status +
                '. Required: ' + allowed.join(' or ')
            );
        }

        // Self-dealing check for officer-level steps
        if (['PENDING_KYC', 'PENDING_NOTARY', 'PENDING_OFFICER'].includes(transfer.status)) {
            selfDealingCheck(req.user, transfer);
        }

        // OWNER_CONSENT: only the fromOwner may consent
        if (transfer.status === 'PENDING_OWNER') {
            var fromAddr = (transfer.fromOwner && transfer.fromOwner.address || '').toLowerCase();
            if (callerAddr && fromAddr && callerAddr !== fromAddr && callerRole !== 'ADMIN') {
                throw new HttpError(403,
                    'Only the land owner (' + fromAddr.slice(0, 10) + '…) may consent to this transfer (SEC-TRANSFER-02)'
                );
            }
        }

        var nextStatus = NEXT_STATUS[transfer.status];
        var stepName   = STATUS_TO_STEP[transfer.status];
        var notes      = (req.body && req.body.notes) || '';

        // Mark step completed
        var stepIdx = transfer.workflowSteps.findIndex(function(s) { return s.step === stepName; });
        if (stepIdx !== -1) {
            transfer.workflowSteps[stepIdx].completedAt = new Date();
            transfer.workflowSteps[stepIdx].completedBy = callerAddr || callerRole;
            if (notes) transfer.workflowSteps[stepIdx].notes = notes;
        }

        transfer.status = nextStatus;
        transfer.markModified('workflowSteps');

        // On COMPLETE: update the TitleDeed
        if (nextStatus === 'COMPLETE') {
            await TitleDeed.findOneAndUpdate(
                { parcelPin: transfer.parcelPin, status: 'ACTIVE' },
                {
                    $set: {
                        owners: [{
                            fullName:   transfer.toOwner.fullName,
                            address:    transfer.toOwner.address,
                            lnid:       transfer.toOwner.lnid,
                            percentage: 100,
                        }],
                    },
                }
            );
            // Flag parcel status
            await Parcel.updateOne(
                { pin: transfer.parcelPin },
                { $set: { status: 'ACTIVE' } }
            );
        }

        await transfer.save();

        // Notify both parties
        try {
            await Notification.create({
                recipientAddress: transfer.toOwner.address,
                subject: 'Transfer update: ' + transfer.parcelPin,
                body: 'Your transfer is now at step: ' + nextStatus,
                relatedEntity: { type: 'TRANSFER', id: transfer.transferId },
            });
        } catch (_) { /* non-fatal */ }

        res.json(transfer);
    } catch (err) { next(err); }
}

/**
 * POST /api/transfers/:transferId/cancel
 * Cancel a pending transfer (REGISTRY_OFFICER, ADMIN, or fromOwner).
 */
async function cancel(req, res, next) {
    try {
        var transfer = await Transfer.findOne({ transferId: req.params.transferId });
        if (!transfer) throw new HttpError(404, 'Transfer not found');
        if (transfer.status === 'COMPLETE' || transfer.status === 'CANCELLED') {
            throw new HttpError(409, 'Transfer is already ' + transfer.status);
        }

        var callerRole = (req.user && req.user.role) || 'CITIZEN';
        var callerAddr = (req.user && req.user.address || '').toLowerCase();
        var fromAddr   = (transfer.fromOwner && transfer.fromOwner.address || '').toLowerCase();

        var canCancel = callerRole === 'ADMIN' || callerRole === 'REGISTRY_OFFICER' || callerAddr === fromAddr;
        if (!canCancel) {
            throw new HttpError(403, 'Only the owner, a Registry Officer, or Admin may cancel a transfer');
        }

        transfer.status = 'CANCELLED';
        transfer.cancellationReason = (req.body && req.body.reason) || 'Cancelled by ' + callerRole;
        await transfer.save();

        res.json(transfer);
    } catch (err) { next(err); }
}

/**
 * GET /api/transfers/:transferId
 * Get a single transfer with self-dealing annotation.
 */
async function getOne(req, res, next) {
    try {
        var transfer = await Transfer.findOne({ transferId: req.params.transferId }).lean();
        if (!transfer) throw new HttpError(404, 'Transfer not found');
        var ua   = (req.user && req.user.address || '').toLowerCase();
        var from = (transfer.fromOwner && transfer.fromOwner.address || '').toLowerCase();
        var to   = (transfer.toOwner   && transfer.toOwner.address   || '').toLowerCase();
        res.json(Object.assign({}, transfer, { isSelfDealing: ua && (ua === from || ua === to) }));
    } catch (err) { next(err); }
}

module.exports = { list, pending, initiate, advance, cancel, getOne };
