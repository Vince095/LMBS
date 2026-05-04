/**
 * AES-256-CBC envelope encryption helper.
 *
 * Used to encrypt validator mnemonic phrases before writing them to MongoDB
 * (the on-chain anchor stores only a keccak256 hash). Mirrors the original
 * `routes/signatures.js` implementation but lives in the service layer so it
 * can be reused by other modules.
 */

const crypto = require('crypto');
const env = require('../config/env');

function deriveKey(secret) {
    return crypto.createHash('sha256').update(String(secret)).digest('base64').substring(0, 32);
}

function encrypt(plaintext, secret = env.encryptionKey) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(deriveKey(secret));
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let out = cipher.update(plaintext, 'utf8', 'hex');
    out += cipher.final('hex');
    return `${iv.toString('hex')}:${out}`;
}

function decrypt(ciphertext, secret = env.encryptionKey) {
    const [ivHex, dataHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = Buffer.from(deriveKey(secret));
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let out = decipher.update(dataHex, 'hex', 'utf8');
    out += decipher.final('utf8');
    return out;
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { encrypt, decrypt, sha256 };
