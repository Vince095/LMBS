/**
 * chain_requests collection — READ MODEL of LandRegistry requests.
 *
 * Written only by services/indexerService.js from on-chain events. The chain
 * is the authority; this collection exists for fast queries and dashboards.
 */

const { Schema, model } = require('mongoose');

const decisionSchema = new Schema({
    approver: { type: String, lowercase: true },
    decision: { type: String, enum: ['APPROVE', 'REJECT'] },
    reasonHash: String,
    viaSignature: Boolean,
    txHash: String,
    blockNumber: Number,
    at: Date, // mined block time
}, { _id: false });

const chainRequestSchema = new Schema({
    requestId: { type: Number, required: true, unique: true, index: true },
    kind: { type: String, enum: ['REGISTRATION', 'TRANSFER'], required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'CANCELLED'], index: true },
    parcelKey: { type: String, index: true },
    parcelNumber: { type: String, index: true },
    tokenId: String,
    submitter: { type: String, lowercase: true },
    from: { type: String, lowercase: true },
    to: { type: String, lowercase: true },
    documentHash: String,
    threshold: Number,
    approvals: { type: Number, default: 0 },
    rejections: { type: Number, default: 0 },
    decisions: [decisionSchema],
    blocker: String,
    submittedTx: String,
    submittedBlock: Number,
    submittedAt: Date, // mined block time
    executedTx: String,
    executedBlock: Number,
    executedAt: Date,
    closedTx: String,
}, { timestamps: true, collection: 'chain_requests' });

module.exports = model('ChainRequest', chainRequestSchema);
