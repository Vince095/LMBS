/**
 * Transfer controller — off-chain metadata for GOVERNED on-chain transfers.
 *
 * The workflow itself runs in the LandRegistry contract:
 *   owner submits (LandRegistry.submitTransfer, from the owner's wallet)
 *   -> M-of-N institutional approvals (approveRequest / EIP-712 votes)
 *   -> the contract transfers the title once the threshold is reached.
 *
 * This controller only records sale metadata (consideration, stamp duty,
 * documents) against a VERIFIED on-chain request. It cannot approve, advance
 * or complete a transfer; statuses are updated by the chain indexer.
 */

const { Transfer, Parcel, TitleDeed, Notification, User } = require('../models');
const chain = require('../services/chainService');
const { HttpError } = require('../middleware/error');
const { v4: uuidv4 } = require('uuid');

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
        var limit = Math.min(Number(req.query.limit) || 100, 200);
        var transfers = await Transfer.find({ status: { $in: ['PENDING_APPROVAL', 'APPROVED'] } })
            .sort({ createdAt: -1 }).limit(limit).lean();
        var ua = (req.user && req.user.address) || '';
        res.json(transfers.map(function(t) {
            var from = (t.fromOwner && t.fromOwner.address) || '';
            var to   = (t.toOwner && t.toOwner.address) || '';
            // Approvals happen on-chain; the contract also rejects conflicted approvers.
            return Object.assign({}, t, { isSelfDealing: !!ua && (ua === from || ua === to) });
        }));
    } catch (err) { next(err); }
}

/**
 * POST /api/transfers
 * Record metadata for a transfer the OWNER has already submitted on-chain.
 * Body: { chainTxHash, considerationLSL, stampDutyLSL, isGiftTransfer, toOwner: { fullName } }
 */
async function initiate(req, res, next) {
    try {
        var body = req.body || {};
        if (!body.chainTxHash) {
            throw new HttpError(400, 'chainTxHash required: the owner must first submit the transfer on-chain (LandRegistry.submitTransfer)');
        }
        chain.requireConfigured();

        // SEC-TRANSFER-02 is enforced by the contract (only the title holder can
        // submit); here we verify the transaction came from the caller's wallet.
        var sub = await chain.verifySubmission(body.chainTxHash, {
            expectedSubmitter: req.user.address,
            expectedKind: 'TRANSFER',
        });

        var consideration = Number(body.considerationLSL) || 0;
        if (consideration === 0 && !body.isGiftTransfer) {
            throw new HttpError(422, 'Zero-value transfers must be flagged isGiftTransfer=true (FR-OT-008); approvers will review the flag.');
        }

        var parcel = await Parcel.findOne({ tokenId: sub.tokenId }).lean();
        var deed = await TitleDeed.findOne({ tokenId: sub.tokenId, status: 'ACTIVE' }).lean();
        var buyer = await User.findOne({ address: sub.to }).lean();

        // Start from the chain's current status so a late call never regresses
        // a request the indexer has already completed.
        var live = await chain.readRequest(sub.requestId);
        var initialStatus = { PENDING: 'PENDING_APPROVAL', APPROVED: 'APPROVED', EXECUTED: 'COMPLETE', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' }[live.status] || 'PENDING_APPROVAL';

        var transfer = await Transfer.findOneAndUpdate(
            { chainRequestId: sub.requestId },
            { $setOnInsert: {
                transferId: uuidv4(),
                chainRequestId: sub.requestId,
                parcelPin: (parcel && parcel.pin) || (deed && deed.parcelPin) || sub.tokenId,
                tokenId: sub.tokenId,
                fromOwner: {
                    address: sub.from,
                    fullName: (deed && deed.owners && deed.owners[0] && deed.owners[0].fullName) || '',
                },
                toOwner: {
                    address: sub.to,
                    fullName: (body.toOwner && body.toOwner.fullName) || (buyer && buyer.name) || '',
                },
                considerationLSL: consideration,
                stampDutyLSL: Number(body.stampDutyLSL) || 0,
                isGiftTransfer: !!body.isGiftTransfer,
                documentHash: sub.documentHash,
                blockchainTxId: sub.txHash,
                status: initialStatus,
            } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        try {
            await Notification.create({
                recipientAddress: sub.to,
                subject: 'Transfer submitted: ' + transfer.parcelPin,
                body: 'A transfer to your wallet is awaiting institutional approval (request #' + sub.requestId + ').',
                relatedEntity: { type: 'TRANSFER', id: transfer.transferId },
            });
        } catch (_) { /* non-fatal */ }

        res.status(201).json(transfer);
    } catch (err) { next(err); }
}

/**
 * The former off-chain step machine is retired: approvals and cancellation
 * are on-chain actions (approveRequest / rejectRequest / cancel).
 */
function advance(_req, _res, next) {
    next(new HttpError(410, 'Approvals are recorded on-chain by authorised institutional approvers (LandRegistry.approveRequest).'));
}

function cancel(_req, _res, next) {
    next(new HttpError(410, 'Cancel the request on-chain from the submitting wallet (LandRegistry.cancel); the indexer updates this record.'));
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
