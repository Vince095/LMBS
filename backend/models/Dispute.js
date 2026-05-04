/**
 * disputes collection — SAD §5.3.
 *
 * Implements FR-DR-001..007. Filing a dispute auto-flags the parcel and blocks
 * transfer / encumbrance transactions until resolution.
 */

const { Schema, model } = require('mongoose');

const evidenceSchema = new Schema({
    description: String,
    ipfsCid: String,
    sha256: String,
    submittedBy: String,
    submittedAt: { type: Date, default: Date.now },
}, { _id: false });

const noteSchema = new Schema({
    author: String,
    note: String,
    addedAt: { type: Date, default: Date.now },
}, { _id: false });

const STATUSES = ['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'WITHDRAWN'];

const disputeSchema = new Schema({
    disputeId: { type: String, required: true, unique: true, index: true },
    parcelPin: { type: String, required: true, index: true },
    tokenId: { type: Number, index: true },

    filerLnid: String,
    filerAddress: { type: String, lowercase: true, required: true },
    description: { type: String, required: true },

    status: { type: String, enum: STATUSES, default: 'OPEN', index: true },
    evidence: [evidenceSchema],
    notes: [noteSchema],

    assignedOfficer: String,
    escalatedTo: String, // higher authority / court reference
    resolution: {
        resolvedAt: Date,
        resolvedBy: String,
        decision: { type: String, enum: ['UPHELD', 'DISMISSED', 'WITHDRAWN', 'ESCALATED'] },
        notes: String,
        courtOrderRef: String,
    },

    blockchainTxId: { type: String, index: true },
}, {
    timestamps: true,
    collection: 'disputes',
});

disputeSchema.index({ parcelPin: 1, status: 1 });
disputeSchema.statics.STATUSES = STATUSES;

module.exports = model('Dispute', disputeSchema);
module.exports.STATUSES = STATUSES;
