/**
 * Auth service - registration, login, token issuance.
 *
 * - Passwords hashed with bcrypt (salt rounds 12).
 * - JWT signed with env.jwtSecret, expires after env.jwtTtlMinutes.
 * - Account lockout after 5 failed attempts for 15 minutes (SEC-009 / Stitch
 *   Keycloak parity).
 * - Login accepts either { email, password } or { address, password } so the
 *   same endpoint serves citizens (email) and wallet-anchored officers
 *   (EVM address).
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User } = require('../models');
const { HttpError } = require('../middleware/error');

const SALT_ROUNDS = 12;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

function ensureSecret() {
    if (!env.jwtSecret || env.jwtSecret === 'DEFAULT_JWT_SECRET_MUST_CHANGE') {
        // We let it through in dev so the app boots, but warn loudly. In
        // production the .env must override this.
        if (env.nodeEnv === 'production') {
            throw new HttpError(500, 'JWT_SECRET not configured');
        }
        // eslint-disable-next-line no-console
        console.warn('[auth] JWT_SECRET is the default placeholder - set JWT_SECRET in .env before production');
    }
}

function issueToken(user) {
    ensureSecret();
    const ttlSec = (env.jwtTtlMinutes || 30) * 60;
    return jwt.sign(
        {
            sub: String(user._id),
            address: user.address,
            email: user.email,
            role: user.role,
            lnid: user.lnid,
        },
        env.jwtSecret,
        { expiresIn: ttlSec },
    );
}

async function register({ name, email, password, address, role, district, lnid, preferredLanguage }) {
    if (!name)     throw new HttpError(400, 'name is required');
    if (!password || password.length < 8) throw new HttpError(400, 'password must be at least 8 characters');
    if (!email && !address) throw new HttpError(400, 'email or wallet address is required');

    // Determine canonical address - either supplied or derived placeholder.
    const finalAddress = (address ||
        ('0x' + Buffer.from(email || name).toString('hex').padStart(40, '0').slice(0, 40))
    ).toLowerCase();

    const exists = await User.findOne({
        $or: [
            { address: finalAddress },
            email ? { email: email.toLowerCase() } : { _id: null },
        ],
    });
    if (exists) throw new HttpError(409, 'Account already exists');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
        name,
        email: email ? email.toLowerCase() : undefined,
        address: finalAddress,
        role: role || 'CITIZEN',
        district,
        lnid,
        preferredLanguage: preferredLanguage || 'ses',
        passwordHash,
        passwordChangedAt: new Date(),
    });

    return { user: user.toAuthJSON(), token: issueToken(user) };
}

async function login({ email, address, password }) {
    if (!password) throw new HttpError(400, 'password is required');
    if (!email && !address) throw new HttpError(400, 'email or wallet address is required');

    const filter = email ? { email: email.toLowerCase() } : { address: address.toLowerCase() };
    const user = await User.findOne(filter).select('+passwordHash');

    // Generic message - never reveal whether the lookup or the password failed.
    if (!user || !user.isActive || !user.passwordHash) {
        throw new HttpError(401, 'Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
        const minutes = Math.ceil((user.lockedUntil - new Date()) / 60000);
        throw new HttpError(423, 'Account locked. Try again in ' + minutes + ' minutes.');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const update = { failedLoginAttempts: attempts };
        if (attempts >= MAX_FAILED) {
            update.lockedUntil = new Date(Date.now() + LOCK_MS);
            update.failedLoginAttempts = 0;
        }
        await User.updateOne({ _id: user._id }, { $set: update });
        throw new HttpError(401, 'Invalid credentials');
    }

    await User.updateOne(
        { _id: user._id },
        { $set: { failedLoginAttempts: 0, lastLoginAt: new Date() }, $unset: { lockedUntil: 1 } },
    );

    return { user: user.toAuthJSON(), token: issueToken(user) };
}

async function changePassword(userId, { currentPassword, newPassword }) {
    if (!newPassword || newPassword.length < 8) throw new HttpError(400, 'new password must be at least 8 characters');
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) throw new HttpError(404, 'User not found');
    const ok = user.passwordHash ? await bcrypt.compare(currentPassword || '', user.passwordHash) : false;
    if (!ok) throw new HttpError(401, 'Current password is incorrect');

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.passwordChangedAt = new Date();
    await user.save();
    return { success: true };
}

async function getCurrent(userId) {
    const user = await User.findById(userId);
    if (!user) throw new HttpError(404, 'User not found');
    return user.toAuthJSON();
}

function verifyToken(token) {
    try {
        return jwt.verify(token, env.jwtSecret);
    } catch (_) {
        return null;
    }
}

module.exports = {
    register,
    login,
    changePassword,
    getCurrent,
    issueToken,
    verifyToken,
};
