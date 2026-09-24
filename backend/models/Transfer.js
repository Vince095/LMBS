/**
 * transfers collection — SAD §5.3.
 *
 * Models the multi-step ownership transfer workflow (FR-OT-002):
 *   OWNER_CONSENT -> KYC_VERIFIED -> NOTARY_CERTIFIED -> OFFICER_APPROVED -> COMPLETE
 */

const { Schema, model } = require('mongoose');

const WORKFLOW_STEPS = [
    'OWNER_CONSENT',
    'KYC_VERIFIED',
    'NOTARY_CERTIFIED',
    'OFFICER_APPROVED',
    'COMPLETE',
];

// On-chain life-cycle (LandRegistry): PENDING_APPROVAL -> APPROVED -> COMPLETE,
// or REJECTED / CANCELLED. Only the chain indexer changes these statuses.
// The PENDING_* values are kept for records created before the refactor.
const STATUSES = [
    'PENDING_APPROVAL',
    'APPROVED',
    'COMPLETE',
    'REJECTED',
    'CANCELLED',
    'PENDING_OWNER',
    'PENDING_KYC',
    'PENDING_NOTARY',
    'PENDING_OFFICER',
];

const partySchema = new Schema({
    lnid: String,
    fullName: String,
    address: { type: String, lowercase: true },
}, { _id: false });

const stepSchema = new Schema({
    step: { type: String, enum: WORKFLOW_STEPS, required: true },
    completedAt: Date,
    completedBy: String,
    notes: String,
}, { _id: false });

const transferSchema = new Schema({
    transferId: { type: String, required: true, unique: true, index: true },
    parcelPin: { type: String, required: true, index: true },
    tokenId: { type: String, index: true },

    fromOwner: { type: partySchema, required: true },
    toOwner: { type: partySchema, required: true },

    considerationLSL: { type: Number, default: 0, min: 0 }, // FR-OT-007 sale price
    stampDutyLSL: { type: Number, default: 0, min: 0 },     // computed by LRA adapter
    isGiftTransfer: { type: Boolean, default: false },      // FR-OT-008

    status: { type: String, enum: STATUSES, default: 'PENDING_APPROVAL', index: true },
    chainRequestId: { type: Number, index: true, sparse: true },
    documentHash: String,
    workflowSteps: { type: [stepSchema], default: () => WORKFLOW_STEPS.map((s) => ({ step: s })) },

    escrowRef: String,
    blockchainTxId: { type: String, index: true },
    cancellationReason: String,
}, {
    timestamps: true,
    collection: 'transfers',
});

transferSchema.index({ parcelPin: 1, status: 1 });
transferSchema.index({ 'fromOwner.lnid': 1 });

transferSchema.statics.WORKFLOW_STEPS = WORKFLOW_STEPS;
transferSchema.statics.STATUSES = STATUSES;

module.exports = model('Transfer', transferSchema);
module.exports.WORKFLOW_STEPS = WORKFLOW_STEPS;
module.exports.STATUSES = STATUSES;
