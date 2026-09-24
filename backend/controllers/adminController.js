/**
 * Admin controller — user & system management (ADMIN role only).
 *
 * FR-SC-004 / SRS NFR-SEC: Only ADMIN may change roles, activate/deactivate
 * accounts, or view the full user list.
 */

const { User } = require('../models');
const { HttpError } = require('../middleware/error');

const ALLOWED_ROLES = [
    'CITIZEN', 'REGISTRY_OFFICER', 'SURVEYOR', 'NOTARY',
    'FINANCIAL_INST', 'AUDITOR', 'ADMIN',
];

/**
 * GET /api/admin/users
 * Paginated list of all users with optional role and search filters.
 */
async function listUsers(req, res, next) {
    try {
        var limit  = Math.min(Number(req.query.limit) || 50, 200);
        var page   = Math.max(Number(req.query.page)  || 1,  1);
        var skip   = (page - 1) * limit;

        var filter = {};
        if (req.query.role)  filter.role = req.query.role;
        if (req.query.q) {
            var re = new RegExp(req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [{ name: re }, { email: re }, { lnid: re }, { address: re }];
        }
        if (req.query.active !== undefined) filter.isActive = req.query.active !== 'false';

        var [users, total] = await Promise.all([
            User.find(filter).select('-passwordHash -__v').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            User.countDocuments(filter),
        ]);
        res.json({ users: users, total: total, page: page, limit: limit, pages: Math.ceil(total / limit) });
    } catch (err) { next(err); }
}

/**
 * GET /api/admin/users/:userId
 * Fetch a single user.
 */
async function getUser(req, res, next) {
    try {
        var user = await User.findById(req.params.userId).select('-passwordHash -__v').lean();
        if (!user) throw new HttpError(404, 'User not found');
        res.json(user);
    } catch (err) { next(err); }
}

/**
 * PUT /api/admin/users/:userId
 * Update role, isActive, district, name, email, phone for any user.
 * Only ADMIN may call this endpoint.
 */
async function updateUser(req, res, next) {
    try {
        var { role, isActive, name, email, phone, district, lnid } = req.body;

        // Validate role if being changed
        if (role && !ALLOWED_ROLES.includes(role)) {
            throw new HttpError(400, 'Invalid role: ' + role + '. Allowed: ' + ALLOWED_ROLES.join(', '));
        }

        // Prevent admin from revoking their own admin role (to avoid lockout)
        if (role && req.user && req.params.userId === String(req.user.id) && role !== 'ADMIN') {
            throw new HttpError(409, 'An admin cannot revoke their own ADMIN role');
        }

        var update = {};
        if (role      !== undefined) update.role      = role;
        if (isActive  !== undefined) update.isActive  = isActive;
        if (name      !== undefined) update.name      = name;
        if (email     !== undefined) update.email     = email;
        if (phone     !== undefined) update.phone     = phone;
        if (district  !== undefined) update.district  = district;
        if (lnid      !== undefined) update.lnid      = lnid;

        var matched = (await User.updateOne({ _id: req.params.userId }, { $set: update }, { runValidators: true })).matchedCount;
        // Re-read with the projection (portable across MongoDB-compatible servers).
        var user = matched ? await User.findById(req.params.userId).select('-passwordHash -__v') : null;
        if (!user) throw new HttpError(404, 'User not found');

        res.json({ success: true, user });
    } catch (err) { next(err); }
}

/**
 * POST /api/admin/users/:userId/deactivate
 * Soft-delete a user account (sets isActive = false).
 */
async function deactivateUser(req, res, next) {
    try {
        if (req.user && req.params.userId === String(req.user.id)) {
            throw new HttpError(409, 'An admin cannot deactivate their own account');
        }
        var matched = (await User.updateOne({ _id: req.params.userId }, { $set: { isActive: false } })).matchedCount;
        // Re-read with the projection (portable across MongoDB-compatible servers).
        var user = matched ? await User.findById(req.params.userId).select('-passwordHash -__v') : null;
        if (!user) throw new HttpError(404, 'User not found');
        res.json({ success: true, user });
    } catch (err) { next(err); }
}

/**
 * POST /api/admin/users/:userId/activate
 * Re-activate a previously deactivated user account.
 */
async function activateUser(req, res, next) {
    try {
        var matched = (await User.updateOne({ _id: req.params.userId }, { $set: { isActive: true, failedLoginAttempts: 0 }, $unset: { lockedUntil: 1 } })).matchedCount;
        // Re-read with the projection (portable across MongoDB-compatible servers).
        var user = matched ? await User.findById(req.params.userId).select('-passwordHash -__v') : null;
        if (!user) throw new HttpError(404, 'User not found');
        res.json({ success: true, user });
    } catch (err) { next(err); }
}

/**
 * GET /api/admin/stats
 * System-wide counts for the admin dashboard.
 */
async function stats(req, res, next) {
    try {
        var { Parcel, Transfer, Dispute } = require('../models');
        var [
            totalUsers, activeUsers, roleBreakdown,
            totalParcels, pendingTransfers, openDisputes,
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ isActive: true }),
            User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
            Parcel.countDocuments(),
            Transfer.countDocuments({ status: { $in: ['PENDING_OWNER', 'PENDING_KYC', 'PENDING_NOTARY', 'PENDING_OFFICER'] } }),
            Dispute.countDocuments({ status: { $in: ['OPEN', 'UNDER_REVIEW', 'ESCALATED'] } }),
        ]);

        var roles = {};
        roleBreakdown.forEach(function(r) { roles[r._id] = r.count; });

        res.json({
            users: { total: totalUsers, active: activeUsers, byRole: roles },
            parcels: { total: totalParcels },
            transfers: { pending: pendingTransfers },
            disputes: { open: openDisputes },
        });
    } catch (err) { next(err); }
}

module.exports = { listUsers, getUser, updateUser, deactivateUser, activateUser, stats };
