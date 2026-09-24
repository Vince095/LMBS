/**
 * Title controller — keeps the existing /api/titles/store and /api/titles/:pn
 * shape, while allowing the new richer Parcel + TitleDeed model to be used.
 *
 * ┌─────────────────────── SECURITY RULES ────────────────────────────────────┐
 * │ SEC-TITLE-01: A CITIZEN or SURVEYOR cannot register a new title on a      │
 * │   parcel that already has an ACTIVE TitleDeed belonging to a different     │
 * │   wallet address. Only REGISTRY_OFFICER and ADMIN may do so.              │
 * │ SEC-TITLE-02: A validator node (any user who is REGISTRY_OFFICER) may     │
 * │   NOT register a parcel whose active deed names them as the owner.        │
 * │   (Prevents a registry officer from issuing land to themselves.)          │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * ON-CHAIN AUTHORITY
 * ──────────────────
 * The LandRegistry contract is the only authority for registrations and
 * ownership. This controller never invents transaction hashes. A registration
 * is recorded here only after the client's wallet has submitted it on-chain;
 * the backend verifies that transaction (event, submitter, parcel key) and
 * stores the off-chain metadata (GIS, land use, documents) as PENDING. The
 * chain indexer activates the parcel and deed when RequestExecuted is emitted.
 */

const { Parcel, TitleDeed, AuditLog, User, StoredDocument } = require('../models');
// AuditLog imported above for TITLE_ISSUED, TITLE_REVOKED, TITLE_AMENDED events
const { HttpError } = require('../middleware/error');
const chain = require('../services/chainService');
const { makeDeedNumber } = require('../utils/ids');
const { nextSequence } = require('../utils/counters');

// ── helpers ──────────────────────────────────────────────────────────────────

// ── store ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/titles  — record the off-chain metadata of a registration request
 * that the caller has ALREADY submitted on-chain with their wallet.
 * Body: { parcelNumber, chainTxHash, district, areaM2|area, landUse, location, geoJson, owner:{fullName}, additionalDetails }
 */
async function store(req, res, next) {
    try {
        const {
            parcelNumber, chainTxHash, location, area, additionalDetails,
            district, areaM2, landUse, geoJson, owner,
        } = req.body;
        if (!parcelNumber) throw new HttpError(400, 'parcelNumber required');
        if (!chainTxHash) throw new HttpError(400, 'chainTxHash required: submit the registration on-chain first (LandRegistry.submitRegistration)');
        chain.requireConfigured();

        const callerRole    = req.user.role;
        const callerAddress = req.user.address;
        const pin           = chain.normalizeParcelNumber(parcelNumber);

        // ── Verify the on-chain submission ──────────────────────────────────
        const sub = await chain.verifySubmission(chainTxHash, {
            expectedSubmitter: callerAddress,
            expectedKind: 'REGISTRATION',
            expectedParcelKey: chain.parcelKeyOf(pin),
        });

        // ── TC-LR-003: Lesotho national boundary validation ──────────────────
        // Approximate bounding box: lat -30.68...-28.57, lng 27.00...29.46
        if (geoJson && geoJson.coordinates) {
            const LSO_LAT_MIN = -30.68, LSO_LAT_MAX = -28.57;
            const LSO_LNG_MIN =  27.00, LSO_LNG_MAX =  29.46;
            const rings = geoJson.type === 'Polygon' ? geoJson.coordinates : (geoJson.coordinates || []).flat(1);
            const outside = rings.flat(1).find(([lng, lat]) =>
                lat < LSO_LAT_MIN || lat > LSO_LAT_MAX || lng < LSO_LNG_MIN || lng > LSO_LNG_MAX);
            if (outside) {
                throw new HttpError(422,
                    `Coordinates [${outside[1]}, ${outside[0]}] fall outside Lesotho national boundary (FR-LR-002).`);
            }
        }

        // The indexer may already have seen approvals / execution (e.g. if this
        // call is retried later). Never move a record backwards: derive the
        // status from the chain itself.
        const live = await chain.readRequest(sub.requestId);
        const executed = live.status === 'EXECUTED';
        const closed = live.status === 'REJECTED' || live.status === 'CANCELLED';

        // ── Parcel metadata (PENDING until the chain executes the request) ──
        const parcelDoc = {
            pin,
            tokenId:        sub.tokenId,
            parcelKey:      sub.parcelKey,
            chainRequestId: sub.requestId,
            district:       district || 'Maseru',
            legacyAddress:  location,
            areaM2:         areaM2 || area || 0,
            landUse:        landUse || 'RESIDENTIAL',
            status:         executed ? 'ACTIVE' : closed ? 'REJECTED' : 'PENDING_APPROVAL',
            registeredBy: { officerId: req.user.id, name: req.user.email || callerAddress, orgId: 'LAA' },
        };
        if (geoJson) parcelDoc.location = geoJson;
        if (!executed) parcelDoc.blockchainTxId = sub.txHash; // execution tx is written by the indexer
        const parcel = await Parcel.findOneAndUpdate(
            { pin }, { $set: parcelDoc }, { upsert: true, new: true, setDefaultsOnInsert: true });

        const beneficiary = await User.findOne({ address: sub.to }).lean();
        // Status, owners and anchoring are only ever advanced by the indexer;
        // this call sets them on first insert only.
        const deed = await TitleDeed.findOneAndUpdate(
            { chainRequestId: sub.requestId },
            {
                $setOnInsert: {
                    deedNumber: makeDeedNumber(await nextSequence('deeds')),
                    chainRequestId: sub.requestId,
                    owners: [{
                        fullName: (owner && owner.fullName) || (beneficiary && beneficiary.name) || `Wallet ${sub.to}`,
                        address: sub.to,
                        percentage: 100,
                    }],
                    status: 'PENDING',
                    anchored: false,
                    blockchainTxId: sub.txHash,
                },
                $set: {
                    parcelPin: pin,
                    tokenId: sub.tokenId,
                    issuedBy: callerAddress,
                    signingOfficerId: req.user.id,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        const deedNumber = deed.deedNumber;
        await Parcel.updateOne({ pin }, { $set: { titleDeedRef: deedNumber } });

        // Link documents uploaded to the encrypted store for this parcel.
        const stored = await StoredDocument.find({ parcelPin: pin }).lean();
        const known = new Set((parcel.supportingDocs || []).map((d) => d.docId).filter(Boolean));
        const fresh = stored.filter((d) => !known.has(d.docId)).map((d) => ({
            type: d.type, name: d.name, sha256: d.sha256, documentHash: d.documentHash, docId: d.docId,
            sizeKB: Math.ceil((d.sizeBytes || 0) / 1024), uploadedBy: (d.uploadedBy && d.uploadedBy.address) || callerAddress,
        }));
        if (fresh.length) await Parcel.updateOne({ pin }, { $push: { supportingDocs: { $each: fresh } } });

        AuditLog.create({
            actorId: req.user.id, actorAddress: callerAddress, actorRole: callerRole,
            action: 'PARCEL_REGISTERED', resourceType: 'titles', resourceId: pin,
            blockchainTxId: sub.txHash, ipAddress: req.ip,
            responseSummary: { requestId: sub.requestId, beneficiary: sub.to, chainStatus: live.status },
        }).catch(() => {});

        res.status(201).json({ success: true, parcel, deed, chainRequest: sub, additionalDetails });
    } catch (err) { next(err); }
}

// ── get ───────────────────────────────────────────────────────────────────────

async function get(req, res, next) {
    try {
        const parcel = await Parcel.findOne({ pin: req.params.parcelNumber });
        if (!parcel) throw new HttpError(404, 'Title not found');
        const deed = await TitleDeed.findOne({ parcelPin: req.params.parcelNumber });
        res.json({ ...parcel.toObject(), deed: deed || null });
    } catch (err) { next(err); }
}

// ── revoke ────────────────────────────────────────────────────────────────────
/**
 * POST /api/titles/:deedNumber/revoke  — TC-TD-003 / FR-TD-003.
 *
 * Revokes an ACTIVE title deed (e.g. court order, fraud finding).
 * Body: { reason, courtOrderRef?, revokedBy? }
 * Guards: REGISTRY_OFFICER or ADMIN only.
 */
async function revoke(req, res, next) {
    try {
        const deed = await TitleDeed.findOne({ deedNumber: req.params.deedNumber });
        if (!deed) throw new HttpError(404, `Title deed ${req.params.deedNumber} not found`);
        if (deed.status === 'REVOKED') throw new HttpError(409, 'Deed is already REVOKED');

        const callerAddress = (req.user?.address || '').toLowerCase();
        const callerRole    = req.user?.role || 'CITIZEN';
        if (!['REGISTRY_OFFICER', 'ADMIN'].includes(callerRole)) {
            throw new HttpError(403, 'Only a Registry Officer or Admin may revoke a title deed');
        }

        const { reason, courtOrderRef } = req.body;
        if (!reason) throw new HttpError(400, 'reason is required for revocation');

        // Revocation is an OFF-CHAIN registry annotation in this prototype. It is
        // not anchored on-chain (no fabricated hash). To stop any dealing with
        // the title on-chain, a dispute officer must also open a dispute on
        // the parcel in DisputeRegistry (see docs/LIMITATIONS.md).
        deed.status     = 'REVOKED';
        deed.issuedBy   = deed.issuedBy || callerAddress;
        deed.revocation = {
            revokedAt:     new Date(),
            revokedBy:     callerAddress,
            reason,
            courtOrderRef: courtOrderRef || null,
        };
        deed.anchored = false;
        await deed.save();

        // Set parcel status to REVOKED
        await Parcel.updateOne(
            { pin: deed.parcelPin },
            { $set: { status: 'REVOKED' } }
        );

        // AuditLog
        AuditLog.create({
            actorId:       req.user?.id || null,
            actorAddress:  callerAddress,
            actorRole:     callerRole,
            action:        'TITLE_REVOKED',
            resourceType:  'titles',
            resourceId:    deed.parcelPin,
            ipAddress:     req.ip,
            responseSummary: { deedNumber: deed.deedNumber, reason, courtOrderRef },
        }).catch(() => {});

        res.json({ success: true, deed, anchored: false });
    } catch (err) { next(err); }
}

// ── amend ─────────────────────────────────────────────────────────────────────
/**
 * PATCH /api/titles/:deedNumber  — TC-TD-005 / FR-TD-005.
 *
 * Amends an ACTIVE deed (e.g. landUse correction, ownership update).
 * Saves a snapshot of the pre-amendment state into history[].
 * Body: { landUse?, owners?, reason }
 * Guards: REGISTRY_OFFICER or ADMIN only.
 */
async function amend(req, res, next) {
    try {
        const deed = await TitleDeed.findOne({ deedNumber: req.params.deedNumber });
        if (!deed) throw new HttpError(404, `Title deed ${req.params.deedNumber} not found`);
        if (deed.status !== 'ACTIVE') throw new HttpError(409, `Cannot amend a deed with status ${deed.status}`);

        const callerAddress = (req.user?.address || '').toLowerCase();
        const callerRole    = req.user?.role || 'CITIZEN';
        if (!['REGISTRY_OFFICER', 'ADMIN'].includes(callerRole)) {
            throw new HttpError(403, 'Only a Registry Officer or Admin may amend a title deed');
        }

        const { owners, reason } = req.body;
        if (!reason) throw new HttpError(400, 'reason is required for amendment');
        // Ownership changes ONLY through the governed on-chain transfer workflow.
        if (owners !== undefined) {
            throw new HttpError(409, 'Ownership cannot be amended off-chain. Use the governed transfer (LandRegistry.submitTransfer).');
        }

        // Save current version to history
        const snapshot = deed.toObject();
        deed.history.push({
            version:   deed.version,
            changedAt: new Date(),
            changedBy: callerAddress,
            snapshot:  {
                owners:   snapshot.owners,
                status:   snapshot.status,
                issuedAt: snapshot.issuedAt,
                issuedBy: snapshot.issuedBy,
            },
        });

        // Apply amendments (non-ownership fields only)
        if (req.body.landUse) await Parcel.updateOne({ pin: deed.parcelPin }, { $set: { landUse: req.body.landUse } });
        deed.version += 1;
        deed.issuedBy = deed.issuedBy || callerAddress;

        deed.markModified('history');
        await deed.save();

        // AuditLog
        AuditLog.create({
            actorId:       req.user?.id || null,
            actorAddress:  callerAddress,
            actorRole:     callerRole,
            action:        'TITLE_AMENDED',
            resourceType:  'titles',
            resourceId:    deed.parcelPin,
            ipAddress:     req.ip,
            responseSummary: { deedNumber: deed.deedNumber, version: deed.version, reason },
        }).catch(() => {});

        res.json({ success: true, deed, anchored: false });
    } catch (err) { next(err); }
}

// ── saveDraft ─────────────────────────────────────────────────────────────────
/**
 * POST /api/titles/draft  — TC-LR-009 / FR-LR-008.
 *
 * Save a partial parcel registration as a DRAFT.
 * Drafts auto-expire (MongoDB TTL index) 30 days from creation.
 * Body: same shape as POST /api/titles but no fields are mandatory.
 */
async function saveDraft(req, res, next) {
    try {
        const {
            parcelNumber, location, area, owner, district, areaM2, landUse, geoJson, tokenId,
        } = req.body;

        const callerAddress = (req.user?.address || '').toLowerCase();
        const callerName    = req.user?.name || callerAddress || 'Unknown';
        const expiresAt     = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        const pin = parcelNumber || `DRAFT-${callerAddress.slice(2, 8)}-${Date.now()}`;

        const draftDoc = {
            pin,
            status:         'DRAFT',
            draftExpiresAt: expiresAt,
            district:       district || 'Maseru',
            legacyAddress:  location,
            areaM2:         areaM2 || area || 0,
            landUse:        landUse || 'RESIDENTIAL',
            registeredBy: {
                officerId: req.user?.id || null,
                name:      callerName,
                orgId:     'LAA',
            },
        };
        if (geoJson)  draftDoc.location = geoJson;
        if (tokenId)  draftDoc.tokenId  = tokenId;

        // Upsert: allows resuming an existing draft for the same PIN
        const draft = await Parcel.findOneAndUpdate(
            { pin, status: 'DRAFT' },
            { $set: draftDoc },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        // If owner info provided, store temporarily in a light-weight sub-doc
        // (not a full TitleDeed — that is only created on final submission).
        if (owner) {
            await draft.updateOne({ $set: { 'draftOwner': owner } });
        }

        res.status(201).json({
            success: true,
            draft,
            expiresAt,
            message: 'Draft saved. Submit within 30 days to register on the blockchain ledger.',
        });
    } catch (err) { next(err); }
}

// ── listDrafts ────────────────────────────────────────────────────────────────
/**
 * GET /api/titles/drafts  — returns DRAFT parcels created by the calling officer.
 */
async function listDrafts(req, res, next) {
    try {
        const callerName    = req.user?.name || '';
        const callerAddress = (req.user?.address || '').toLowerCase();

        // Find drafts registered by this officer (by address or by officer id)
        const drafts = await Parcel.find({
            status: 'DRAFT',
            $or: [
                { 'registeredBy.officerId': req.user?.id },
                { 'registeredBy.name': callerName },
            ],
        }).sort({ updatedAt: -1 }).limit(100).lean();

        // Decorate with days remaining
        const now = Date.now();
        const decorated = drafts.map((d) => ({
            ...d,
            daysRemaining: d.draftExpiresAt
                ? Math.max(0, Math.ceil((new Date(d.draftExpiresAt) - now) / 86400000))
                : null,
        }));

        res.json({ drafts: decorated, total: decorated.length });
    } catch (err) { next(err); }
}

// ── importCsv ─────────────────────────────────────────────────────────────────
/**
 * POST /api/titles/import  — TC-LR-008 / FR-LR-007.
 *
 * Bulk CSV import of historic parcel records.
 * Content-Type: text/csv  (or text/plain).
 *
 * Expected CSV header row (order-insensitive, case-insensitive):
 *   parcelNumber, location, district, areaM2, landUse, ownerName, ownerAddress, tokenId
 *
 * All columns except parcelNumber are optional.
 * Creates each row as a DRAFT parcel (status='DRAFT') for officer review.
 * Returns: { imported, skipped, errors[] }
 *
 * Guards: REGISTRY_OFFICER or ADMIN only.
 */
async function importCsv(req, res, next) {
    try {
        const callerAddress = (req.user?.address || '').toLowerCase();
        const callerName    = req.user?.name || callerAddress || 'Registry Officer';
        const callerRole    = req.user?.role || 'CITIZEN';

        if (!['REGISTRY_OFFICER', 'ADMIN'].includes(callerRole)) {
            throw new HttpError(403, 'Only a Registry Officer or Admin may bulk-import parcels');
        }

        const body = req.body;
        if (!body || typeof body !== 'string' || !body.trim()) {
            throw new HttpError(400, 'Request body must be a CSV string (Content-Type: text/csv)');
        }

        // ── Parse CSV ────────────────────────────────────────────────────────
        const lines = body.trim().split(/\r?\n/).filter(Boolean);
        if (lines.length < 2) throw new HttpError(400, 'CSV must have a header row and at least one data row');

        // Parse header (normalise: lowercase, trim, strip BOM)
        const rawHeader = lines[0].replace(/^﻿/, '');
        const headers   = rawHeader.split(',').map((h) => h.trim().toLowerCase());

        const col = (row, name) => {
            const idx = headers.indexOf(name);
            return idx !== -1 ? (row[idx] || '').trim() : '';
        };

        const results  = { imported: 0, skipped: 0, errors: [] };
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        for (let i = 1; i < lines.length; i++) {
            const raw = lines[i].split(',');
            try {
                const parcelNumber = col(raw, 'parcelnumber') || col(raw, 'pin');
                if (!parcelNumber) {
                    results.skipped++;
                    results.errors.push({ row: i + 1, error: 'parcelNumber is required' });
                    continue;
                }

                const ownerName    = col(raw, 'ownername');
                const ownerAddress = (col(raw, 'owneraddress') || '').toLowerCase();
                const districtRaw  = col(raw, 'district') || 'Maseru';
                const areaRaw      = Number(col(raw, 'arem2') || col(raw, 'area')) || 0;
                const landUseRaw   = (col(raw, 'landuse') || 'RESIDENTIAL').toUpperCase();
                const tokenIdRaw   = col(raw, 'tokenid');

                const validLandUse = ['RESIDENTIAL','COMMERCIAL','AGRICULTURAL','INDUSTRIAL','OTHER'];
                const landUse = validLandUse.includes(landUseRaw) ? landUseRaw : 'OTHER';

                // Upsert as DRAFT — officer must approve each record before it goes ACTIVE
                await Parcel.findOneAndUpdate(
                    { pin: parcelNumber },
                    {
                        $setOnInsert: {
                            pin:            parcelNumber,
                            status:         'DRAFT',
                            draftExpiresAt: expiresAt,
                            district:       districtRaw,
                            legacyAddress:  col(raw, 'location'),
                            areaM2:         areaRaw,
                            landUse,
                            tokenId:        tokenIdRaw ? Number(tokenIdRaw) : undefined,
                            registeredBy: {
                                officerId: req.user?.id || null,
                                name:      callerName,
                                orgId:     'LAA',
                            },
                        },
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                // No TitleDeed is created here: a deed exists only once the
                // registration has been submitted on-chain (POST /api/titles)
                // and becomes ACTIVE only when the chain executes it.
                void ownerName; void ownerAddress;

                results.imported++;
            } catch (rowErr) {
                results.skipped++;
                results.errors.push({ row: i + 1, error: rowErr.message });
            }
        }

        // AuditLog the batch import
        AuditLog.create({
            actorId:      req.user?.id || null,
            actorAddress: callerAddress,
            actorRole:    callerRole,
            action:       'BULK_IMPORT',
            resourceType: 'titles',
            resourceId:   'csv-import',
            ipAddress:    req.ip,
            responseSummary: results,
        }).catch(() => {});

        res.status(201).json({
            success: true,
            message: `Import complete: ${results.imported} parcels created as DRAFT, ${results.skipped} skipped.`,
            ...results,
        });
    } catch (err) { next(err); }
}

module.exports = { store, get, revoke, amend, saveDraft, listDrafts, importCsv };
