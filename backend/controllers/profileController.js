/**
 * Profile controller — backwards-compatible with the legacy /api/profiles
 * routes while persisting through the new User Mongoose model.
 *
 * Also provides self-service profile update (PUT /api/profiles/me) for
 * authenticated users who want to edit their own profile.
 */

const { User } = require('../models');
const { HttpError } = require('../middleware/error');

// Fields a citizen/officer may edit on their own profile (not role or isActive)
const SELF_EDIT_FIELDS = ['name', 'email', 'phone', 'physicalAddress', 'district', 'preferredLanguage', 'lnid'];

async function store(req, res, next) {
    try {
        const { address, name, email, phone, physicalAddress, dateOfBirth, role, district, lnid, preferredLanguage } = req.body;
        if (!address || !name) throw new HttpError(400, 'address and name are required');

        const callerRole = (req.user && req.user.role) || 'CITIZEN';
        const update = {
            address: address.toLowerCase(),
            name, email, phone, physicalAddress, dateOfBirth,
        };
        // Only ADMIN may set role via /profiles/store
        if (role && callerRole === 'ADMIN') update.role = role;
        if (district)         update.district = district;
        if (lnid)             update.lnid = lnid;
        if (preferredLanguage) update.preferredLanguage = preferredLanguage;

        const user = await User.findOneAndUpdate(
            { address: address.toLowerCase() },
            { $set: update },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );
        res.json({ success: true, user });
    } catch (err) { next(err); }
}

/**
 * GET /api/profiles/me
 * Returns the authenticated user's own profile.
 */
async function getMe(req, res, next) {
    try {
        if (!req.user) throw new HttpError(401, 'Not authenticated');
        const profile = await User.findById(req.user.id).select('-passwordHash -__v');
        if (!profile) throw new HttpError(404, 'Profile not found');
        res.json(profile);
    } catch (err) { next(err); }
}

/**
 * PUT /api/profiles/me
 * Self-service profile update — editable fields only (no role, no isActive).
 */
async function updateMe(req, res, next) {
    try {
        if (!req.user) throw new HttpError(401, 'Not authenticated');
        const update = {};
        SELF_EDIT_FIELDS.forEach(function(f) {
            if (req.body[f] !== undefined) update[f] = req.body[f];
        });
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: update },
            { new: true, runValidators: true }
        ).select('-passwordHash -__v');
        if (!user) throw new HttpError(404, 'Profile not found');
        res.json({ success: true, user });
    } catch (err) { next(err); }
}

async function get(req, res, next) {
    try {
        const profile = await User.findOne({ address: req.params.address.toLowerCase() });
        if (!profile) throw new HttpError(404, 'Profile not found');
        res.json(profile);
    } catch (err) { next(err); }
}

async function listAll(req, res, next) {
    try {
        const role = req.query.role;
        const filter = role ? { role } : {};
        res.json(await User.find(filter).select('-__v').sort({ createdAt: -1 }).limit(200));
    } catch (err) { next(err); }
}

module.exports = { store, get, listAll, getMe, updateMe };
