const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture, registerTitle, h, ENC_KIND } = require('./fixtures');

describe('11. Read-only views used by the dashboards', function () {
    it('pages through requests', async function () {
        const f = await loadFixture(deployFixture);
        await registerTitle(f, '11111-001', f.alice);
        await registerTitle(f, '11111-002', f.bob);
        await f.registry.connect(f.registrar).submitRegistration('11111-003', f.carol.address, h('s'), h('d'));
        expect(await f.registry.getRequests(0, 10)).to.have.length(3);
        expect(await f.registry.getRequests(2, 1)).to.have.length(1);
        expect(await f.registry.getRequests(3, 10)).to.have.length(1);
        expect(await f.registry.getRequests(4, 10)).to.have.length(0);
        expect((await f.registry.getRequests(1, 1))[0].to).to.equal(f.alice.address);
    });

    it('exposes disputes and encumbrances by id', async function () {
        const f = await loadFixture(deployFixture);
        const key = await f.registry.parcelKeyOf('11111-009');
        await f.disputes.connect(f.disputeOfficer).openDispute(key, h('claim'));
        expect(await f.disputes.disputeCount()).to.equal(1n);
        const d = await f.disputes.getDispute(1);
        expect(d.parcelKey).to.equal(key);
        expect(d.recordedBy).to.equal(f.disputeOfficer.address);
        await expect(f.disputes.getDispute(0)).to.be.revertedWithCustomError(f.disputes, 'UnknownDispute');
        await expect(f.disputes.connect(f.disputeOfficer).openDispute(ethers.ZeroHash, h('c'))).to.be.revertedWithCustomError(f.disputes, 'InvalidInput');

        await f.encumbrances.connect(f.encOfficer).register(key, ENC_KIND.MORTGAGE, h('bank'), h('bond'));
        expect(await f.encumbrances.encumbranceCount()).to.equal(1n);
        expect((await f.encumbrances.getEncumbrance(1)).kind).to.equal(ENC_KIND.MORTGAGE);
        await expect(f.encumbrances.getEncumbrance(2)).to.be.revertedWithCustomError(f.encumbrances, 'UnknownEncumbrance');
        await expect(f.encumbrances.connect(f.encOfficer).register(key, ENC_KIND.LIEN, h('x'), ethers.ZeroHash)).to.be.revertedWithCustomError(f.encumbrances, 'InvalidInput');
        await expect(f.encumbrances.connect(f.encOfficer).discharge(1, ethers.ZeroHash)).to.be.revertedWithCustomError(f.encumbrances, 'InvalidInput');
        await expect(f.disputes.connect(f.disputeOfficer).closeDispute(1, ethers.ZeroHash, false)).to.be.revertedWithCustomError(f.disputes, 'InvalidInput');
    });

    it('unknown requests and non-approved executions are refused', async function () {
        const f = await loadFixture(deployFixture);
        await expect(f.registry.getRequest(1)).to.be.revertedWithCustomError(f.registry, 'UnknownRequest');
        await f.registry.connect(f.registrar).submitRegistration('11111-010', f.alice.address, h('s'), h('d'));
        await expect(f.registry.execute(1)).to.be.revertedWithCustomError(f.registry, 'RequestNotApproved');
        expect(await f.registry.domainSeparator()).to.match(/^0x[0-9a-f]{64}$/);
    });
});
