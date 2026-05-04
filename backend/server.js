/**
 * LMBS Backend — express bootstrap.
 *
 * Layered architecture per SAD §6:
 *   config/      env + DB connection
 *   models/      Mongoose schemas (SAD §5.3)
 *   controllers/ thin request handlers
 *   services/    business logic
 *   middleware/  auth, rbac, audit, error handling
 *   routes/      URL → controller wiring
 */

const express = require('express');
const cors = require('cors');

const env = require('./config/env');
const { connectDB } = require('./config/db');
const { authMiddleware } = require('./middleware/auth');
const { auditMiddleware } = require('./middleware/audit');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const profilesRouter    = require('./routes/profiles');
const titlesRouter      = require('./routes/titles');
const signaturesRouter  = require('./routes/signatures');
const transacsRouter    = require('./routes/transacs');
const disputesRouter    = require('./routes/disputes');
const encumbrancesRouter= require('./routes/encumbrances');
const searchRouter      = require('./routes/search');
const notificationsRouter = require('./routes/notifications');
const auditRouter       = require('./routes/audit');
const transfersRouter   = require('./routes/transfers');
const adminRouter       = require('./routes/admin');

// GovTech UI feeds
const dashboardRouter   = require('./routes/dashboard');
const parcelsRouter     = require('./routes/parcels');
const certificatesRouter= require('./routes/certificates');
const networkRouter     = require('./routes/network');
const authRouter        = require('./routes/auth');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Initialise DB on boot.
connectDB()
    .then(() => console.log('[bootstrap] MongoDB ready'))
    .catch((err) => console.error('[bootstrap] MongoDB connection failed', err));

// Healthcheck — no auth, no audit.
app.get('/api/health', (_req, res) => res.json({
    status: 'ok',
    nodeEnv: env.nodeEnv,
    chainId: env.chainId,
    requireAuth: env.requireAuth,
}));

// Auth (permissive by default) decorates req.user; audit logs every mutation.
app.use(authMiddleware());
app.use(auditMiddleware());

// ----- Authentication -----
app.use('/api/auth', authRouter);

// ----- Legacy routes (URL-stable) -----
app.use('/api/profiles', profilesRouter);
app.use('/api/titles', titlesRouter);
app.use('/api/signatures', signaturesRouter);
app.use('/api/transacs', transacsRouter);

// ----- New feature routes -----
app.use('/api/disputes', disputesRouter);
app.use('/api/encumbrances', encumbrancesRouter);
app.use('/api/search', searchRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/transfers', transfersRouter);

// ----- Admin (ADMIN role only) -----
app.use('/api/admin', adminRouter);

// ----- GovTech UI feeds -----
app.use('/api/dashboard', dashboardRouter);
app.use('/api/parcels', parcelsRouter);
app.use('/api/certificates', certificatesRouter);
app.use('/api/network', networkRouter);

// 404 + error handlers must be last.
app.use(notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
    app.listen(env.port, () => {
        console.log('[bootstrap] LMBS backend listening on :' + env.port);
    });
}

module.exports = app;
