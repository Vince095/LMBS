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

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User } = require('../models');
const { HttpError } = require('../middleware/error');

const SALT_ROUNDS = 12;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60 * 1000;

function issueToken(user) {
    const ttlSec = (env.jwtTtlMinutes || 30) * 60;
    return jwt.sign(
        {
            sub: String(user._id),
            // The wallet address is only put in the token once it is verified.
            address: user.walletVerified ? user.address : undefined,
            walletVerified: !!user.walletVerified,
            email: user.email,
            role: user.role,
        },
        env.jwtSecret,
        { expiresIn: ttlSec, algorithm: 'HS256' },
    );
}

/**
 * Self-registration always creates a CITIZEN account. Any `role` in the
 * request is ignored: only an ADMIN can change roles (PUT /api/admin/users/:id).
 * A wallet address is NOT accepted here; it is linked later through the
 * signed-challenge flow so nobody can claim someone else's wallet.
 */
async function register({ name, email, password, district, lnid, preferredLanguage }) {
    if (!name) throw new HttpError(400, 'name is required');
    if (!email) throw new HttpError(400, 'email is required');
    if (!password || password.length < 10) throw new HttpError(400, 'password must be at least 10 characters');

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) throw new HttpError(409, 'Account already exists');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
        name,
        email: email.toLowerCase(),
        role: 'CITIZEN',
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
        return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    } catch (_) {
        return null;
    }
}

// ---------------------------------------------------------------- wallet link

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function challengeMessage(user, nonce) {
    return [
        'LMBS Land Registry - link this wallet to my account.',
        `Account: ${user._id}`,
        `Nonce: ${nonce}`,
        'Signing this message does not send a transaction or cost anything.',
    ].join('\n');
}

/** Step 1: issue a one-time challenge for the logged-in user to sign. */
async function walletChallenge(userId) {
    const user = await User.findById(userId);
    if (!user) throw new HttpError(404, 'User not found');
    const nonce = crypto.randomBytes(16).toString('hex');
    user.walletChallenge = { nonce, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) };
    await user.save();
    return { message: challengeMessage(user, nonce), expiresAt: user.walletChallenge.expiresAt };
}

/** Step 2: verify the signature; bind the recovered address to the account. */
async function walletVerify(userId, { address, signature }) {
    if (!address || !signature) throw new HttpError(400, 'address and signature are required');
    const user = await User.findById(userId);
    if (!user) throw new HttpError(404, 'User not found');
    const ch = user.walletChallenge || {};
    if (!ch.nonce || !ch.expiresAt || ch.expiresAt < new Date()) throw new HttpError(400, 'Challenge missing or expired; request a new one');

    let recovered;
    try {
        recovered = ethers.verifyMessage(challengeMessage(user, ch.nonce), signature).toLowerCase();
    } catch (_) {
        throw new HttpError(400, 'Invalid signature');
    }
    if (recovered !== String(address).toLowerCase()) throw new HttpError(401, 'Signature does not match the wallet address');

    const taken = await User.findOne({ address: recovered, _id: { $ne: user._id } }).lean();
    if (taken) throw new HttpError(409, 'This wallet is already linked to another account');

    user.address = recovered;
    user.walletVerified = true;
    user.walletVerifiedAt = new Date();
    user.walletChallenge = undefined;
    await user.save();
    return { user: user.toAuthJSON(), token: issueToken(user) };
}

module.exports = {
    register,
    login,
    changePassword,
    getCurrent,
    issueToken,
    verifyToken,
    walletChallenge,
    walletVerify,
    challengeMessage,
};
