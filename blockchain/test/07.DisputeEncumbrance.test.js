const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture, registerTitle, h, STATUS, BLOCKER, ENC_KIND } = require('./fixtures');

async function withTitle() {
    const f = await deployFixture();
    const t = await registerTitle(f, '90000-001', f.alice);
    return { ...f, ...t, key: ethers.toBeHex(t.tokenId, 32) };
}

describe('8. Disputes and encumbrances govern transfers', function () {
    it('an open dispute blocks transfer until it is lawfully resolved', async function () {
        const f = await loadFixture(withTitle);
        const { registry, disputes, disputeOfficer, alice, bob, tokenId, key } = f;
        await disputes.connect(disputeOfficer).openDispute(key, h('boundary claim'));
        await expect(registry.connect(alice).submitTransfer(tokenId, bob.address, h('sale')))
            .to.be.revertedWithCustomError(registry, 'ParcelHasOpenDispute').withArgs(key);
        await disputes.connect(disputeOfficer).closeDispute(1, h('court order 12/2026'), false);
        await expect(registry.connect(alice).submitTransfer(tokenId, bob.address, h('sale'))).to.emit(registry, 'RequestSubmitted');
    });

    for (const [name, kind] of [['mortgage', ENC_KIND.MORTGAGE], ['lien', ENC_KIND.LIEN], ['caveat', ENC_KIND.CAVEAT]]) {
        it(`an active ${name} blocks transfer until discharged`, async function () {
            const f = await loadFixture(withTitle);
            const { registry, encumbrances, encOfficer, alice, bob, tokenId, key } = f;
            await encumbrances.connect(encOfficer).register(key, kind, h('holder'), h('instrument'));
            await expect(registry.connect(alice).submitTransfer(tokenId, bob.address, h('sale')))
                .to.be.revertedWithCustomError(registry, 'ParcelEncumbered').withArgs(key);
            await encumbrances.connect(encOfficer).discharge(1, h('discharge'));
            await expect(registry.connect(alice).submitTransfer(tokenId, bob.address, h('sale'))).to.emit(registry, 'RequestSubmitted');
        });
    }

    it('a servitude does not block transfer', async function () {
        const f = await loadFixture(withTitle);
        await f.encumbrances.connect(f.encOfficer).register(f.key, ENC_KIND.SERVITUDE, h('neighbour'), h('right of way'));
        await expect(f.registry.connect(f.alice).submitTransfer(f.tokenId, f.bob.address, h('sale'))).to.emit(f.registry, 'RequestSubmitted');
    });

    it('a caveat lodged after submission defers execution; execute() succeeds after discharge', async function () {
        const f = await loadFixture(withTitle);
        const { registry, encumbrances, encOfficer, alice, bob, approvers, tokenId, key, outsider } = f;
        await registry.connect(alice).submitTransfer(tokenId, bob.address, h('sale'));
        await encumbrances.connect(encOfficer).register(key, ENC_KIND.CAVEAT, h('claimant'), h('caveat'));
        await registry.connect(approvers[0]).approveRequest(2);
        await registry.connect(approvers[1]).approveRequest(2);
        await expect(registry.connect(approvers[2]).approveRequest(2))
            .to.emit(registry, 'ExecutionDeferred').withArgs(2n, BLOCKER.BLOCKING_ENCUMBRANCE);
        expect((await registry.getRequest(2)).status).to.equal(STATUS.APPROVED);
        expect(await registry.ownerOf(tokenId)).to.equal(alice.address);
        await expect(registry.execute(2)).to.be.revertedWithCustomError(registry, 'ExecutionBlocked').withArgs(2n, BLOCKER.BLOCKING_ENCUMBRANCE);

        await encumbrances.connect(encOfficer).discharge(1, h('withdrawn'));
        await expect(registry.connect(outsider).execute(2)).to.emit(registry, 'RequestExecuted');
        expect(await registry.ownerOf(tokenId)).to.equal(bob.address);
        await expect(registry.execute(2)).to.be.revertedWithCustomError(registry, 'RequestNotApproved');
    });

    it('a dispute blocks first registration of a contested parcel', async function () {
        const f = await loadFixture(deployFixture);
        const key = await f.registry.parcelKeyOf('90000-777');
        await f.disputes.connect(f.disputeOfficer).openDispute(key, h('competing allocation'));
        await expect(f.registry.connect(f.registrar).submitRegistration('90000-777', f.alice.address, h('s'), h('d')))
            .to.be.revertedWithCustomError(f.registry, 'ParcelHasOpenDispute');
    });

    it('a suspended transferee identity defers execution', async function () {
        const f = await loadFixture(withTitle);
        const { registry, identities, issuer, alice, bob, approvers, tokenId } = f;
        await registry.connect(alice).submitTransfer(tokenId, bob.address, h('sale'));
        await identities.connect(issuer).setStatus(bob.address, 2, h('suspended'));
        await registry.connect(approvers[0]).approveRequest(2);
        await registry.connect(approvers[1]).approveRequest(2);
        await expect(registry.connect(approvers[2]).approveRequest(2))
            .to.emit(registry, 'ExecutionDeferred').withArgs(2n, BLOCKER.PARTY_NOT_VERIFIED);
    });

    it('state-change validation in the registries', async function () {
        const f = await loadFixture(withTitle);
        await expect(f.disputes.connect(f.disputeOfficer).closeDispute(1, h('x'), false)).to.be.revertedWithCustomError(f.disputes, 'UnknownDispute');
        await f.disputes.connect(f.disputeOfficer).openDispute(f.key, h('c'));
        await f.disputes.connect(f.disputeOfficer).closeDispute(1, h('x'), true);
        await expect(f.disputes.connect(f.disputeOfficer).closeDispute(1, h('x'), false)).to.be.revertedWithCustomError(f.disputes, 'DisputeNotOpen');
        await f.encumbrances.connect(f.encOfficer).register(f.key, ENC_KIND.LIEN, h('h'), h('i'));
        await f.encumbrances.connect(f.encOfficer).discharge(1, h('d'));
        await expect(f.encumbrances.connect(f.encOfficer).discharge(1, h('d'))).to.be.revertedWithCustomError(f.encumbrances, 'NotActive');
        expect(await f.encumbrances.hasBlockingEncumbrance(f.key)).to.equal(false);
    });
});
