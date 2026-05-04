/**
 * signatures collection — supports the existing signature-document storage
 * route. Validator mnemonic phrases are stored AES-256-CBC encrypted and only
 * the bytes32 hash is anchored on chain.
 */

const { Schema, model } = require('mongoose');

const STATUSES = ['active', 'archived', 'revoked'];

const signatureSchema = new Schema({
    txId: { type: String, required: true, index: true },
    validator: { type: String, required: true, lowercase: true, index: true },
    mnemonicPhrase: { type: String, required: true }, // encrypted, see services/signatureService.js
    hash: { type: String, required: true },
    timestamp: { type: Date, required: true },
    status: { type: String, enum: STATUSES, default: 'active' },
    metadata: {
        ipAddress: String,
        userAgent: String,
        approvalCount: { type: Number, default: 1 },
    },
}, {
    timestamps: true,
    collection: 'lmssignatures', // legacy name preserved
});

signatureSchema.statics.STATUSES = STATUSES;

module.exports = model('Signature', signatureSchema);
module.exports.STATUSES = STATUSES;
