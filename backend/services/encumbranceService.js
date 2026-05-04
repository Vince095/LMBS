/**
 * Encumbrance service — supports FR-OT-003 (unencumbered check) and the
 * Encumbrance management workflow.
 */

const { Encumbrance, Parcel } = require('../models');
const { makeEncumbranceId } = require('../utils/ids');
const { nextSequence } = require('../utils/counters');

async function register(payload) {
    const seq = await nextSequence('encumbrances');
    const encumbranceId = makeEncumbranceId(seq);

    const doc = await Encumbrance.create({
        ...payload,
        encumbranceId,
        status: 'ACTIVE',
    });

    await Parcel.updateOne({ pin: payload.parcelPin }, { $set: { status: 'ENCUMBERED' } });
    return doc;
}

async function discharge(encumbranceId, dischargedBy) {
    const doc = await Encumbrance.findOneAndUpdate(
        { encumbranceId },
        { $set: { status: 'DISCHARGED', dischargeDate: new Date() } },
        { new: true },
    );

    if (doc) {
        const stillActive = await Encumbrance.exists({
            parcelPin: doc.parcelPin,
            status: 'ACTIVE',
        });
        if (!stillActive) {
            await Parcel.updateOne({ pin: doc.parcelPin }, { $set: { status: 'ACTIVE' } });
        }
    }
    return doc;
}

async function listByParcel(parcelPin) {
    return Encumbrance.find({ parcelPin }).sort({ createdAt: -1 });
}

async function isUnencumbered(parcelPin) {
    const count = await Encumbrance.countDocuments({ parcelPin, status: 'ACTIVE' });
    return count === 0;
}

module.exports = { register, discharge, listByParcel, isUnencumbered };
