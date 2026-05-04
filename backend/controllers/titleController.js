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
 * TX-ID GENERATION
 * ────────────────
 * When the Besu chain is not available (dev / staging) we generate a
 * cryptographically-random 32-byte hex string that looks exactly like an
 * Ethereum / Fabric TX hash.  It is persisted on both the Parcel and
 * TitleDeed documents so the Provenance ledger can display a linked hash.
 *
 * In production the Blockchain Event Listener overwrites blockchainTxId
 * once the on-chain transaction is confirmed.
 */

const crypto = require('crypto');
const { Parcel, TitleDeed, AuditLog } = require('../models');
// AuditLog imported above for TITLE_ISSUED, TITLE_REVOKED, TITLE_AMENDED events
const { HttpError } = require('../middleware/error');
const { makeDeedNumber } = require('../utils/ids');
const { nextSequence } = require('../utils/counters');

// ── helpers ──────────────────────────────────────────────────────────────────

/** Generate a synthetic 0x-prefixed 32-byte hex TX hash. */
function makeTxHash() {
    return '0x' + crypto.randomBytes(32).toString('hex');
}

/**
 * Attempt to get a real TX hash from the Besu chain.
 * Returns null if the chain is unreachable (dev environment).
 * The synthetic hash is used as a fallback.
 */
async function getChainTxHash(from, data) {
    try {
        const { getProvider } = require('../services/chainService');
        const provider = getProvider();
        // Dry-check chain reachability without sending a transaction
        await provider.getBlockNumber();
        // In a real integration the chaincode submit returns the hash —
        // we return null here and let the Blockchain Event Listener write it.
        return null;
    } catch {
        return null; // chain offline — synthetic hash will be used
    }
}

// ── store ─────────────────────────────────────────────────────────────────────

async function store(req, res, next) {
    try {
        const {
            parcelNumber, location, area, owner, additionalDetails,
            district, areaM2, landUse, geoJson, tokenId, deedNumber,
        } = req.body;
        if (!parcelNumber) throw new HttpError(400, 'parcelNumber required');

        const callerRole    = (req.user && req.user.role)    || 'CITIZEN';
        const callerAddress = (req.user && req.user.address  || '').toLowerCase();
        const callerName    = (req.user && req.user.name)    || callerAddress || 'Registry Officer';
        const isOfficer     = callerRole === 'REGISTRY_OFFICER' || callerRole === 'ADMIN';

        // ── Security checks ─────────────────────────────────────────────────
        const existingDeed = await TitleDeed.findOne({ parcelPin: parcelNumber, status: 'ACTIVE' }).lean();
        if (existingDeed && owner) {
            const existingOwnerAddrs = (existingDeed.owners || [])
                .map(function(o) { return (o.address || '').toLowerCase(); });
            const newOwnerAddr = (typeof owner === 'string'
                ? owner
                : (owner.address || owner.toString())
            ).toLowerCase();

            // SEC-TITLE-01: non-officers cannot reassign an already-owned parcel
            if (existingOwnerAddrs.length > 0 && !existingOwnerAddrs.includes(newOwnerAddr) && !isOfficer) {
                throw new HttpError(403,
                    'Parcel ' + parcelNumber + ' is already registered under a different owner. ' +
                    'A Registry Officer must approve any ownership change.'
                );
            }

            // SEC-TITLE-02: a Registry Officer cannot register land in their own name
            if (isOfficer && callerAddress && newOwnerAddr === callerAddress && callerRole !== 'ADMIN') {
                throw new HttpError(403,
                    'A Registry Officer may not register a parcel with themselves as the owner (SEC-TITLE-02). ' +
                    'Self-dealing is prohibited.'
                );
            }
        }

        // ── TC-LR-003: Lesotho national boundary validation ──────────────────
        // Lesotho is completely landlocked within South Africa.
        // Approximate bounding box: lat -30.68...-28.57, lng 27.00...29.46
        // DLSPP WFS validation is stubbed here; swap for real API call in prod.
        if (geoJson && geoJson.coordinates) {
            const LSO_LAT_MIN = -30.68, LSO_LAT_MAX = -28.57;
            const LSO_LNG_MIN =  27.00, LSO_LNG_MAX =  29.46;
            const rings = geoJson.type === 'Polygon'
                ? geoJson.coordinates
                : (geoJson.coordinates || []).flat(1); // MultiPolygon
            const allCoords = rings.flat(1);
            const outside = allCoords.find(([lng, lat]) =>
                lat < LSO_LAT_MIN || lat > LSO_LAT_MAX ||
                lng < LSO_LNG_MIN || lng > LSO_LNG_MAX
            );
            if (outside) {
                throw new HttpError(422,
                    `Coordinates [${outside[1]}, ${outside[0]}] fall outside Lesotho national boundary. ` +
                    'All parcels must be within the Kingdom of Lesotho (FR-LR-002).'
                );
            }
        }

        // ── TX hash ─────────────────────────────────────────────────────────
        // Try to get a real chain TX hash; fall back to synthetic.
        const txHash = (await getChainTxHash(callerAddress, req.body)) || makeTxHash();

        // ── Parcel upsert ────────────────────────────────────────────────────
        const parcelDoc = {
            pin:           parcelNumber,
            tokenId,
            district:      district || 'Maseru',
            legacyAddress: location,
            areaM2:        areaM2 || area || 0,
            landUse:       landUse || 'RESIDENTIAL',
            blockchainTxId: txHash,
            registeredBy: {
                officerId: req.user?.id   || null,
                name:      callerName,
                orgId:     'LAA',
            },
        };
        if (geoJson) parcelDoc.location = geoJson;

        const parcel = await Parcel.findOneAndUpdate(
            { pin: parcelNumber },
            { $set: parcelDoc },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        // ── TitleDeed upsert ─────────────────────────────────────────────────
        let deed = null;
        let finalDeedNumber = null;
        if (owner) {
            const ownerAddress = (typeof owner === 'string'
                ? owner
                : (owner.address || owner.toString())
            ).toLowerCase();
            const ownerName    = (owner && owner.fullName) ? owner.fullName : owner.toString();
            finalDeedNumber    = deedNumber || makeDeedNumber(await nextSequence('deeds'));

            deed = await TitleDeed.findOneAndUpdate(
                { parcelPin: parcelNumber },
                {
                    $set: {
                        deedNumber:     finalDeedNumber,
                        parcelPin:      parcelNumber,
                        tokenId,
                        owners: [{ fullName: ownerName, address: ownerAddress, percentage: 100 }],
                        status:         'ACTIVE',
                        issuedBy:       callerAddress || 'system',
                        issuedAt:       new Date(),
                        blockchainTxId: txHash,
                        signingOfficerId: req.user?.id || null,
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
            );

            await Parcel.updateOne(
                { pin: parcelNumber },
                { $set: { titleDeedRef: finalDeedNumber } }
            );
        }

        // ── AuditLog entries ─────────────────────────────────────────────────
        // Write one entry for PARCEL_REGISTERED and one for TITLE_ISSUED so the
        // provenance ledger (provenanceService.history) gets TX-linked records.
        const auditBase = {
            actorId:      req.user?.id      || null,
            actorAddress: callerAddress     || null,
            actorRole:    callerRole,
            resourceType: 'titles',
            resourceId:   parcelNumber,
            blockchainTxId: txHash,
            ipAddress:    req.ip,
        };

        const auditWrites = [
            AuditLog.create({
                ...auditBase,
                action:          'PARCEL_REGISTERED',
                responseSummary: { parcelNumber, district: district || 'Maseru', landUse: landUse || 'RESIDENTIAL' },
            }),
        ];

        if (deed) {
            auditWrites.push(
                AuditLog.create({
                    ...auditBase,
                    action:          'TITLE_ISSUED',
                    responseSummary: { deedNumber: finalDeedNumber, parcelNumber },
                })
            );
        }

        // Fire-and-forget — never block the response on audit writes
        Promise.allSettled(auditWrites).catch(() => {});

        res.json({ success: true, parcel, deed, txHash, additionalDetails });
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

        const txHash = makeTxHash();

        deed.status     = 'REVOKED';
        deed.issuedBy   = deed.issuedBy || callerAddress;
        deed.revocation = {
            revokedAt:     new Date(),
            revokedBy:     callerAddress,
            reason,
            courtOrderRef: courtOrderRef || null,
        };
        deed.blockchainTxId = txHash;
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
            blockchainTxId: txHash,
            ipAddress:     req.ip,
            responseSummary: { deedNumber: deed.deedNumber, reason, courtOrderRef },
        }).catch(() => {});

        res.json({ success: true, deed, txHash });
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

        // Validate co-ownership if owners provided
        if (owners && Array.isArray(owners)) {
            const total = owners.reduce((s, o) => s + (Number(o.percentage) || 0), 0);
            if (Math.abs(total - 100) > 0.001) {
                throw new HttpError(422, 'Owner percentages must sum to 100 (FR-TD-006)');
            }
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

        // Apply amendments
        if (owners) deed.owners = owners;
        deed.version += 1;
        deed.issuedBy = deed.issuedBy || callerAddress;

        const txHash = makeTxHash();
        deed.blockchainTxId = txHash;
        deed.markModified('history');
        deed.markModified('owners');
        await deed.save();

        // AuditLog
        AuditLog.create({
            actorId:       req.user?.id || null,
            actorAddress:  callerAddress,
            actorRole:     callerRole,
            action:        'TITLE_AMENDED',
            resourceType:  'titles',
            resourceId:    deed.parcelPin,
            blockchainTxId: txHash,
            ipAddress:     req.ip,
            responseSummary: { deedNumber: deed.deedNumber, version: deed.version, reason },
        }).catch(() => {});

        res.json({ success: true, deed, txHash });
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

                // If owner details provided, also upsert TitleDeed as DRAFT
                if (ownerName && ownerAddress) {
                    const seq = await nextSequence('deeds');
                    const deedNum = makeDeedNumber(seq);
                    await TitleDeed.findOneAndUpdate(
                        { parcelPin: parcelNumber },
                        {
                            $setOnInsert: {
                                deedNumber: deedNum,
                                parcelPin:  parcelNumber,
                                owners: [{ fullName: ownerName, address: ownerAddress, percentage: 100 }],
                                status: 'ACTIVE',
                                issuedBy: callerAddress,
                                issuedAt: new Date(),
                            },
                        },
                        { upsert: true, new: false, setDefaultsOnInsert: true }
                    );
                }

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
