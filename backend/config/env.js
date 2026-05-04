/**
 * Centralised environment / configuration object.
 *
 * Loads .env once and exposes a typed object the rest of the backend can rely
 * on. Anything new that reads process.env should go through this file so we
 * have a single audit point per SAD §9 (Security Architecture).
 */

require('dotenv').config();

function num(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

const env = {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: num(process.env.PORT, 5000),

    // MongoDB
    mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lmbs_db',
    mongoDbName: process.env.MONGODB_DB_NAME || 'lmbs_db',

    // Blockchain (Besu permissioned EVM)
    rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8560',
    chainId: num(process.env.CHAIN_ID, 2026),
    landTitleAddress: process.env.LAND_TITLE_ADDRESS || '',
    userProfileAddress: process.env.USER_PROFILE_ADDRESS || '',
    transferTitleAddress: process.env.TRANSFER_TITLE_ADDRESS || '',
    disputesAddress: process.env.DISPUTES_ADDRESS || '',
    encumbrancesAddress: process.env.ENCUMBRANCES_ADDRESS || '',
    auditLogAddress: process.env.AUDIT_LOG_ADDRESS || '',

    // Crypto / signing
    encryptionKey: process.env.ENCRYPTION_KEY || 'DEFAULT_TEST_KEY_MUST_CHANGE',
    jwtSecret: process.env.JWT_SECRET || 'DEFAULT_JWT_SECRET_MUST_CHANGE',
    jwtTtlMinutes: num(process.env.JWT_TTL_MINUTES, 30), // SEC-009

    // Notification (stubbed — see SAD §6.4)
    smsProvider: process.env.SMS_PROVIDER || 'stub',
    emailProvider: process.env.EMAIL_PROVIDER || 'stub',

    // Feature flags
    auditEnabled: (process.env.AUDIT_ENABLED || 'true') === 'true',
    requireAuth: (process.env.REQUIRE_AUTH || 'false') === 'true',
};

module.exports = env;
