/**
 * Provenance service — feeds Property Details, Transaction History, and the
 * GIS Parcel History screens.
 *
 * Composes a parcel's full event ledger by merging on-chain chaincode events
 * projected into MongoDB (SAD section 5.5):
 *
 *   SAD chaincode events mapped (SAD section 4.4):
 *     LandParcelCC  → CreateParcel      → PARCEL_REGISTERED
 *                  → UpdateParcel      → BOUNDARY_UPDATED
 *     TitleDeedCC   → IssueDeed         → TITLE_ISSUED
 *                  → AmendDeed         → TITLE_AMENDED
 *                  → RevokeDeed        → TITLE_REVOKED
 *     TransferCC    → InitiateTransfer  → TRANSFER_INITIATED
 *                  → ApproveTransfer   → TRANSFER_APPROVED
 *                  → CompleteTransfer  → TRANSFER_COMPLETED
 *                  → CancelTransfer    → TRANSFER_CANCELLED
 *     LandTitleExtensions → SupportingDocAttached → DOCUMENT_ATTACHED
 *     AuditCC       → LogEvent          → AUDIT_EVENT
 *
 * IMPORTANT: EncumbranceCC and DisputeCC events are NOT surfaced here.
 *            Encumbrances and disputes are not handled in this release.
 *
 * Also exposes:
 *   uploadDocument(pin, docData)  — add a supporting doc to a parcel
 *   documents(pin)                — IPFS-anchored supporting docs for a parcel
 *   gisHistory(pin)               — coarser timeline events for the satellite view
 */

const { Parcel, Transfer, AuditLog, TitleDeed } = require('../models');

// ─── Event type registry ────────────────────────────────────────────────────
// Maps the canonical event type string (stored in MongoDB / emitted by
// the Blockchain Event Listener) to display metadata.
const EVENT_META = {
    // Land Parcel Chaincode (LandParcelCC)
    'PARCEL_REGISTERED':  { label: 'Parcel Registered',  color: '#0F172A', icon: 'add_location_alt'  },
    'BOUNDARY_UPDATED':   { label: 'Boundary Re-survey', color: '#059669', icon: 'edit_location_alt' },

    // Title Deed Chaincode (TitleDeedCC)
    'TITLE_ISSUED':       { label: 'Title Issued',        color: '#0284C7', icon: 'workspace_premium' },
    'TITLE_AMENDED':      { label: 'Title Amendment',     color: '#F59E0B', icon: 'contract_edit'     },
    'TITLE_REVOKED':      { label: 'Title Revoked',       color: '#DC2626', icon: 'cancel'            },

    // Transfer Chaincode (TransferCC)
    'TRANSFER_INITIATED': { label: 'Transfer Initiated',  color: '#7C3AED', icon: 'swap_horiz'        },
    'TRANSFER_APPROVED':  { label: 'Transfer Approved',   color: '#0284C7', icon: 'verified'          },
    'TRANSFER_COMPLETED': { label: 'Title Transfer',      color: '#059669', icon: 'check_circle'      },
    'TRANSFER_CANCELLED': { label: 'Transfer Cancelled',  color: '#475569', icon: 'cancel'            },

    // Document events (LandTitleExtensions SupportingDocAttached)
    'DOCUMENT_ATTACHED':  { label: 'Document Attached',   color: '#0369A1', icon: 'attach_file'       },

    // Legacy / migration events
    'LEGACY_DIGITISATION':{ label: 'Legacy Digitisation', color: '#475569', icon: 'history'           },

    // Audit / system (AuditCC LogEvent)
    'AUDIT_EVENT':        { label: 'Audit Event',         color: '#475569', icon: 'policy'            },
};

function eventMeta(type) {
    return EVENT_META[type] || { label: type || 'System Event', color: '#475569', icon: 'info' };
}

// ─── Document type display names ────────────────────────────────────────────
const DOC_LABELS = {
    SURVEY_PLAN:        'Survey Plan',
    ENV_ASSESSMENT:     'Environmental Assessment',
    DEED_OF_SALE:       'Deed of Sale',
    TITLE_DEED:         'Title Deed Certificate',
    COURT_ORDER:        'Court Order',
    ID_DOCUMENT:        'Identity Document',
    POWER_OF_ATTORNEY:  'Power of Attorney',
    OTHER:              'Supporting Document',
};

function docLabel(type) {
    return DOC_LABELS[type] || 'Supporting Document';
}

// ─── history ─────────────────────────────────────────────────────────────────
async function history(pin, { limit = 50 } = {}) {
    // NOTE: Encumbrances and disputes are NOT included — not handled in this release.
    const [parcel, transfers, auditEntries, deed] = await Promise.all([
        Parcel.findOne({ pin }).lean(),
        Transfer.find({ parcelPin: pin }).sort({ createdAt: -1 }).lean(),
        AuditLog.find({
            resourceType: 'titles',
            resourceId:   pin,
            // Only surface canonical chain events — exclude BULK_IMPORT, DRAFT saves, etc.
            action: { $in: Object.keys(EVENT_META) },
        }).sort({ timestamp: -1 }).limit(20).lean(),
        TitleDeed.findOne({ parcelPin: pin }).lean(),
    ]);

    // DRAFT parcels have not been submitted to the chain — nothing to show.
    if (parcel && parcel.status === 'DRAFT') {
        return { parcel, deed: null, events: [], total: 0 };
    }

    const events = [];

    // ── Parcel registration (LandParcelCC → CreateParcel) ────────────────────
    if (parcel) {
        const meta = eventMeta('PARCEL_REGISTERED');
        events.push({
            id:           `reg:${parcel._id}`,
            date:         parcel.createdAt,
            eventType:    'PARCEL_REGISTERED',
            event:        meta.label,
            eventColor:   meta.color,
            eventIcon:    meta.icon,
            principal:    parcel.registeredBy?.name || 'Registry Officer',
            principalSub: parcel.registeredBy?.orgId || 'LAA',
            txId:         parcel.blockchainTxId,
            hash:         parcel.blockchainTxId
                ? `${parcel.blockchainTxId.slice(0, 6)}…${parcel.blockchainTxId.slice(-6)}`
                : '—',
            status: 'verified',
        });
    }

    // ── Title deed issued / amended / revoked (TitleDeedCC) ──────────────────
    if (deed) {
        const issueMeta = eventMeta('TITLE_ISSUED');
        events.push({
            id:           `deed:${deed._id}:issued`,
            date:         deed.issuedAt || deed.createdAt,
            eventType:    'TITLE_ISSUED',
            event:        issueMeta.label,
            eventColor:   issueMeta.color,
            eventIcon:    issueMeta.icon,
            principal:    (deed.issuedBy && typeof deed.issuedBy === 'object' ? deed.issuedBy.name : deed.issuedBy) || 'Registry Officer',
            principalSub: `Deed No. ${deed.deedNumber || '—'}`,
            txId:         deed.blockchainTxId,
            hash:         deed.blockchainTxId
                ? `${deed.blockchainTxId.slice(0, 6)}…${deed.blockchainTxId.slice(-6)}`
                : '—',
            status: deed.status === 'REVOKED' ? 'revoked' : 'verified',
        });

        if (deed.amendments && deed.amendments.length) {
            deed.amendments.forEach((a, i) => {
                const aMeta = eventMeta('TITLE_AMENDED');
                events.push({
                    id:           `deed:${deed._id}:amend:${i}`,
                    date:         a.amendedAt,
                    eventType:    'TITLE_AMENDED',
                    event:        aMeta.label,
                    eventColor:   aMeta.color,
                    eventIcon:    aMeta.icon,
                    principal:    a.amendedBy || 'Registry Officer',
                    principalSub: a.reason    || null,
                    txId:         a.blockchainTxId,
                    hash:         a.blockchainTxId
                        ? `${a.blockchainTxId.slice(0, 6)}…${a.blockchainTxId.slice(-6)}`
                        : '—',
                    status: 'verified',
                });
            });
        }

        const rev = deed.revocation || {};
        if (deed.status === 'REVOKED' && (rev.revokedAt || deed.revokedAt)) {
            const rMeta = eventMeta('TITLE_REVOKED');
            events.push({
                id:           `deed:${deed._id}:revoked`,
                date:         rev.revokedAt || deed.revokedAt,
                eventType:    'TITLE_REVOKED',
                event:        rMeta.label,
                eventColor:   rMeta.color,
                eventIcon:    rMeta.icon,
                principal:    rev.revokedBy    || deed.revokedBy    || 'Registry Officer',
                principalSub: rev.reason       || deed.revocationReason || null,
                hash:         '—',
                status: 'revoked',
            });
        }
    }

    // ── Transfers (TransferCC) ────────────────────────────────────────────────
    transfers.forEach((t) => {
        // Initiation event
        if (t.createdAt) {
            const iMeta = eventMeta('TRANSFER_INITIATED');
            events.push({
                id:           `transfer:${t.transferId}:initiated`,
                date:         t.createdAt,
                eventType:    'TRANSFER_INITIATED',
                event:        iMeta.label,
                eventColor:   iMeta.color,
                eventIcon:    iMeta.icon,
                principal:    t.fromOwner?.fullName || 'Current Owner',
                principalSub: `to ${t.toOwner?.fullName || 'New Owner'}`,
                txId:         t.initTxId || t.blockchainTxId,
                hash:         (t.initTxId || t.blockchainTxId)
                    ? `${(t.initTxId || t.blockchainTxId).slice(0, 6)}…${(t.initTxId || t.blockchainTxId).slice(-6)}`
                    : '—',
                status: 'pending',
            });
        }

        // Completion or cancellation event
        const finalType = t.status === 'COMPLETE'  ? 'TRANSFER_COMPLETED'
                        : t.status === 'CANCELLED' ? 'TRANSFER_CANCELLED'
                        : null;
        if (finalType && (t.updatedAt || t.completedAt)) {
            const fMeta = eventMeta(finalType);
            events.push({
                id:           `transfer:${t.transferId}:final`,
                date:         t.completedAt || t.updatedAt,
                eventType:    finalType,
                event:        fMeta.label,
                eventColor:   fMeta.color,
                eventIcon:    fMeta.icon,
                principal:    finalType === 'TRANSFER_COMPLETED'
                    ? (t.toOwner?.fullName   || 'New Owner')
                    : (t.cancelledBy         || 'Party'),
                principalSub: finalType === 'TRANSFER_COMPLETED'
                    ? (t.fromOwner?.fullName ? `from ${t.fromOwner.fullName}` : null)
                    : null,
                txId:         t.blockchainTxId,
                hash:         t.blockchainTxId
                    ? `${t.blockchainTxId.slice(0, 6)}…${t.blockchainTxId.slice(-6)}`
                    : '—',
                status:           finalType === 'TRANSFER_COMPLETED' ? 'verified' : 'cancelled',
                considerationLSL: t.considerationLSL,
                stampDutyLSL:     t.stampDutyLSL,
            });
        }
    });

    // ── Supporting documents attached (LandTitleExtensions) ──────────────────
    if (parcel && parcel.supportingDocs && parcel.supportingDocs.length) {
        parcel.supportingDocs.forEach((d, i) => {
            if (d.uploadedAt) {
                const dMeta = eventMeta('DOCUMENT_ATTACHED');
                events.push({
                    id:           `doc:${parcel._id}:${i}`,
                    date:         d.uploadedAt,
                    eventType:    'DOCUMENT_ATTACHED',
                    event:        dMeta.label,
                    eventColor:   dMeta.color,
                    eventIcon:    dMeta.icon,
                    principal:    d.uploadedBy || 'Registry Officer',
                    principalSub: docLabel(d.type) + (d.name ? ` — ${d.name}` : ''),
                    txId:         d.ipfsCid ? `ipfs:${d.ipfsCid.slice(0, 12)}…` : null,
                    hash:         d.ipfsCid ? `ipfs:${d.ipfsCid.slice(0, 8)}…` : '—',
                    status: 'verified',
                    ipfsCid: d.ipfsCid,
                });
            }
        });
    }

    // ── Audit-log entries (AuditCC LogEvent) ─────────────────────────────────
    auditEntries.forEach((a) => {
        // Re-map stored action strings to canonical types where possible.
        const canonicalType =
            EVENT_META[a.action] ? a.action : 'AUDIT_EVENT';
        const aMeta = eventMeta(canonicalType);
        events.push({
            id:           `audit:${a._id}`,
            date:         a.timestamp,
            eventType:    canonicalType,
            event:        aMeta.label,
            eventColor:   aMeta.color,
            eventIcon:    aMeta.icon,
            principal:    a.actorAddress || a.actorRole || 'System',
            txId:         a.blockchainTxId,
            hash:         a.blockchainTxId
                ? `${a.blockchainTxId.slice(0, 6)}…${a.blockchainTxId.slice(-6)}`
                : '—',
            status: 'verified',
        });
    });

    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    return {
        parcel,
        deed,
        events: events.slice(0, limit),
        total:  events.length,
    };
}

// ─── documents ───────────────────────────────────────────────────────────────
async function documents(pin) {
    const parcel = await Parcel.findOne({ pin }).lean();
    if (!parcel) return [];
    return (parcel.supportingDocs || []).map((d, i) => ({
        id:         `${pin}-${i}`,
        name:       d.name      || docLabel(d.type),
        type:       d.type      || 'OTHER',
        typeLabel:  docLabel(d.type),
        ipfsCid:    d.ipfsCid   || null,
        sha256:     d.sha256    || null,
        sizeKB:     d.sizeKB    || null,
        uploadedBy: d.uploadedBy|| null,
        uploadedAt: d.uploadedAt,
    }));
}

// ─── uploadDocument ──────────────────────────────────────────────────────────
/**
 * Append a supporting document to an existing parcel's supportingDocs array.
 * Called by POST /api/parcels/:pin/documents.
 *
 * @param {string} pin  - Parcel Identification Number
 * @param {object} data - { type, name, ipfsCid, sha256, sizeKB, uploadedBy }
 */
async function uploadDocument(pin, data) {
    const parcel = await Parcel.findOne({ pin });
    if (!parcel) {
        const err = new Error(`Parcel ${pin} not found`);
        err.status = 404;
        throw err;
    }
    const doc = {
        type:       data.type       || 'OTHER',
        name:       data.name       || null,
        ipfsCid:    data.ipfsCid    || null,
        sha256:     data.sha256     || null,
        sizeKB:     data.sizeKB     ? Number(data.sizeKB) : null,
        uploadedBy: data.uploadedBy || null,
        uploadedAt: new Date(),
    };
    parcel.supportingDocs.push(doc);
    await parcel.save();
    const idx = parcel.supportingDocs.length - 1;
    return {
        ok: true,
        doc: {
            id:        `${pin}-${idx}`,
            name:      doc.name || docLabel(doc.type),
            type:      doc.type,
            typeLabel: docLabel(doc.type),
            ipfsCid:   doc.ipfsCid,
            sizeKB:    doc.sizeKB,
            uploadedAt: doc.uploadedAt,
        },
    };
}

// ─── gisHistory ──────────────────────────────────────────────────────────────
async function gisHistory(pin) {
    const { events } = await history(pin, { limit: 200 });
    const INCLUDE = new Set([
        'PARCEL_REGISTERED', 'TITLE_ISSUED', 'TRANSFER_COMPLETED', 'BOUNDARY_UPDATED',
    ]);
    return events
        .filter((e) => INCLUDE.has(e.eventType))
        .map((e) => ({
            id:    e.id,
            date:  e.date,
            label: e.event,
            body:  e.eventType === 'PARCEL_REGISTERED' ? 'Parcel digitised and registered on the LMBS ledger.'
                 : e.eventType === 'TITLE_ISSUED'       ? `Title deed issued to ${e.principal}.`
                 : e.eventType === 'TRANSFER_COMPLETED' ? `Ownership transferred to ${e.principal}.`
                 : e.eventType === 'BOUNDARY_UPDATED'   ? 'Parcel boundary re-surveyed and updated.'
                 : e.event,
            tone: e.eventColor,
        }));
}

module.exports = { history, documents, uploadDocument, gisHistory };
