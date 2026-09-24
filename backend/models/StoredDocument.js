/**
 * documents collection — metadata for the ENCRYPTED off-chain document store.
 *
 * The file itself is stored AES-256-GCM encrypted on disk
 * (services/documentStore.js). Only `documentHash` (keccak256 of the
 * plaintext) is ever anchored on-chain; it proves integrity, not
 * confidentiality.
 */
const { Schema, model } = require('mongoose');

const storedDocumentSchema = new Schema({
    docId: { type: String, required: true, unique: true, index: true },
    parcelPin: { type: String, index: true },
    type: { type: String, default: 'OTHER' },
    name: { type: String, trim: true },
    mimeType: String,
    sizeBytes: Number,
    sha256: { type: String, required: true },       // plaintext SHA-256 (hex)
    documentHash: { type: String, required: true }, // plaintext keccak256 (0x…), used on-chain
    encryption: {
        alg: { type: String, default: 'aes-256-gcm' },
        iv: String,
        tag: String,
    },
    uploadedBy: { userId: String, address: String, role: String },
}, { timestamps: true, collection: 'documents' });

module.exports = model('StoredDocument', storedDocumentSchema);
