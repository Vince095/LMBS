/**
 * Creates backend/.env from .env.example with fresh random secrets.
 * Refuses to overwrite an existing .env.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const target = path.join(root, '.env');
if (fs.existsSync(target)) {
    console.error('.env already exists; delete it first if you really want new secrets.');
    process.exit(1);
}
let text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
for (const key of ['JWT_SECRET', 'ENCRYPTION_KEY', 'PSEUDONYM_SALT']) {
    text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${crypto.randomBytes(32).toString('hex')}`);
}
fs.writeFileSync(target, text, { mode: 0o600 });
console.log('Wrote backend/.env with new random secrets.');
