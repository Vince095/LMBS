/**
 * Encrypted off-chain document store.
 *
 *   put()    encrypts the file with AES-256-GCM, writes <docId>.enc to
 *            DOCUMENT_STORE_DIR and records metadata (sha256, keccak256) in
 *            MongoDB. The keccak256 `documentHash` is what a registration or
 *            transfer request anchors on-chain.
 *   get()    decrypts and re-hashes; if one byte of the stored file was
 *            changed, GCM authentication fails and IntegrityError is thrown.
 *   verify() the same check without returning the content, plus an optional
 *            comparison with the hash recorded on-chain.
 *
 * The chain proves a document has not changed; it does not make it
 * confidential — confidentiality comes from the encryption here.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');
const env = require('../config/env');
const { encrypt, decrypt, sha256 } = require('./cryptoService');

class IntegrityError extends Error {
    constructor(message) { super(message); this.status = 409; this.code = 'DOCUMENT_INTEGRITY_FAILURE'; }
}

function storeDir() {
    const dir = path.isAbsolute(env.documentStoreDir) ? env.documentStoreDir : path.join(__dirname, '..', env.documentStoreDir);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function fileFor(docId) {
    if (!/^[0-9a-f]{32}$/.test(docId)) throw new IntegrityError('Invalid document id');
    return path.join(storeDir(), `${docId}.enc`);
}

function hashes(buf) {
    return { sha256: sha256(buf), documentHash: ethers.keccak256(buf) };
}

async function put(StoredDocument, buf, meta = {}) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) throw Object.assign(new Error('Empty document'), { status: 400 });
    if (buf.length > env.maxDocumentBytes) throw Object.assign(new Error('Document too large'), { status: 413 });
    const docId = crypto.randomBytes(16).toString('hex');
    const h = hashes(buf);
    const enc = encrypt(buf);
    fs.writeFileSync(fileFor(docId), enc.ciphertext, { mode: 0o600 });
    const doc = await StoredDocument.create({
        docId,
        parcelPin: meta.parcelPin,
        type: meta.type || 'OTHER',
        name: meta.name,
        mimeType: meta.mimeType,
        sizeBytes: buf.length,
        sha256: h.sha256,
        documentHash: h.documentHash,
        encryption: { alg: 'aes-256-gcm', iv: enc.iv, tag: enc.tag },
        uploadedBy: meta.uploadedBy,
        members: meta.members,
    });
    return doc;
}

function readAndCheck(doc) {
    let plaintext;
    try {
        const ciphertext = fs.readFileSync(fileFor(doc.docId));
        plaintext = decrypt({ ciphertext, iv: doc.encryption.iv, tag: doc.encryption.tag });
    } catch (err) {
        if (err instanceof IntegrityError) throw err;
        if (err.code === 'ENOENT') throw new IntegrityError('Encrypted document file is missing');
        throw new IntegrityError('Encrypted document failed authentication (modified or corrupted)');
    }
    const h = hashes(plaintext);
    if (h.sha256 !== doc.sha256 || h.documentHash !== doc.documentHash) {
        throw new IntegrityError('Document hash does not match the recorded hash');
    }
    return plaintext;
}

async function get(StoredDocument, docId) {
    const doc = await StoredDocument.findOne({ docId }).lean();
    if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });
    return { doc, content: readAndCheck(doc) };
}

async function verify(StoredDocument, docId, onChainHash) {
    const doc = await StoredDocument.findOne({ docId }).lean();
    if (!doc) throw Object.assign(new Error('Document not found'), { status: 404 });
    const result = { docId, documentHash: doc.documentHash, storageIntact: false, matchesChain: null };
    try { readAndCheck(doc); result.storageIntact = true; } catch (err) { result.error = err.message; }
    if (onChainHash) result.matchesChain = onChainHash.toLowerCase() === doc.documentHash.toLowerCase();
    return result;
}

module.exports = { put, get, verify, hashes, IntegrityError, _fileFor: fileFor };
