/**
 * Certificate service — assembles the Blockchain Certificate response from
 * the Parcel + TitleDeed collections plus the AuditLog anchor.
 */

const crypto = require('crypto');
const { Parcel, TitleDeed, AuditLog } = require('../models');

function buildDID(parcel, deed) {
    const seed = `${parcel.pin}:${deed?.deedNumber || ''}:${parcel.blockchainTxId || ''}`;
    const h = crypto.createHash('sha256').update(seed).digest('hex').toUpperCase();
    return `DID:LMBS:${h.slice(0, 6)}:${h.slice(6, 14)}-${h.slice(14, 22)}-${h.slice(22, 34)}`;
}

async function getCertificate(id) {
    // `id` may be a parcel PIN or a deed number — try both.
    const [byPin, byDeed] = await Promise.all([
        Parcel.findOne({ pin: id }).lean(),
        TitleDeed.findOne({ deedNumber: id }).lean(),
    ]);

    const parcel = byPin || (byDeed ? await Parcel.findOne({ pin: byDeed.parcelPin }).lean() : null);
    if (!parcel) return null;

    const deed = byDeed || await TitleDeed.findOne({ parcelPin: parcel.pin }).lean();
    const anchor = await AuditLog.findOne({ resourceType: 'titles', resourceId: parcel.pin })
        .sort({ timestamp: 1 })
        .lean();

    const did = buildDID(parcel, deed);
    const proofHash = parcel.blockchainTxId ||
        crypto.createHash('sha256').update(JSON.stringify({ parcel, deed })).digest('hex');

    return {
        certificateId: deed?.deedNumber || parcel.pin,
        did,
        parcelPin: parcel.pin,
        deedNumber: deed?.deedNumber,
        owners: deed?.owners || [],
        currentOwner: deed?.owners?.[0]?.fullName || parcel.registeredBy?.name || 'Unknown',
        issueDate: deed?.issueDate || parcel.createdAt,
        expiry: deed?.status === 'REVOKED'
            ? deed.revocation?.revokedAt
            : 'Perpetual (Fee Simple)',
        legalDescription: parcel.legacyAddress
            || `Parcel ${parcel.pin}, ${parcel.district}. Total area: ${(parcel.areaM2 || 0).toLocaleString()} sq m.`,
        proofHash: '0x' + proofHash.replace(/^0x/, '').toUpperCase(),
        signedBy: anchor?.actorAddress || 'LMBS Authority Node 04',
        verified: deed?.status === 'ACTIVE' && parcel.status !== 'REVOKED',
        district: parcel.district,
        landUse: parcel.landUse,
        zoningCode: zoningCode(parcel.landUse),
        areaM2: parcel.areaM2,
        ipfsCid: deed?.ipfsCid,
    };
}

function zoningCode(landUse) {
    switch (landUse) {
        case 'COMMERCIAL':   return 'C-4 Commercial';
        case 'RESIDENTIAL':  return 'R-2 Residential';
        case 'AGRICULTURAL': return 'A-1 Agricultural';
        case 'INDUSTRIAL':   return 'I-3 Industrial';
        default:             return 'Z-0 Mixed Use';
    }
}

module.exports = { getCertificate };
