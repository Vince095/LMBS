/**
 * /api/documents — encrypted off-chain document storage.
 *
 * Upload body (JSON): { contentBase64, name, type, mimeType, parcelPin? }
 * The response includes `documentHash` (keccak256), which is the value the
 * client puts on-chain in submitRegistration / submitTransfer.
 */

const models = require('../models');
const store = require('../services/documentStore');
const { HttpError } = require('../middleware/error');

const OFFICER_ROLES = ['REGISTRY_OFFICER', 'SURVEYOR', 'NOTARY', 'AUDITOR', 'ADMIN'];
// Roles that may attach documents to any parcel's record.
const ATTACH_ROLES = ['REGISTRY_OFFICER', 'SURVEYOR', 'NOTARY'];
// Parcel states with no issued title: the applicant is still building their own submission.
const OPEN_STATES = ['DRAFT', 'REJECTED'];

function canRead(user, doc) {
    if (OFFICER_ROLES.includes(user.role)) return true;
    const up = doc.uploadedBy || {};
    return up.userId === String(user.id) || (user.address && up.address === user.address);
}

/**
 * Officers may attach to any parcel. Anyone else may attach only to a parcel
 * with no issued title (their own registration in progress) or to a title
 * they currently hold (the seller's transfer documents).
 */
async function mayAttach(user, pin) {
    if (ATTACH_ROLES.includes(user.role)) return true;
    const parcel = await models.Parcel.findOne({ pin }).select('status parcelKey').lean();
    if (!parcel || OPEN_STATES.includes(parcel.status)) return true;
    if (!user.address) return false;
    const or = [{ parcelNumber: pin }];
    if (parcel.parcelKey) or.push({ parcelKey: parcel.parcelKey });
    const last = await models.ChainRequest.findOne({ $or: or, status: 'EXECUTED' }).sort({ requestId: -1 }).lean();
    return !!last && last.to === String(user.address).toLowerCase();
}

/** A wizard manifest (JSON listing documents) commits to its members' hashes when it is anchored. */
function manifestMembers(buf, mimeType) {
    if (mimeType !== 'application/json') return undefined;
    try {
        const json = JSON.parse(buf.toString('utf8'));
        if (!Array.isArray(json.documents)) return undefined;
        const hashes = json.documents.map((d) => d && d.documentHash).filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h || ''));
        return hashes.length ? hashes.map((h) => h.toLowerCase()) : undefined;
    } catch (_) {
        return undefined;
    }
}

async function upload(req, res, next) {
    try {
        const { contentBase64, name, type, mimeType, parcelPin } = req.body || {};
        if (!contentBase64) throw new HttpError(400, 'contentBase64 is required');
        if (parcelPin && !(await mayAttach(req.user, parcelPin))) {
            throw new HttpError(403, 'Only registry officers, surveyors, notaries or the current title holder may attach documents to this parcel');
        }
        const buf = Buffer.from(String(contentBase64), 'base64');
        const doc = await store.put(models.StoredDocument, buf, {
            name, type, mimeType, parcelPin, members: manifestMembers(buf, mimeType),
            uploadedBy: { userId: String(req.user.id), address: req.user.address, role: req.user.role },
        });
        if (parcelPin) {
            await models.Parcel.updateOne({ pin: parcelPin }, { $push: { supportingDocs: {
                type: type || 'OTHER', name, sha256: doc.sha256, documentHash: doc.documentHash,
                docId: doc.docId, sizeKB: Math.ceil(doc.sizeBytes / 1024), uploadedBy: req.user.address || String(req.user.id),
            } } });
        }
        res.status(201).json({ docId: doc.docId, sha256: doc.sha256, documentHash: doc.documentHash, sizeBytes: doc.sizeBytes, name: doc.name, type: doc.type });
    } catch (err) { next(err); }
}

async function download(req, res, next) {
    try {
        const meta = await models.StoredDocument.findOne({ docId: req.params.docId }).lean();
        if (!meta) throw new HttpError(404, 'Document not found');
        if (!canRead(req.user, meta)) throw new HttpError(403, 'Forbidden');
        const { content } = await store.get(models.StoredDocument, req.params.docId);
        res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${(meta.name || meta.docId).replace(/[^\w.-]/g, '_')}"`);
        res.setHeader('X-Document-Hash', meta.documentHash);
        res.send(content);
    } catch (err) { next(err); }
}

async function verify(req, res, next) {
    try {
        const meta = await models.StoredDocument.findOne({ docId: req.params.docId }).lean();
        if (!meta) throw new HttpError(404, 'Document not found');
        if (!canRead(req.user, meta)) throw new HttpError(403, 'Forbidden');
        res.json(await store.verify(models.StoredDocument, req.params.docId, req.query.onChainHash));
    } catch (err) { next(err); }
}

module.exports = { upload, download, verify, canRead, mayAttach };
