const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture, registerTitle, h, STATUS, KIND } = require('./fixtures');

async function withTitle() {
    const f = await deployFixture();
    const t = await registerTitle(f, '50000-001', f.alice);
    return { ...f, ...t };
}

describe('3. Owner-only transfer initiation', function () {
    it('a non-owner cannot initiate a transfer of another owner\'s title', async function () {
        const f = await loadFixture(withTitle);
        await expect(f.registry.connect(f.bob).submitTransfer(f.tokenId, f.bob.address, h('sale')))
            .to.be.revertedWithCustomError(f.registry, 'NotTitleHolder').withArgs(f.bob.address, f.tokenId);
    });

    it('a validator (approver) cannot initiate a transfer of another owner\'s title', async function () {
        const f = await loadFixture(withTitle);
        await expect(f.registry.connect(f.laa).submitTransfer(f.tokenId, f.bob.address, h('sale')))
            .to.be.revertedWithCustomError(f.registry, 'NotTitleHolder');
    });

    it('the registrar and the governance account cannot initiate either', async function () {
        const f = await loadFixture(withTitle);
        for (const s of [f.registrar, f.governance]) {
            await expect(f.registry.connect(s).submitTransfer(f.tokenId, f.bob.address, h('sale')))
                .to.be.revertedWithCustomError(f.registry, 'NotTitleHolder');
        }
    });

    it('rejects transfers to unverified, zero or same address and to unknown tokens', async function () {
        const f = await loadFixture(withTitle);
        const { registry, alice, outsider, tokenId } = f;
        await expect(registry.connect(alice).submitTransfer(tokenId, outsider.address, h('x')))
            .to.be.revertedWithCustomError(registry, 'PartyNotVerified');
        await expect(registry.connect(alice).submitTransfer(tokenId, ethers.ZeroAddress, h('x')))
            .to.be.revertedWithCustomError(registry, 'InvalidInput');
        await expect(registry.connect(alice).submitTransfer(tokenId, alice.address, h('x')))
            .to.be.revertedWithCustomError(registry, 'InvalidInput');
        await expect(registry.connect(alice).submitTransfer(123n, f.bob.address, h('x')))
            .to.be.revertedWithCustomError(registry, 'ERC721NonexistentToken');
    });
});

describe('4. Governed transfer', function () {
    it('owner initiates, approvals reach threshold, ownership changes exactly once and history is recorded', async function () {
        const f = await loadFixture(withTitle);
        const { registry, alice, bob, laa, survey, deeds, ministry, tokenId } = f;

        await expect(registry.connect(alice).submitTransfer(tokenId, bob.address, h('deed-of-sale')))
            .to.emit(registry, 'RequestSubmitted')
            .withArgs(2n, KIND.TRANSFER, ethers.toBeHex(tokenId, 32), tokenId, alice.address, alice.address, bob.address, h('deed-of-sale'), 3);
        expect(await registry.activeTransferRequest(tokenId)).to.equal(2n);

        await registry.connect(laa).approveRequest(2);
        await registry.connect(survey).approveRequest(2);
        expect(await registry.ownerOf(tokenId)).to.equal(alice.address);

        await expect(registry.connect(deeds).approveRequest(2))
            .to.emit(registry, 'Transfer').withArgs(alice.address, bob.address, tokenId)
            .and.to.emit(registry, 'RequestExecuted').withArgs(2n, KIND.TRANSFER, tokenId, alice.address, bob.address);

        expect(await registry.ownerOf(tokenId)).to.equal(bob.address);
        expect(await registry.balanceOf(alice.address)).to.equal(0n);
        expect(await registry.activeTransferRequest(tokenId)).to.equal(0n);
        expect(await registry.titleHistory(tokenId)).to.deep.equal([1n, 2n]);
        expect((await registry.getRequest(2)).status).to.equal(STATUS.EXECUTED);

        // A 4th approval cannot re-execute.
        await expect(registry.connect(ministry).approveRequest(2))
            .to.be.revertedWithCustomError(registry, 'RequestNotPending');
    });

    it('only one pending transfer per title; the owner can cancel and start again', async function () {
        const f = await loadFixture(withTitle);
        const { registry, alice, bob, carol, tokenId } = f;
        await registry.connect(alice).submitTransfer(tokenId, bob.address, h('a'));
        await expect(registry.connect(alice).submitTransfer(tokenId, carol.address, h('b')))
            .to.be.revertedWithCustomError(registry, 'TransferAlreadyPending').withArgs(tokenId, 2n);
        await registry.connect(alice).cancel(2);
        expect(await registry.activeTransferRequest(tokenId)).to.equal(0n);
        await expect(registry.connect(alice).submitTransfer(tokenId, carol.address, h('b'))).to.emit(registry, 'RequestSubmitted');
    });

    it('the new owner (not the old one) controls the next transfer', async function () {
        const f = await loadFixture(withTitle);
        const { registry, alice, bob, carol, approvers, tokenId } = f;
        await registry.connect(alice).submitTransfer(tokenId, bob.address, h('a'));
        for (let i = 0; i < 3; i++) await registry.connect(approvers[i]).approveRequest(2);
        await expect(registry.connect(alice).submitTransfer(tokenId, carol.address, h('b')))
            .to.be.revertedWithCustomError(registry, 'NotTitleHolder');
        await expect(registry.connect(bob).submitTransfer(tokenId, carol.address, h('b'))).to.emit(registry, 'RequestSubmitted');
    });
});
