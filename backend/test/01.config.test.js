const crypto = require('crypto');
const { assertSecureConfig } = require('../config/env');

const good = () => ({
    jwtSecret: crypto.randomBytes(32).toString('hex'),
    encryptionKeyHex: crypto.randomBytes(32).toString('hex'),
    pseudonymSalt: crypto.randomBytes(32).toString('hex'),
});

describe('Secure configuration (no default secrets)', () => {
    test('accepts strong random secrets', () => {
        expect(assertSecureConfig(good())).toBe(true);
    });

    test.each([
        ['missing JWT secret', { jwtSecret: '' }],
        ['short JWT secret', { jwtSecret: 'abc123' }],
        ['old default JWT secret', { jwtSecret: 'DEFAULT_JWT_SECRET_MUST_CHANGE_DEFAULT_JWT_SECRET' }],
        ['placeholder JWT secret', { jwtSecret: 'please-change-this-secret-value-before-production' }],
        ['missing encryption key', { encryptionKeyHex: '' }],
        ['old default encryption key', { encryptionKeyHex: 'DEFAULT_TEST_KEY_MUST_CHANGE' }],
        ['non-hex encryption key', { encryptionKeyHex: 'z'.repeat(64) }],
        ['missing pseudonym salt', { pseudonymSalt: '' }],
    ])('refuses to start with %s', (_label, override) => {
        expect(() => assertSecureConfig({ ...good(), ...override })).toThrow(/Insecure configuration/);
    });

    test('the example env file ships without secret values', () => {
        const text = require('fs').readFileSync(require('path').join(__dirname, '..', '.env.example'), 'utf8');
        for (const k of ['JWT_SECRET', 'ENCRYPTION_KEY', 'PSEUDONYM_SALT']) {
            expect(text).toMatch(new RegExp(`^${k}=$`, 'm'));
        }
        expect(text).not.toMatch(/mongodb\+srv:\/\/[^<\s]+:[^<\s]+@/); // no real Atlas credentials
    });
});
