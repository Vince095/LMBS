/**
 * Certificate service — assembles the certificate from the Parcel + TitleDeed
 * read models and VERIFIES it against the LandRegistry contract:
 * a certificate is only marked verified when the deed is ACTIVE, anchored,
 * and the on-chain owner of the title token matches the deed owner.
 * No proof hash is ever invented: `proofHash` is the real execution tx or null.
 */

const crypto = require('crypto');
const { Parcel, TitleDeed, AuditLog } = require('../models');
const chain = require('./chainService');

async function onChainCheck(deed) {
    if (!deed || !deed.tokenId || !chain.isConfigured()) return { checked: false };
    try {
        const registry = chain.contract('LandRegistry');
        const owner = (await registry.ownerOf(deed.tokenId)).toLowerCase();
        const documentHash = await registry.titleDocumentHash(deed.tokenId);
        const deedOwner = ((deed.owners || [])[0] || {}).address || '';
        return { checked: true, tokenId: deed.tokenId, owner, documentHash, ownerMatches: owner === deedOwner.toLowerCase() };
    } catch (err) {
        return { checked: false, error: err.shortMessage || err.message };
    }
}

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

    const deed = byDeed
        || await TitleDeed.findOne({ parcelPin: parcel.pin, status: 'ACTIVE' }).lean()
        || await TitleDeed.findOne({ parcelPin: parcel.pin }).sort({ createdAt: -1 }).lean();
    const anchor = await AuditLog.findOne({ resourceType: 'titles', resourceId: parcel.pin })
        .sort({ timestamp: 1 })
        .lean();

    const did = buildDID(parcel, deed);
    const onChain = await onChainCheck(deed);
    const proofHash = deed && deed.anchored ? deed.blockchainTxId : null;

    return {
        certificateId: deed?.deedNumber || parcel.pin,
        did,
        parcelPin: parcel.pin,
        deedNumber: deed?.deedNumber,
        owners: deed?.owners || [],
        currentOwner: deed?.owners?.[0]?.fullName || null,
        issueDate: deed?.issueDate || parcel.createdAt,
        expiry: deed?.status === 'REVOKED'
            ? deed.revocation?.revokedAt
            : 'Perpetual (Fee Simple)',
        legalDescription: parcel.legacyAddress
            || `Parcel ${parcel.pin}, ${parcel.district}. Total area: ${(parcel.areaM2 || 0).toLocaleString()} sq m.`,
        proofHash,
        signedBy: anchor?.actorAddress || null,
        onChain,
        verified: !!(deed && deed.status === 'ACTIVE' && deed.anchored && onChain.checked && onChain.ownerMatches),
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
