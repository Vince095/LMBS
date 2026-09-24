const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
const { deployFixture, registerTitle, h, STATUS, PARCEL, KIND, APPROVAL_THRESHOLD } = require('./fixtures');

describe('1. Registration success', function () {
    it('valid request + required approvals creates exactly one title and one execution event', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, registrar, alice, laa, survey, deeds } = f;

        await expect(registry.connect(registrar).submitRegistration('13283-001', alice.address, h('survey'), h('deed')))
            .to.emit(registry, 'RequestSubmitted')
            .withArgs(1n, KIND.REGISTRATION, anyValue, anyValue, registrar.address, ethers.ZeroAddress, alice.address, h('deed'), APPROVAL_THRESHOLD);

        await registry.connect(laa).approveRequest(1);
        await registry.connect(survey).approveRequest(1);
        expect((await registry.getRequest(1)).status).to.equal(STATUS.PENDING);
        expect(await registry.balanceOf(alice.address)).to.equal(0n);

        const tx = registry.connect(deeds).approveRequest(1);
        await expect(tx).to.emit(registry, 'RequestApproved').withArgs(1n);
        await expect(tx).to.emit(registry, 'RequestExecuted');

        const receipt = await (await tx).wait();
        const executed = receipt.logs
            .map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } })
            .filter((e) => e && e.name === 'RequestExecuted');
        expect(executed).to.have.length(1);

        const key = await registry.parcelKeyOf('13283-001');
        const tokenId = BigInt(key);
        expect(await registry.ownerOf(tokenId)).to.equal(alice.address);
        expect(await registry.balanceOf(alice.address)).to.equal(1n);
        expect((await registry.getRequest(1)).status).to.equal(STATUS.EXECUTED);

        const rec = await registry.parcelRecord(key);
        expect(rec.state).to.equal(PARCEL.REGISTERED);
        expect(rec.requestId).to.equal(1n);
        expect(await registry.titleHistory(tokenId)).to.deep.equal([1n]);
        expect(await registry.titleDocumentHash(tokenId)).to.equal(h('deed'));
        expect(await registry.titleSurveyHash(tokenId)).to.equal(h('survey'));
        expect(await registry.canonicalParcelNumber(key)).to.equal('13283-001');
    });

    it('EXECUTED is set only after the mint succeeded (no premature terminal status)', async function () {
        const f = await loadFixture(deployFixture);
        const { registry } = f;
        const { requestId, tokenId } = await registerTitle(f, '10001-001', f.alice);
        const r = await registry.getRequest(requestId);
        expect(r.status).to.equal(STATUS.EXECUTED);
        expect(r.closedAt).to.be.greaterThan(0n);
        expect(await registry.ownerOf(tokenId)).to.equal(f.alice.address);
    });

    it('a verified applicant may submit for themselves; an outsider may not submit for others', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, alice, bob, outsider } = f;
        await expect(registry.connect(alice).submitRegistration('20000-001', alice.address, h('s'), h('d')))
            .to.emit(registry, 'RequestSubmitted');
        await expect(registry.connect(alice).submitRegistration('20000-002', bob.address, h('s'), h('d')))
            .to.be.revertedWithCustomError(registry, 'Unauthorized');
        await expect(registry.connect(outsider).submitRegistration('20000-003', outsider.address, h('s'), h('d')))
            .to.be.revertedWithCustomError(registry, 'PartyNotVerified');
    });

    it('rejects an unverified beneficiary and missing survey/document hashes', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, registrar, outsider, alice } = f;
        await expect(registry.connect(registrar).submitRegistration('30000-001', outsider.address, h('s'), h('d')))
            .to.be.revertedWithCustomError(registry, 'PartyNotVerified');
        await expect(registry.connect(registrar).submitRegistration('30000-001', alice.address, ethers.ZeroHash, h('d')))
            .to.be.revertedWithCustomError(registry, 'InvalidInput');
        await expect(registry.connect(registrar).submitRegistration('30000-001', alice.address, h('s'), ethers.ZeroHash))
            .to.be.revertedWithCustomError(registry, 'InvalidInput');
    });

    it('normalises parcel numbers and rejects malformed ones', async function () {
        const { registry } = await loadFixture(deployFixture);
        expect(await registry.normalizeParcelNumber('  13283 - 001 ')).to.equal('13283-001');
        expect(await registry.normalizeParcelNumber('mh/12a-7')).to.equal('MH/12A-7');
        expect(await registry.parcelKeyOf('13283-001')).to.equal(await registry.parcelKeyOf(' 13283 -001'));
        for (const bad of ['', '   ', '13283_001', '13283.001', 'ab#1', 'x'.repeat(65)]) {
            await expect(registry.normalizeParcelNumber(bad)).to.be.revertedWithCustomError(registry, 'InvalidParcelNumber');
        }
    });

    it('snapshots the approval threshold at submission time', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, registrar, governance, alice, approvers } = f;
        await registry.connect(registrar).submitRegistration('40000-001', alice.address, h('s'), h('d'));
        await registry.connect(governance).setThresholds(4, 2);
        for (let i = 0; i < 3; i++) await registry.connect(approvers[i]).approveRequest(1);
        expect((await registry.getRequest(1)).status).to.equal(3); // EXECUTED with the old threshold of 3
    });
});
