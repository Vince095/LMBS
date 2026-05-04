/**
 * title_deeds collection — SAD §5.3.
 *
 * Implements FR-TD-001..006: digitally issued title deeds, co-ownership with
 * percentages, full version history, revocation events.
 */

const { Schema, model } = require('mongoose');

const ownerSchema = new Schema({
    lnid: String,
    fullName: { type: String, required: true },
    address: { type: String, lowercase: true }, // EVM address
    percentage: { type: Number, min: 0, max: 100, required: true },
}, { _id: false });

const titleDeedSchema = new Schema({
    deedNumber: { type: String, required: true, unique: true, index: true }, // FR-TD-001
    parcelPin: { type: String, required: true, index: true },
    tokenId: { type: Number, index: true, sparse: true },

    owners: {
        type: [ownerSchema],
        validate: {
            validator(arr) {
                if (!arr || !arr.length) return false;
                const total = arr.reduce((s, o) => s + (o.percentage || 0), 0);
                // FR-TD-006 — co-ownership percentages must sum to 100%.
                return Math.abs(total - 100) < 0.001;
            },
            message: 'Owner percentages must sum to 100',
        },
    },

    issueDate: { type: Date, default: Date.now },
    issuedAt:  { type: Date },                      // alias used by provenanceService
    issuedBy:  { type: String },                    // officer address / name
    status: { type: String, enum: ['ACTIVE', 'REVOKED', 'TRANSFERRED'], default: 'ACTIVE' },

    encumbrances: [{
        encumbranceId: String,
        type: String,
        amountLSL: Number,
    }],

    signingOfficerId: String,
    ipfsCid: String,         // signed PDF certificate (FR-TD-004)
    blockchainTxId: String,
    version: { type: Number, default: 1 },
    history: [{
        version: Number,
        changedAt: Date,
        changedBy: String,
        snapshot: Schema.Types.Mixed,
    }],

    revocation: {
        revokedAt: Date,
        revokedBy: String,
        reason: String,
        courtOrderRef: String,
    },
}, {
    timestamps: true,
    collection: 'title_deeds',
});

module.exports = model('TitleDeed', titleDeedSchema);
