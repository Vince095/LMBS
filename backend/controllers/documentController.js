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

function canRead(user, doc) {
    if (OFFICER_ROLES.includes(user.role)) return true;
    const up = doc.uploadedBy || {};
    return up.userId === String(user.id) || (user.address && up.address === user.address);
}

async function upload(req, res, next) {
    try {
        const { contentBase64, name, type, mimeType, parcelPin } = req.body || {};
        if (!contentBase64) throw new HttpError(400, 'contentBase64 is required');
        const buf = Buffer.from(String(contentBase64), 'base64');
        const doc = await store.put(models.StoredDocument, buf, {
            name, type, mimeType, parcelPin,
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

module.exports = { upload, download, verify, canRead };
