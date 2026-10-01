/**
 * LMBS Backend — express bootstrap.
 *
 * Layered architecture per SAD §6:
 *   config/      env + DB connection
 *   models/      Mongoose schemas (off-chain data and chain READ MODELS)
 *   controllers/ thin request handlers
 *   services/    business logic, chain adapter, indexer, encrypted documents
 *   middleware/  auth, rbac, audit, error handling
 *   routes/      URL → controller wiring
 *
 * Security posture (supervisor review, Aug 2026):
 *   - Authentication is required for every route except /api/health,
 *     /api/auth/login and /api/auth/register.
 *   - RBAC is always enforced (no "log and allow" mode).
 *   - The server refuses to start with missing or placeholder secrets.
 *   - The backend holds no validator keys, seed phrases or mnemonics and does
 *     not sign land-registry transactions.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const env = require('./config/env');
const { authMiddleware } = require('./middleware/auth');
const { auditMiddleware } = require('./middleware/audit');
const { notFoundHandler, errorHandler } = require('./middleware/error');

function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(helmet());
    app.use(cors({ origin: env.corsOrigins, credentials: false }));

    // ----- Public -----
    app.get('/api/health', (_req, res) => res.json({ status: 'ok', chainId: env.chainId }));
    app.use('/api/auth', express.json({ limit: '100kb' }), require('./routes/auth'));

    // ----- Everything below requires a valid token -----
    app.use('/api', authMiddleware({ required: true }));
    app.use(auditMiddleware());
    app.use('/api/documents', require('./routes/documents')); // own (larger) body limit
    app.use(express.json({ limit: '2mb' }));

    app.use('/api/chain', require('./routes/chain'));
    app.use('/api/profiles', require('./routes/profiles'));
    app.use('/api/titles', require('./routes/titles'));
    app.use('/api/transfers', require('./routes/transfers'));
    app.use('/api/disputes', require('./routes/disputes'));
    app.use('/api/encumbrances', require('./routes/encumbrances'));
    app.use('/api/search', require('./routes/search'));
    app.use('/api/notifications', require('./routes/notifications'));
    app.use('/api/audit', require('./routes/audit'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/api/dashboard', require('./routes/dashboard'));
    app.use('/api/parcels', require('./routes/parcels'));
    app.use('/api/certificates', require('./routes/certificates'));
    app.use('/api/network', require('./routes/network'));

    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
}

const app = createApp();

if (require.main === module) {
    try {
        env.assertSecureConfig();
    } catch (err) {
        console.error(`[bootstrap] ${err.message}\nCreate backend/.env from .env.example (npm run gen:secrets).`);
        process.exit(1);
    }
    const { connectDB } = require('./config/db');
    const indexer = require('./services/indexerService');
    const models = require('./models');
    connectDB()
        .then(() => {
            console.log('[bootstrap] MongoDB ready');
            indexer.start(models);
        })
        .catch((err) => console.error(`[bootstrap] MongoDB connection failed (${env.mongoUri}): ${err.message}\n` +
            'Start MongoDB and restart the backend.'));
    app.listen(env.port, () => console.log('[bootstrap] LMBS backend listening on :' + env.port));
}

module.exports = app;
module.exports.createApp = createApp;
