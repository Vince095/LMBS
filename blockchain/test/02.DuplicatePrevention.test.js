const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture, registerTitle, h, PARCEL, STATUS } = require('./fixtures');

describe('2. Duplicate prevention', function () {
    it('rejects a second request for the same canonical parcel while the first is PENDING', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, registrar, alice, bob } = f;
        await registry.connect(registrar).submitRegistration('13283-001', alice.address, h('s1'), h('d1'));
        const key = await registry.parcelKeyOf('13283-001');
        expect((await registry.parcelRecord(key)).state).to.equal(PARCEL.RESERVED);

        for (const variant of ['13283-001', ' 13283 - 001', '13283-001\n']) {
            await expect(registry.connect(registrar).submitRegistration(variant, bob.address, h('s2'), h('d2')))
                .to.be.revertedWithCustomError(registry, 'ParcelUnavailable')
                .withArgs(key, PARCEL.RESERVED);
        }
        // Bob applying himself is also refused.
        await expect(registry.connect(bob).submitRegistration('13283-001', bob.address, h('s2'), h('d2')))
            .to.be.revertedWithCustomError(registry, 'ParcelUnavailable');
        expect(await registry.requestCount()).to.equal(1n);
    });

    it('rejects a request while the first one is APPROVED but not yet executed', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, registrar, alice, bob, disputeOfficer, approvers } = f;
        await registry.connect(registrar).submitRegistration('13283-002', alice.address, h('s'), h('d'));
        const key = await registry.parcelKeyOf('13283-002');
        await f.disputes.connect(disputeOfficer).openDispute(key, h('claim'));
        // A dispute also blocks new requests, so close it after approval to test the APPROVED window.
        for (let i = 0; i < 3; i++) await registry.connect(approvers[i]).approveRequest(1);
        expect((await registry.getRequest(1)).status).to.equal(STATUS.APPROVED);
        await f.disputes.connect(disputeOfficer).closeDispute(1, h('dismissed'), true);
        await expect(registry.connect(registrar).submitRegistration('13283-002', bob.address, h('s'), h('d')))
            .to.be.revertedWithCustomError(registry, 'ParcelUnavailable');
    });

    it('rejects registration of an already registered parcel', async function () {
        const f = await loadFixture(deployFixture);
        await registerTitle(f, '13283-003', f.alice);
        const key = await f.registry.parcelKeyOf('13283-003');
        await expect(f.registry.connect(f.registrar).submitRegistration('13283-003', f.bob.address, h('s'), h('d')))
            .to.be.revertedWithCustomError(f.registry, 'ParcelUnavailable')
            .withArgs(key, PARCEL.REGISTERED);
    });

    it('releases the reservation after a valid rejection so a correct request can proceed', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, registrar, alice, bob, laa, survey } = f;
        await registry.connect(registrar).submitRegistration('13283-004', alice.address, h('s'), h('d'));
        const key = await registry.parcelKeyOf('13283-004');
        await registry.connect(laa).rejectRequest(1, h('survey mismatch'));
        await expect(registry.connect(survey).rejectRequest(1, h('survey mismatch')))
            .to.emit(registry, 'ParcelReleased').withArgs(key, 1n);
        expect((await registry.getRequest(1)).status).to.equal(STATUS.REJECTED);
        expect((await registry.parcelRecord(key)).state).to.equal(PARCEL.AVAILABLE);

        await expect(registry.connect(registrar).submitRegistration('13283-004', bob.address, h('s2'), h('d2')))
            .to.emit(registry, 'ParcelReserved');
    });

    it('releases the reservation when the submitter cancels', async function () {
        const f = await loadFixture(deployFixture);
        const { registry, registrar, alice, outsider } = f;
        await registry.connect(registrar).submitRegistration('13283-005', alice.address, h('s'), h('d'));
        await expect(registry.connect(outsider).cancel(1)).to.be.revertedWithCustomError(registry, 'NotSubmitter');
        await registry.connect(registrar).cancel(1);
        const key = await registry.parcelKeyOf('13283-005');
        expect((await registry.parcelRecord(key)).state).to.equal(PARCEL.AVAILABLE);
        await expect(registry.connect(registrar).cancel(1)).to.be.revertedWithCustomError(registry, 'RequestClosed');
    });
});
