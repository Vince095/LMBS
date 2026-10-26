/**
 * Centralised environment / configuration object.
 *
 * Loads .env once and exposes a typed object the rest of the backend relies
 * on. Anything that reads process.env should go through this file so there is
 * a single audit point (SAD §9 Security Architecture).
 *
 * SECURITY: there are NO usable default secrets. `assertSecureConfig()` is
 * called at start-up and refuses to boot if JWT_SECRET or ENCRYPTION_KEY are
 * missing, too short or still set to an example value.
 */

require('dotenv').config();

function num(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function list(value, fallback) {
    return (value || fallback).split(',').map((s) => s.trim()).filter(Boolean);
}

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: num(process.env.PORT, 5000),
    corsOrigins: list(process.env.CORS_ORIGINS, 'http://localhost:3000'),

    // MongoDB
    mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lmbs_db',
    mongoDbName: process.env.MONGODB_DB_NAME || 'lmbs_db',

    // Blockchain (Hyperledger Besu QBFT, permissioned EVM)
    rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
    chainId: num(process.env.CHAIN_ID, 2026),
    // Written by `npm run deploy:besu` in ../blockchain (addresses + ABI).
    chainDeploymentFile: process.env.CHAIN_DEPLOYMENT_FILE || 'chain/deployment.besu.json',
    indexerEnabled: (process.env.INDEXER_ENABLED || 'true') === 'true',
    indexerIntervalMs: num(process.env.INDEXER_INTERVAL_MS, 4000),

    // Secrets (no defaults — see assertSecureConfig)
    jwtSecret: process.env.JWT_SECRET || '',
    jwtTtlMinutes: num(process.env.JWT_TTL_MINUTES, 30), // SEC-009
    encryptionKeyHex: process.env.ENCRYPTION_KEY || '',  // AES-256-GCM key for off-chain documents
    pseudonymSalt: process.env.PSEUDONYM_SALT || '',     // salts on-chain identity references

    // Encrypted off-chain document store
    documentStoreDir: process.env.DOCUMENT_STORE_DIR || 'storage/documents',
    maxDocumentBytes: num(process.env.MAX_DOCUMENT_BYTES, 10 * 1024 * 1024),

    // Notification (stubbed — see SAD §6.4)
    smsProvider: process.env.SMS_PROVIDER || 'stub',
    emailProvider: process.env.EMAIL_PROVIDER || 'stub',

    auditEnabled: (process.env.AUDIT_ENABLED || 'true') === 'true',
    // Login/registration attempts per IP per 15 minutes (raise only for automated test runs).
    authRateLimit: num(process.env.AUTH_RATE_LIMIT, 20),
};

const PLACEHOLDER = /change|example|default|placeholder|secret|password|generate/i;

/**
 * Throws if the security-critical configuration is missing or weak.
 * Called from server.js before the HTTP listener starts.
 */
function assertSecureConfig(e = env) {
    const problems = [];
    if (!e.jwtSecret || e.jwtSecret.length < 32 || PLACEHOLDER.test(e.jwtSecret)) {
        problems.push('JWT_SECRET must be a random value of at least 32 characters (openssl rand -hex 32)');
    }
    if (!/^[0-9a-fA-F]{64}$/.test(e.encryptionKeyHex)) {
        problems.push('ENCRYPTION_KEY must be exactly 64 hex characters (openssl rand -hex 32)');
    }
    if (!e.pseudonymSalt || e.pseudonymSalt.length < 32 || PLACEHOLDER.test(e.pseudonymSalt)) {
        problems.push('PSEUDONYM_SALT must be a random value of at least 32 characters (openssl rand -hex 32)');
    }
    if (problems.length) {
        const err = new Error('Insecure configuration:\n - ' + problems.join('\n - '));
        err.code = 'INSECURE_CONFIG';
        throw err;
    }
    return true;
}

module.exports = env;
module.exports.assertSecureConfig = assertSecureConfig;
