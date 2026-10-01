/**
 * encumbrances collection — SAD §5.3.
 *
 * Tracks mortgages, liens, and easements registered against a parcel.
 * FR-OT-003 requires the system to verify a parcel is unencumbered before a
 * transfer can be approved.
 */

const { Schema, model } = require('mongoose');

const TYPES = ['MORTGAGE', 'LIEN', 'EASEMENT', 'CAVEAT'];
const STATUSES = ['ACTIVE', 'DISCHARGED', 'EXPIRED'];

const encumbranceSchema = new Schema({
    encumbranceId: { type: String, required: true, unique: true, index: true },
    parcelPin: { type: String, required: true, index: true },
    tokenId: { type: String, index: true },

    type: { type: String, enum: TYPES, required: true },
    holder: {
        name: { type: String, required: true },
        address: { type: String, lowercase: true },
        institutionId: String,
    },
    amountLSL: { type: Number, default: 0, min: 0 },
    interestRateBps: { type: Number, default: 0, min: 0 }, // basis points (1bp = 0.01%)

    startDate: { type: Date, default: Date.now },
    expiryDate: Date,
    dischargeDate: Date,
    dischargedBy: { type: String, lowercase: true },

    status: { type: String, enum: STATUSES, default: 'ACTIVE', index: true },
    description: String,
    blockchainTxId: { type: String, index: true },
}, {
    timestamps: true,
    collection: 'encumbrances',
});

encumbranceSchema.index({ parcelPin: 1, status: 1 });
encumbranceSchema.statics.TYPES = TYPES;
encumbranceSchema.statics.STATUSES = STATUSES;

module.exports = model('Encumbrance', encumbranceSchema);
module.exports.TYPES = TYPES;
module.exports.STATUSES = STATUSES;
