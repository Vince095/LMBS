/**
 * Symmetric encryption for OFF-CHAIN documents (AES-256-GCM).
 *
 *  - The 256-bit key comes from ENCRYPTION_KEY (64 hex chars). There is no
 *    default key and no key derivation from a password.
 *  - GCM is authenticated: any modification of the ciphertext, IV or tag
 *    makes decryption fail, so tampering is detected.
 *
 * NOTE: validator keys, seed phrases and mnemonics are NEVER handled by this
 * backend. Approvals are signed in the approver's own wallet.
 */

const crypto = require('crypto');
const env = require('../config/env');

function keyFrom(hex = env.encryptionKeyHex) {
    if (!/^[0-9a-fA-F]{64}$/.test(hex || '')) throw new Error('ENCRYPTION_KEY must be 64 hex characters');
    return Buffer.from(hex, 'hex');
}

function encrypt(plaintext, keyHex) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(keyHex), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex') };
}

function decrypt({ ciphertext, iv, tag }, keyHex) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(keyHex), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = { encrypt, decrypt, sha256 };
