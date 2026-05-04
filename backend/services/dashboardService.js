/**
 * Dashboard service — feeds the GovTech LMBS Dashboard screen.
 *
 * Aggregates data from the existing Mongoose collections (parcels,
 * title_deeds, transfers, disputes, audit_log) into the three top-level
 * metrics + Recent Registrations table the dashboard renders.
 */

const { Parcel, TitleDeed, Transfer, Dispute, User, AuditLog } = require('../models');

async function stats() {
    const [verified, pending, validators, today] = await Promise.all([
        Parcel.countDocuments({ status: 'ACTIVE' }),
        Transfer.countDocuments({ status: { $in: ['PENDING_OWNER', 'PENDING_KYC', 'PENDING_NOTARY', 'PENDING_OFFICER'] } }),
        User.countDocuments({ role: { $in: ['REGISTRY_OFFICER', 'ADMIN'] }, isActive: true }),
        AuditLog.countDocuments({ timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
    ]);

    return {
        totalVerifiedTitles: verified,
        activeNodeValidators: validators,
        pendingTransactions: pending,
        eventsLast24h: today,
        // Helpful percentage delta — compare last 7 days to previous 7 days
        // (rough heuristic; replace with real moving-average analytics later).
        verifiedDeltaPct: await growthDeltaPct(),
    };
}

async function growthDeltaPct() {
    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;

    const [thisWeek, lastWeek] = await Promise.all([
        Parcel.countDocuments({ createdAt: { $gte: new Date(now - week) } }),
        Parcel.countDocuments({ createdAt: { $gte: new Date(now - 2 * week), $lt: new Date(now - week) } }),
    ]);
    if (lastWeek === 0) return thisWeek > 0 ? 100 : 0;
    return Number((((thisWeek - lastWeek) / lastWeek) * 100).toFixed(1));
}

async function recentRegistrations({ limit = 10 } = {}) {
    const parcels = await Parcel.find({})
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 50))
        .lean();

    return Promise.all(parcels.map(async (p) => {
        const [deed, transferCount, disputeCount] = await Promise.all([
            TitleDeed.findOne({ parcelPin: p.pin }).select('owners deedNumber').lean(),
            Transfer.countDocuments({ parcelPin: p.pin, status: { $ne: 'COMPLETE' } }),
            Dispute.countDocuments({ parcelPin: p.pin, status: { $in: ['OPEN', 'UNDER_REVIEW'] } }),
        ]);

        let status = 'verified';
        if (disputeCount > 0)         status = 'disputed';
        else if (transferCount > 0)   status = 'pending';
        else if (p.status === 'REVOKED') status = 'disputed';

        return {
            hash: p.blockchainTxId
                ? `${p.blockchainTxId.slice(0, 6)}…${p.blockchainTxId.slice(-3)}`
                : '—',
            blockchainTxId: p.blockchainTxId,
            parcelRef: p.pin,
            deedNumber: deed?.deedNumber,
            owner: deed?.owners?.[0]?.fullName || p.registeredBy?.name || 'Unknown',
            status,
            time: humanise(p.createdAt),
            createdAt: p.createdAt,
        };
    }));
}

function humanise(date) {
    if (!date) return '—';
    const ms = Date.now() - new Date(date).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d`;
    return new Date(date).getFullYear().toString();
}

module.exports = { stats, recentRegistrations };
