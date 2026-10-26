const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture, registerTitle, h, ENC_KIND } = require('./fixtures');

/**
 * Matrix test: every actor attempts every restricted action. Only the actors
 * listed in `allowed` may succeed; every other attempt must revert.
 */
async function scenario() {
    const f = await deployFixture();
    await f.registry.connect(f.registrar).submitRegistration('80000-001', f.alice.address, h('s'), h('d')); // request 1 (pending)
    const { tokenId } = await registerTitle(f, '80000-002', f.alice); // request 2 (executed)
    const key = ethers.toBeHex(tokenId, 32);
    await f.disputes.connect(f.disputeOfficer).openDispute(h('other-parcel'), h('claim'));
    await f.encumbrances.connect(f.encOfficer).register(h('other-parcel'), ENC_KIND.MORTGAGE, h('bank'), h('bond'));
    return { ...f, key, tokenId };
}

const ACTORS = ['governance', 'registrar', 'laa', 'issuer', 'disputeOfficer', 'encOfficer', 'alice', 'outsider'];

const ACTIONS = [
    { name: 'grant a role', allowed: ['governance'],
      run: (f, s) => f.authority.connect(s).grantRole(f.roles.APPROVER_ROLE, f.outsider.address) },
    { name: 'revoke a role', allowed: ['governance'],
      run: (f, s) => f.authority.connect(s).revokeRole(f.roles.APPROVER_ROLE, f.ministry.address) },
    { name: 'change approval thresholds', allowed: ['governance'],
      run: (f, s) => f.registry.connect(s).setThresholds(2, 2) },
    { name: 'submit registration for another person', allowed: ['registrar'],
      run: (f, s) => f.registry.connect(s).submitRegistration('80000-009', f.bob.address, h('s'), h('d')) },
    { name: 'approve a request', allowed: ['laa'],
      run: (f, s) => f.registry.connect(s).approveRequest(1) },
    { name: 'reject a request', allowed: ['laa'],
      run: (f, s) => f.registry.connect(s).rejectRequest(1, h('r')) },
    { name: 'initiate transfer of alice\'s title', allowed: ['alice'],
      run: (f, s) => f.registry.connect(s).submitTransfer(f.tokenId, f.bob.address, h('sale')) },
    { name: 'register an identity', allowed: ['issuer'],
      run: (f, s) => f.identities.connect(s).register(f.outsider.address, h('subj-x'), h('cred-x'), h('iss')) },
    { name: 'suspend an identity', allowed: ['issuer'],
      run: (f, s) => f.identities.connect(s).setStatus(f.bob.address, 2, h('fraud check')) },
    { name: 'open a dispute', allowed: ['disputeOfficer'],
      run: (f, s) => f.disputes.connect(s).openDispute(f.key, h('claim')) },
    { name: 'close a dispute', allowed: ['disputeOfficer'],
      run: (f, s) => f.disputes.connect(s).closeDispute(1, h('outcome'), false) },
    { name: 'register an encumbrance', allowed: ['encOfficer'],
      run: (f, s) => f.encumbrances.connect(s).register(f.key, ENC_KIND.CAVEAT, h('h'), h('i')) },
    { name: 'discharge an encumbrance', allowed: ['encOfficer'],
      run: (f, s) => f.encumbrances.connect(s).discharge(1, h('paid')) },
];

describe('7. Role enforcement matrix', function () {
    for (const action of ACTIONS) {
        describe(action.name, function () {
            for (const actor of ACTORS) {
                const ok = action.allowed.includes(actor);
                it(`${actor} ${ok ? 'succeeds' : 'is rejected'}`, async function () {
                    const f = await loadFixture(scenario);
                    const p = action.run(f, f[actor]);
                    if (ok) await expect(p).not.to.be.reverted;
                    else await expect(p).to.be.reverted;
                });
            }
        });
    }

    it('there is one role authority shared by every contract', async function () {
        const f = await loadFixture(scenario);
        const a = await f.authority.getAddress();
        for (const c of [f.registry, f.identities, f.disputes, f.encumbrances]) expect(await c.authority()).to.equal(a);
        // Revoking in the authority immediately removes the permission everywhere.
        await f.authority.connect(f.governance).revokeRole(f.roles.APPROVER_ROLE, f.laa.address);
        await expect(f.registry.connect(f.laa).approveRequest(1)).to.be.revertedWithCustomError(f.registry, 'Unauthorized');
    });

    it('the default admin can only be changed by the two-step delayed process', async function () {
        const f = await loadFixture(scenario);
        await expect(f.authority.connect(f.governance).grantRole(ethers.ZeroHash, f.outsider.address)).to.be.reverted;
        await f.authority.connect(f.governance).beginDefaultAdminTransfer(f.outsider.address);
        await f.authority.connect(f.outsider).acceptDefaultAdminTransfer();
        expect(await f.authority.defaultAdmin()).to.equal(f.outsider.address);
    });
});
