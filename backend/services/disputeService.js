/**
 * Dispute service.
 *
 *   - file()           Files a new dispute, flags the parcel, notifies all parties.
 *   - submitEvidence() Adds an IPFS-anchored evidence document.
 *   - addNote()        Officer note for the case file.
 *   - resolve()        Closes the dispute and unflags the parcel (FR-DR-007).
 *   - escalate()       Marks the dispute as ESCALATED to a higher authority.
 */

const { Dispute, Parcel } = require('../models');
const { makeDisputeId } = require('../utils/ids');
const { nextSequence } = require('../utils/counters');
const notify = require('./notificationService');

async function file({ parcelPin, tokenId, filerLnid, filerAddress, description, evidence = [] }) {
    const seq = await nextSequence('disputes');
    const disputeId = makeDisputeId(seq);

    const dispute = await Dispute.create({
        disputeId,
        parcelPin,
        tokenId,
        filerLnid,
        filerAddress: filerAddress.toLowerCase(),
        description,
        evidence,
        status: 'OPEN',
    });

    await Parcel.updateOne({ pin: parcelPin }, { $set: { status: 'DISPUTED' } });

    await notify.sendInApp({
        address: filerAddress,
        subject: `Dispute ${disputeId} filed`,
        body: `Your dispute against parcel ${parcelPin} has been filed and is under review.`,
        relatedEntity: { type: 'dispute', id: disputeId },
    });

    return dispute;
}

async function submitEvidence(disputeId, payload) {
    return Dispute.findOneAndUpdate(
        { disputeId },
        { $push: { evidence: { ...payload, submittedAt: new Date() } } },
        { new: true },
    );
}

async function addNote(disputeId, author, note) {
    return Dispute.findOneAndUpdate(
        { disputeId },
        { $push: { notes: { author, note, addedAt: new Date() } } },
        { new: true },
    );
}

async function resolve(disputeId, { resolvedBy, decision, notes, courtOrderRef }) {
    const dispute = await Dispute.findOneAndUpdate(
        { disputeId },
        {
            $set: {
                status: decision === 'ESCALATED' ? 'ESCALATED' : 'RESOLVED',
                resolution: { resolvedAt: new Date(), resolvedBy, decision, notes, courtOrderRef },
            },
        },
        { new: true },
    );

    if (dispute && dispute.status === 'RESOLVED') {
        
        const stillDisputed = await Dispute.exists({
            parcelPin: dispute.parcelPin,
            status: { $in: ['OPEN', 'UNDER_REVIEW'] },
        });
        if (!stillDisputed) {
            await Parcel.updateOne({ pin: dispute.parcelPin }, { $set: { status: 'ACTIVE' } });
        }

        await notify.sendInApp({
            address: dispute.filerAddress,
            subject: `Dispute ${disputeId} resolved`,
            body: `Decision: ${decision}.${notes ? ' ' + notes : ''}`,
            relatedEntity: { type: 'dispute', id: disputeId },
        });
    }

    return dispute;
}

async function escalate(disputeId, escalatedTo) {
    return Dispute.findOneAndUpdate(
        { disputeId },
        { $set: { status: 'ESCALATED', escalatedTo } },
        { new: true },
    );
}

async function listByParcel(parcelPin) {
    return Dispute.find({ parcelPin }).sort({ createdAt: -1 });
}

async function getActiveDisputeCount(parcelPin) {
    return Dispute.countDocuments({
        parcelPin,
        status: { $in: ['OPEN', 'UNDER_REVIEW'] },
    });
}

module.exports = {
    file,
    submitEvidence,
    addNote,
    resolve,
    escalate,
    listByParcel,
    getActiveDisputeCount,
};
