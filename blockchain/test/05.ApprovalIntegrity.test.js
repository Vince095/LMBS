const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture, signVote, h, DECISION, KIND, STATUS, VOTE_TYPES } = require('./fixtures');

async function withPendingRegistration() {
    const f = await deployFixture();
    await f.registry.connect(f.registrar).submitRegistration('70000-001', f.alice.address, h('s'), h('deed'));
    const r = await f.registry.getRequest(1);
    const APPROVER_ROLE = f.roles.APPROVER_ROLE;
    const deadline = BigInt(await time.latest()) + 3600n;
    const vote = (over = {}) => ({
        requestId: 1n,
        parcelKey: r.parcelKey,
        action: KIND.REGISTRATION,
        decision: DECISION.APPROVE,
        documentHash: h('deed'),
        role: APPROVER_ROLE,
        nonce: 1n,
        deadline,
        ...over,
    });
    return { ...f, vote, parcelKey: r.parcelKey };
}

describe('6. Approval integrity', function () {
    it('accepts valid EIP-712 votes relayed by anyone and executes at threshold', async function () {
        const f = await loadFixture(withPendingRegistration);
        const { registry, laa, survey, deeds, outsider, vote } = f;
        for (const [i, s] of [laa, survey, deeds].entries()) {
            const v = vote({ nonce: BigInt(i + 1) });
            const sig = await signVote(registry, s, v);
            await expect(registry.connect(outsider).submitSignedDecision(v, sig))
                .to.emit(registry, 'DecisionRecorded').withArgs(1n, s.address, DECISION.APPROVE, ethers.ZeroHash, true, i + 1, 0);
        }
        expect((await registry.getRequest(1)).status).to.equal(STATUS.EXECUTED);
    });

    it('rejects a duplicate approval from the same approver (direct and via signature)', async function () {
        const f = await loadFixture(withPendingRegistration);
        const { registry, laa, vote } = f;
        await registry.connect(laa).approveRequest(1);
        await expect(registry.connect(laa).approveRequest(1))
            .to.be.revertedWithCustomError(registry, 'AlreadyDecided').withArgs(1n, laa.address);
        const sig = await signVote(registry, laa, vote({ nonce: 9n }));
        await expect(registry.submitSignedDecision(vote({ nonce: 9n }), sig))
            .to.be.revertedWithCustomError(registry, 'AlreadyDecided');
        await expect(registry.connect(laa).rejectRequest(1, h('changed mind')))
            .to.be.revertedWithCustomError(registry, 'AlreadyDecided');
    });

    it('rejects a reused signature / nonce', async function () {
        const f = await loadFixture(withPendingRegistration);
        const { registry, registrar, alice, laa, vote } = f;
        const v = vote();
        const sig = await signVote(registry, laa, v);
        await registry.submitSignedDecision(v, sig);
        await expect(registry.submitSignedDecision(v, sig))
            .to.be.revertedWithCustomError(registry, 'NonceAlreadyUsed').withArgs(laa.address, 1n);

        // Same nonce cannot be reused on a different request either.
        await registry.connect(registrar).submitRegistration('70000-002', alice.address, h('s'), h('deed2'));
        const r2 = await registry.getRequest(2);
        const v2 = vote({ requestId: 2n, parcelKey: r2.parcelKey, documentHash: h('deed2') });
        await expect(registry.submitSignedDecision(v2, await signVote(registry, laa, v2)))
            .to.be.revertedWithCustomError(registry, 'NonceAlreadyUsed');
    });

    it('rejects an expired signature', async function () {
        const f = await loadFixture(withPendingRegistration);
        const { registry, laa, vote } = f;
        const v = vote({ deadline: BigInt(await time.latest()) + 60n });
        const sig = await signVote(registry, laa, v);
        await time.increase(120);
        await expect(registry.submitSignedDecision(v, sig))
            .to.be.revertedWithCustomError(registry, 'ApprovalExpired');
    });

    it('rejects an unauthorised signer (citizen, registrar, revoked approver)', async function () {
        const f = await loadFixture(withPendingRegistration);
        const { registry, authority, governance, roles, bob, registrar, ministry, vote } = f;
        for (const s of [bob, registrar]) {
            const v = vote({ nonce: 5n });
            await expect(registry.submitSignedDecision(v, await signVote(registry, s, v)))
                .to.be.revertedWithCustomError(registry, 'Unauthorized').withArgs(s.address, roles.APPROVER_ROLE);
            await expect(registry.connect(s).approveRequest(1)).to.be.revertedWithCustomError(registry, 'Unauthorized');
        }
        await authority.connect(governance).revokeRole(roles.APPROVER_ROLE, ministry.address);
        const v = vote({ nonce: 6n });
        await expect(registry.submitSignedDecision(v, await signVote(registry, ministry, v)))
            .to.be.revertedWithCustomError(registry, 'Unauthorized');
    });

    it('rejects votes whose signed fields do not match the request, or wrong role/decision', async function () {
        const f = await loadFixture(withPendingRegistration);
        const { registry, laa, roles, vote } = f;
        const cases = [
            [vote({ documentHash: h('forged') }), 'ApprovalMismatch'],
            [vote({ parcelKey: h('other parcel') }), 'ApprovalMismatch'],
            [vote({ action: KIND.TRANSFER }), 'ApprovalMismatch'],
            [vote({ role: roles.REGISTRAR_ROLE }), 'InvalidApprovalRole'],
            [vote({ decision: 0 }), 'InvalidDecision'],
            [vote({ decision: 3 }), 'InvalidDecision'],
        ];
        let n = 20n;
        for (const [v, err] of cases) {
            v.nonce = n++;
            await expect(registry.submitSignedDecision(v, await signVote(registry, laa, v)))
                .to.be.revertedWithCustomError(registry, err);
        }
    });

    it('binds chain id and verifying contract: a signature for another domain recovers a different signer', async function () {
        const f = await loadFixture(withPendingRegistration);
        const { registry, laa, vote } = f;
        const v = vote();
        const net = await ethers.provider.getNetwork();
        const wrongChain = await laa.signTypedData(
            { name: 'LMBS LandRegistry', version: '1', chainId: net.chainId + 1n, verifyingContract: await registry.getAddress() },
            VOTE_TYPES, v);
        await expect(registry.submitSignedDecision(v, wrongChain)).to.be.revertedWithCustomError(registry, 'Unauthorized');
        const wrongContract = await laa.signTypedData(
            { name: 'LMBS LandRegistry', version: '1', chainId: net.chainId, verifyingContract: await f.identities.getAddress() },
            VOTE_TYPES, v);
        await expect(registry.submitSignedDecision(v, wrongContract)).to.be.revertedWithCustomError(registry, 'Unauthorized');
    });

    it('rejects malformed signatures', async function () {
        const f = await loadFixture(withPendingRegistration);
        await expect(f.registry.submitSignedDecision(f.vote(), '0x1234')).to.be.reverted;
    });

    it('prevents conflict of interest: submitter, seller or buyer cannot approve', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, authority, governance, roles, registrar, alice, bob, approvers } = f;
        // Give the registrar and both parties the approver role to prove the separation-of-duties rule.
        for (const a of [registrar, alice, bob]) await authority.connect(governance).grantRole(roles.APPROVER_ROLE, a.address);
        await registry.connect(registrar).submitRegistration('70000-009', alice.address, h('s'), h('d'));
        await expect(registry.connect(registrar).approveRequest(1)).to.be.revertedWithCustomError(registry, 'ConflictOfInterest');
        await expect(registry.connect(alice).approveRequest(1)).to.be.revertedWithCustomError(registry, 'ConflictOfInterest');
        for (let i = 0; i < 3; i++) await registry.connect(approvers[i]).approveRequest(1);
        const tokenId = BigInt(await registry.parcelKeyOf('70000-009'));
        await registry.connect(alice).submitTransfer(tokenId, bob.address, h('sale'));
        await expect(registry.connect(alice).approveRequest(2)).to.be.revertedWithCustomError(registry, 'ConflictOfInterest');
        await expect(registry.connect(bob).approveRequest(2)).to.be.revertedWithCustomError(registry, 'ConflictOfInterest');
    });

    it('rejection threshold closes the request; late votes are refused', async function () {
        const f = await loadFixture(withPendingRegistration);
        const { registry, laa, survey, deeds } = f;
        await registry.connect(laa).rejectRequest(1, h('reason-1'));
        await expect(registry.connect(survey).rejectRequest(1, h('reason-2'))).to.emit(registry, 'RequestRejected').withArgs(1n);
        await expect(registry.connect(deeds).approveRequest(1)).to.be.revertedWithCustomError(registry, 'RequestNotPending');
        await expect(registry.approveRequest(99)).to.be.revertedWithCustomError(registry, 'Unauthorized');
        await expect(registry.connect(deeds).approveRequest(99)).to.be.revertedWithCustomError(registry, 'UnknownRequest');
    });
});
