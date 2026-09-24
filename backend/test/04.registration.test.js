/**
 * Registration can never escalate privileges, and wallets are bound only by
 * signature. The User model is mocked so no database is needed.
 */
jest.mock('../models', () => {
    const users = [];
    function doc(data) {
        const d = { _id: data._id || `64b0000000000000000000${String(users.length + 10).padStart(2, '0')}`, ...data };
        d.save = jest.fn(async () => d);
        d.toAuthJSON = () => ({ id: d._id, email: d.email, role: d.role, address: d.address, walletVerified: !!d.walletVerified });
        return d;
    }
    const lean = (v) => ({ lean: async () => v, select: () => ({ lean: async () => v }) });
    const User = {
        _users: users,
        create: jest.fn(async (data) => { const d = doc(data); users.push(d); return d; }),
        findOne: jest.fn((q) => {
            const hit = users.find((u) => (q.email && u.email === q.email)
                || (q.address && u.address === q.address && (!q._id || String(u._id) !== String(q._id.$ne))));
            const p = Promise.resolve(hit || null);
            p.lean = async () => hit || null;
            p.select = () => Promise.resolve(hit || null);
            return p;
        }),
        findById: jest.fn(async (id) => users.find((u) => String(u._id) === String(id)) || null),
        updateOne: jest.fn(async () => ({})),
    };
    void lean;
    return { User };
});

const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const auth = require('../services/authService');

describe('Self-registration', () => {
    test('always creates a CITIZEN, even when ADMIN is requested', async () => {
        const out = await auth.register({ name: 'Test One', email: 'one@example.test', password: 'long-enough-pw', role: 'ADMIN' });
        expect(User.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'CITIZEN' }));
        expect(out.user.role).toBe('CITIZEN');
        const claims = jwt.decode(out.token);
        expect(claims.role).toBe('CITIZEN');
        expect(claims.walletVerified).toBe(false);
        expect(claims.address).toBeUndefined();
    });

    test('ignores a wallet address supplied at registration (no unverified wallet claims)', async () => {
        await auth.register({ name: 'Two', email: 'two@example.test', password: 'long-enough-pw', address: '0x00000000000000000000000000000000000000aa' });
        const created = User.create.mock.calls.at(-1)[0];
        expect(created.address).toBeUndefined();
    });

    test.each([
        [{ name: 'x', email: 'x@example.test', password: 'short' }, /password/],
        [{ email: 'x@example.test', password: 'long-enough-pw' }, /name/],
        [{ name: 'x', password: 'long-enough-pw' }, /email/],
    ])('validates input %#', async (input, err) => {
        await expect(auth.register(input)).rejects.toThrow(err);
    });

    test('rejects a duplicate e-mail', async () => {
        await expect(auth.register({ name: 'One again', email: 'one@example.test', password: 'long-enough-pw' })).rejects.toThrow(/already exists/);
    });
});

describe('Wallet binding by signed challenge', () => {
    let user;
    beforeAll(async () => {
        await auth.register({ name: 'Wallet User', email: 'wallet@example.test', password: 'long-enough-pw' });
        user = User._users.find((u) => u.email === 'wallet@example.test');
    });

    test('binds the wallet that signed the challenge and issues a token with it', async () => {
        const wallet = ethers.Wallet.createRandom();
        const { message } = await auth.walletChallenge(user._id);
        const signature = await wallet.signMessage(message);
        const out = await auth.walletVerify(user._id, { address: wallet.address, signature });
        expect(user.address).toBe(wallet.address.toLowerCase());
        expect(user.walletVerified).toBe(true);
        const claims = jwt.decode(out.token);
        expect(claims.walletVerified).toBe(true);
        expect(claims.address).toBe(wallet.address.toLowerCase());
    });

    test('rejects a signature from a different wallet', async () => {
        const claimed = ethers.Wallet.createRandom();
        const attacker = ethers.Wallet.createRandom();
        const { message } = await auth.walletChallenge(user._id);
        await expect(auth.walletVerify(user._id, { address: claimed.address, signature: await attacker.signMessage(message) }))
            .rejects.toThrow(/does not match/);
    });

    test('a challenge can be used only once', async () => {
        const wallet = ethers.Wallet.createRandom();
        const { message } = await auth.walletChallenge(user._id);
        const signature = await wallet.signMessage(message);
        await auth.walletVerify(user._id, { address: wallet.address, signature });
        await expect(auth.walletVerify(user._id, { address: wallet.address, signature })).rejects.toThrow(/Challenge/);
    });

    test('an expired challenge is refused', async () => {
        const wallet = ethers.Wallet.createRandom();
        const { message } = await auth.walletChallenge(user._id);
        user.walletChallenge.expiresAt = new Date(Date.now() - 1000);
        await expect(auth.walletVerify(user._id, { address: wallet.address, signature: await wallet.signMessage(message) }))
            .rejects.toThrow(/expired/);
    });

    test('a wallet already linked to another account cannot be claimed', async () => {
        const other = User._users.find((u) => u.email === 'one@example.test');
        const wallet = ethers.Wallet.createRandom();
        let ch = await auth.walletChallenge(user._id);
        await auth.walletVerify(user._id, { address: wallet.address, signature: await wallet.signMessage(ch.message) });
        ch = await auth.walletChallenge(other._id);
        await expect(auth.walletVerify(other._id, { address: wallet.address, signature: await wallet.signMessage(ch.message) }))
            .rejects.toThrow(/already linked/);
    });
});
