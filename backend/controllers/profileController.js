/**
 * Profile controller — reads and self-service updates (PUT /api/profiles/me)
 * of OFF-CHAIN user profiles. Personal data never goes on-chain.
 */

const { User } = require('../models');
const { HttpError } = require('../middleware/error');

// Fields a citizen/officer may edit on their own profile (not role or isActive)
const SELF_EDIT_FIELDS = ['name', 'email', 'phone', 'physicalAddress', 'district', 'preferredLanguage', 'lnid'];

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
        let matched = (await User.updateOne({ _id: req.user.id }, { $set: update }, { runValidators: true })).matchedCount;
        // Re-read with the projection (portable across MongoDB-compatible servers).
        let user = matched ? await User.findById(req.user.id).select('-passwordHash -__v') : null;
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

module.exports = { get, listAll, getMe, updateMe };
