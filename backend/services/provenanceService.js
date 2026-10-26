/**
 * Provenance service — feeds Property Details, Transaction History and the
 * GIS Parcel History screens.
 *
 * A parcel's history is assembled ONLY from read models that the chain
 * indexer (services/indexerService.js) projects from Besu events, plus the
 * encrypted document store's metadata:
 *
 *   chain_requests  ← LandRegistry: RequestSubmitted, DecisionRecorded,
 *                     RequestApproved, ExecutionDeferred, RequestExecuted,
 *                     RequestRejected, RequestCancelled
 *   disputes        ← DisputeRegistry (openDispute / closeDispute)
 *   encumbrances    ← EncumbranceRegistry (register / discharge)
 *   documents       ← encrypted document store (keccak256 hash anchored
 *                     on-chain through submitRegistration / submitTransfer)
 *
 * Event timestamps are the mined block's time, stored by the indexer. For rows
 * indexed before it stored them, the block is looked up (bounded by a short
 * timeout); failing that the read model's own timestamps are used.
 * Nothing here invents a transaction hash: `txId` is a real Besu transaction
 * hash or null.
 */

const models = require('../models');
const chain = require('./chainService');

// ─── Event type registry ────────────────────────────────────────────────────
const EVENT_META = {
    REGISTRATION_SUBMITTED: { label: 'Registration Submitted', color: '#0F172A', icon: 'add_location_alt' },
    TRANSFER_INITIATED:     { label: 'Transfer Initiated',     color: '#7C3AED', icon: 'swap_horiz' },
    APPROVAL_RECORDED:      { label: 'Approval Recorded',      color: '#0284C7', icon: 'how_to_vote' },
    REJECTION_RECORDED:     { label: 'Rejection Recorded',     color: '#DC2626', icon: 'thumb_down' },
    TRANSFER_APPROVED:      { label: 'Request Approved',       color: '#0284C7', icon: 'verified' },
    EXECUTION_DEFERRED:     { label: 'Execution Blocked',      color: '#B45309', icon: 'block' },
    TITLE_ISSUED:           { label: 'Title Issued',           color: '#0284C7', icon: 'workspace_premium' },
    TRANSFER_COMPLETED:     { label: 'Title Transfer',         color: '#059669', icon: 'check_circle' },
    REQUEST_REJECTED:       { label: 'Request Rejected',       color: '#DC2626', icon: 'cancel' },
    TRANSFER_CANCELLED:     { label: 'Request Cancelled',      color: '#475569', icon: 'cancel' },
    DISPUTE_OPENED:         { label: 'Dispute Opened',         color: '#B91C1C', icon: 'gavel' },
    DISPUTE_CLOSED:         { label: 'Dispute Closed',         color: '#475569', icon: 'gavel' },
    ENCUMBRANCE_REGISTERED: { label: 'Encumbrance Registered', color: '#B45309', icon: 'account_balance' },
    ENCUMBRANCE_DISCHARGED: { label: 'Encumbrance Discharged', color: '#059669', icon: 'account_balance' },
    DOCUMENT_ATTACHED:      { label: 'Document Attached',      color: '#0369A1', icon: 'attach_file' },
};

const BLOCKER_LABEL = {
    OPEN_DISPUTE: 'open dispute on the parcel',
    BLOCKING_ENCUMBRANCE: 'blocking encumbrance on the parcel',
    PARTY_NOT_VERIFIED: 'a party is not identity-verified',
    OWNER_CHANGED: 'the title owner changed after submission',
};

function eventMeta(type) {
    return EVENT_META[type] || { label: type || 'Event', color: '#475569', icon: 'info' };
}

// ─── Document type display names ────────────────────────────────────────────
const DOC_LABELS = {
    SURVEY_PLAN: 'Survey Plan',
    ENV_ASSESSMENT: 'Environmental Assessment',
    DEED_OF_SALE: 'Deed of Sale',
    TITLE_DEED: 'Title Deed Certificate',
    COURT_ORDER: 'Court Order',
    ID_DOCUMENT: 'Identity Document',
    POWER_OF_ATTORNEY: 'Power of Attorney',
    OTHER: 'Supporting Document',
};

function docLabel(type) {
    return DOC_LABELS[type] || 'Supporting Document';
}

function shortHash(h) {
    return h ? `${h.slice(0, 6)}…${h.slice(-6)}` : '—';
}

function shortAddr(a) {
    return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : null;
}

function makeEvent(type, fields) {
    const meta = eventMeta(type);
    return {
        eventType: type,
        event: meta.label,
        eventColor: meta.color,
        eventIcon: meta.icon,
        hash: shortHash(fields.txId),
        ...fields,
    };
}

// ─── Block timestamps for rows indexed without one ──────────────────────────
const BLOCK_TIME_TIMEOUT_MS = 3000;

async function blockTimes(blockNumbers, deps) {
    const out = new Map();
    const c = deps.chain;
    if (!c || !c.isConfigured || !c.isConfigured()) return out;
    const unique = [...new Set(blockNumbers.filter((n) => Number.isInteger(n)))].slice(0, 100);
    if (!unique.length) return out;
    let timer;
    try {
        const provider = c.getProvider();
        const lookups = Promise.all(unique.map((n) => provider.getBlock(n).catch(() => null)));
        const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), BLOCK_TIME_TIMEOUT_MS); });
        const blocks = await Promise.race([lookups, timeout]);
        (blocks || []).forEach((b, i) => { if (b && b.timestamp) out.set(unique[i], new Date(Number(b.timestamp) * 1000)); });
    } catch {
        /* chain unreachable: fall back to read-model timestamps */
    } finally {
        clearTimeout(timer);
    }
    return out;
}

// ─── On-chain anchoring of stored documents ─────────────────────────────────
/**
 * Map documentHash → requestId for every hash committed on-chain, either
 * directly as a request's documentHash or as a member of an anchored manifest.
 * `manifests` are stored documents carrying `members`.
 */
function anchorIndex(requests, manifests) {
    const byHash = new Map();
    requests.forEach((r) => { if (r.documentHash) byHash.set(String(r.documentHash).toLowerCase(), r.requestId); });
    manifests.forEach((mf) => {
        const rid = byHash.get(String(mf.documentHash || '').toLowerCase());
        if (rid === undefined) return;
        (mf.members || []).forEach((h) => { if (!byHash.has(h)) byHash.set(String(h).toLowerCase(), rid); });
    });
    return byHash;
}

// ─── Name resolution for wallet addresses ───────────────────────────────────
async function nameMap(addresses, m) {
    const list = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
    const map = new Map();
    if (!list.length || !m.User) return map;
    const users = await m.User.find({ address: { $in: list } }).select('address name').lean();
    users.forEach((u) => map.set(u.address, u.name));
    return map;
}

// ─── history ────────────────────────────────────────────────────────────────
async function history(pin, { limit = 50 } = {}, deps = { models, chain }) {
    const m = deps.models;
    const [parcel, deed] = await Promise.all([
        m.Parcel.findOne({ pin }).lean(),
        m.TitleDeed.findOne({ parcelPin: pin }).sort({ createdAt: -1 }).lean(),
    ]);

    // Draft parcels have not been submitted on-chain.
    if (!parcel || parcel.status === 'DRAFT') {
        return { parcel: parcel || null, deed: null, events: [], total: 0 };
    }

    const or = [{ parcelNumber: pin }];
    if (parcel.parcelKey) or.push({ parcelKey: parcel.parcelKey });
    const tokenId = parcel.tokenId || (deed && deed.tokenId);
    if (tokenId) or.push({ tokenId: String(tokenId) });
    if (parcel.chainRequestId !== undefined && parcel.chainRequestId !== null) or.push({ requestId: Number(parcel.chainRequestId) });

    const [requests, disputes, encumbrances, docs] = await Promise.all([
        m.ChainRequest.find({ $or: or }).sort({ requestId: 1 }).lean(),
        m.Dispute.find({ parcelPin: pin }).lean(),
        m.Encumbrance.find({ parcelPin: pin }).lean(),
        m.StoredDocument.find({ parcelPin: pin }).lean(),
    ]);

    // Only blocks whose time the indexer did not store need a chain lookup.
    const blocks = [];
    requests.forEach((r) => {
        if (!r.submittedAt) blocks.push(r.submittedBlock);
        if (!r.executedAt) blocks.push(r.executedBlock);
        (r.decisions || []).forEach((d) => { if (!d.at) blocks.push(d.blockNumber); });
    });
    const addresses = [
        ...requests.flatMap((r) => [r.submitter, r.from, r.to, ...(r.decisions || []).map((d) => d.approver)]),
        ...disputes.map((d) => d.filerAddress),
        ...encumbrances.map((e) => e.dischargedBy),
        ...docs.map((d) => d.uploadedBy && d.uploadedBy.address),
    ];
    const [times, names] = await Promise.all([blockTimes(blocks, deps), nameMap(addresses, m)]);
    const at = (block, stored, fallback) => stored || times.get(block) || fallback || null;
    const who = (addr) => (addr && names.get(addr.toLowerCase())) || shortAddr(addr) || 'Unknown';

    const events = [];

    requests.forEach((r) => {
        const isReg = r.kind === 'REGISTRATION';
        const rid = r.requestId;
        const sub = `Request #${rid}`;

        events.push(makeEvent(isReg ? 'REGISTRATION_SUBMITTED' : 'TRANSFER_INITIATED', {
            id: `req:${rid}:submitted`,
            date: at(r.submittedBlock, r.submittedAt, r.createdAt),
            principal: who(r.submitter),
            principalSub: isReg ? `${sub} · for ${who(r.to)}` : `${sub} · ${who(r.from)} → ${who(r.to)}`,
            txId: r.submittedTx || null,
            blockNumber: r.submittedBlock || null,
            documentHash: r.documentHash || null,
            requestId: rid,
            status: r.status === 'PENDING' ? 'pending' : 'verified',
        }));

        (r.decisions || []).forEach((d, i) => {
            const approve = d.decision === 'APPROVE';
            events.push(makeEvent(approve ? 'APPROVAL_RECORDED' : 'REJECTION_RECORDED', {
                id: `req:${rid}:decision:${i}`,
                date: at(d.blockNumber, d.at, r.updatedAt),
                principal: who(d.approver),
                principalSub: `${sub}${d.viaSignature ? ' · EIP-712 signed vote (relayed)' : ''}`,
                txId: d.txHash || null,
                blockNumber: d.blockNumber || null,
                requestId: rid,
                status: 'verified',
            }));
        });

        if (r.status === 'APPROVED' && r.blocker && r.blocker !== 'NONE') {
            events.push(makeEvent('EXECUTION_DEFERRED', {
                id: `req:${rid}:deferred`,
                date: r.updatedAt || null,
                principal: 'LandRegistry',
                principalSub: `${sub} · ${BLOCKER_LABEL[r.blocker] || r.blocker}`,
                txId: null,
                requestId: rid,
                blocker: r.blocker,
                status: 'pending',
            }));
        } else if (r.status === 'APPROVED') {
            events.push(makeEvent('TRANSFER_APPROVED', {
                id: `req:${rid}:approved`,
                date: r.updatedAt || null,
                principal: 'LandRegistry',
                principalSub: `${sub} · ${r.approvals}/${r.threshold} approvals, awaiting execute()`,
                txId: null,
                requestId: rid,
                status: 'pending',
            }));
        }

        if (r.status === 'EXECUTED') {
            events.push(makeEvent(isReg ? 'TITLE_ISSUED' : 'TRANSFER_COMPLETED', {
                id: `req:${rid}:executed`,
                date: at(r.executedBlock, r.executedAt, r.updatedAt),
                principal: who(r.to),
                principalSub: isReg
                    ? `${sub} · ERC-721 title #${r.tokenId}${deed && deed.deedNumber ? ` · Deed ${deed.deedNumber}` : ''}`
                    : `${sub} · from ${who(r.from)}`,
                txId: r.executedTx || null,
                blockNumber: r.executedBlock || null,
                requestId: rid,
                status: 'verified',
            }));
        } else if (r.status === 'REJECTED' || r.status === 'CANCELLED') {
            events.push(makeEvent(r.status === 'REJECTED' ? 'REQUEST_REJECTED' : 'TRANSFER_CANCELLED', {
                id: `req:${rid}:closed`,
                date: r.updatedAt || null,
                principal: r.status === 'REJECTED' ? 'Approving institutions' : who(r.submitter),
                principalSub: `${sub} · ${r.rejections || 0} rejection(s)`,
                txId: r.closedTx || null,
                requestId: rid,
                status: r.status === 'REJECTED' ? 'revoked' : 'cancelled',
            }));
        }
    });

    disputes.forEach((d) => {
        events.push(makeEvent('DISPUTE_OPENED', {
            id: `dispute:${d.disputeId}:opened`,
            date: d.createdAt,
            principal: d.filerAddress ? who(d.filerAddress) : 'Dispute officer',
            principalSub: `Dispute ${d.disputeId}`,
            txId: d.blockchainTxId || null,
            status: d.blockchainTxId ? 'verified' : 'pending',
        }));
        const closed = d.resolution && d.resolution.resolvedAt;
        if (closed) {
            events.push(makeEvent('DISPUTE_CLOSED', {
                id: `dispute:${d.disputeId}:closed`,
                date: d.resolution.resolvedAt,
                principal: d.resolution.resolvedBy || 'Dispute officer',
                principalSub: `Dispute ${d.disputeId}${d.resolution.decision ? ` · ${d.resolution.decision}` : ''}`,
                txId: null,
                status: 'verified',
            }));
        }
    });

    encumbrances.forEach((e) => {
        events.push(makeEvent('ENCUMBRANCE_REGISTERED', {
            id: `enc:${e.encumbranceId}:registered`,
            date: e.startDate || e.createdAt,
            principal: (e.holder && e.holder.name) || 'Encumbrance officer',
            principalSub: `${e.type} · ${e.encumbranceId}`,
            txId: e.blockchainTxId || null,
            status: e.blockchainTxId ? 'verified' : 'pending',
        }));
        if (e.dischargeDate) {
            events.push(makeEvent('ENCUMBRANCE_DISCHARGED', {
                id: `enc:${e.encumbranceId}:discharged`,
                date: e.dischargeDate,
                principal: e.dischargedBy ? who(e.dischargedBy) : 'Encumbrance officer',
                principalSub: `${e.type} · ${e.encumbranceId}`,
                txId: null,
                status: 'verified',
            }));
        }
    });

    const anchored = anchorIndex(requests, docs.filter((d) => d.members && d.members.length));
    docs.forEach((d) => {
        const onChain = anchored.has((d.documentHash || '').toLowerCase());
        events.push(makeEvent('DOCUMENT_ATTACHED', {
            id: `doc:${d.docId}`,
            date: d.createdAt,
            principal: (d.uploadedBy && (d.uploadedBy.address ? who(d.uploadedBy.address) : d.uploadedBy.role)) || 'Uploader',
            principalSub: docLabel(d.type) + (d.name ? ` — ${d.name}` : ''),
            txId: null,
            hash: shortHash(d.documentHash),
            documentHash: d.documentHash,
            status: onChain ? 'verified' : 'pending',
        }));
    });

    events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return { parcel, deed, events: events.slice(0, limit), total: events.length };
}

// ─── documents ──────────────────────────────────────────────────────────────
async function anchoredHashes(hashes, m) {
    const list = [...new Set(hashes.filter(Boolean).map((h) => String(h).toLowerCase()))];
    if (!list.length) return new Map();
    // Manifests that list any of these documents; their own hash is what a request anchors.
    const manifests = await m.StoredDocument.find({ members: { $in: list } }).select('documentHash members').lean();
    const candidates = [...new Set([...list, ...manifests.map((mf) => String(mf.documentHash).toLowerCase())])];
    const reqs = await m.ChainRequest.find({ documentHash: { $in: candidates } }).select('documentHash requestId').lean();
    return anchorIndex(reqs, manifests);
}

function toDocRow(d, anchored) {
    const requestId = anchored.get(String(d.documentHash || '').toLowerCase());
    return {
        id: d.docId,
        docId: d.docId,
        parcelPin: d.parcelPin || null,
        name: d.name || docLabel(d.type),
        type: d.type || 'OTHER',
        typeLabel: docLabel(d.type),
        mimeType: d.mimeType || null,
        sha256: d.sha256,
        documentHash: d.documentHash,
        encryption: (d.encryption && d.encryption.alg) || 'aes-256-gcm',
        sizeKB: d.sizeBytes ? Math.ceil(d.sizeBytes / 1024) : null,
        uploadedBy: (d.uploadedBy && (d.uploadedBy.address || d.uploadedBy.role)) || null,
        uploadedAt: d.createdAt,
        anchoredOnChain: requestId !== undefined,
        requestId: requestId !== undefined ? requestId : null,
    };
}

async function documents(pin, deps = { models }) {
    const m = deps.models;
    const docs = await m.StoredDocument.find({ parcelPin: pin }).sort({ createdAt: -1 }).lean();
    const anchored = await anchoredHashes(docs.map((d) => d.documentHash), m);
    return docs.map((d) => toDocRow(d, anchored));
}

/**
 * Cross-parcel document index. Filters: type, district. Page-based.
 */
async function listDocuments({ type, district, limit = 50, page = 1 } = {}, deps = { models }) {
    const m = deps.models;
    const filter = { parcelPin: { $ne: null } };
    if (type) filter.type = type;
    let districtByPin = new Map();
    if (district) {
        const parcels = await m.Parcel.find({ district }).select('pin district landUse').lean();
        filter.parcelPin = { $in: parcels.map((p) => p.pin) };
        districtByPin = new Map(parcels.map((p) => [p.pin, p]));
    }
    const [rows, total] = await Promise.all([
        m.StoredDocument.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        m.StoredDocument.countDocuments(filter),
    ]);
    if (!district) {
        const pins = [...new Set(rows.map((r) => r.parcelPin))];
        const parcels = await m.Parcel.find({ pin: { $in: pins } }).select('pin district landUse').lean();
        districtByPin = new Map(parcels.map((p) => [p.pin, p]));
    }
    const anchored = await anchoredHashes(rows.map((d) => d.documentHash), m);
    return {
        documents: rows.map((d) => {
            const p = districtByPin.get(d.parcelPin) || {};
            return { ...toDocRow(d, anchored), district: p.district || null, landUse: p.landUse || null };
        }),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
    };
}

// ─── gisHistory ─────────────────────────────────────────────────────────────
const GIS_TYPES = new Set([
    'REGISTRATION_SUBMITTED', 'TITLE_ISSUED', 'TRANSFER_COMPLETED',
    'DISPUTE_OPENED', 'DISPUTE_CLOSED', 'ENCUMBRANCE_REGISTERED', 'ENCUMBRANCE_DISCHARGED',
]);

async function gisHistory(pin, deps) {
    const { events } = await history(pin, { limit: 200 }, deps);
    return events
        .filter((e) => GIS_TYPES.has(e.eventType))
        .map((e) => ({
            id: e.id,
            date: e.date,
            label: e.event,
            body: e.eventType === 'REGISTRATION_SUBMITTED' ? 'Registration request submitted to the LandRegistry contract.'
                : e.eventType === 'TITLE_ISSUED' ? `Title issued to ${e.principal}.`
                : e.eventType === 'TRANSFER_COMPLETED' ? `Ownership transferred to ${e.principal}.`
                : `${e.event}: ${e.principalSub || ''}`.trim(),
            tone: e.eventColor,
        }));
}

module.exports = { history, documents, listDocuments, gisHistory, EVENT_META };
