const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture, registerTitle, h } = require('./fixtures');

async function withTitle() {
    const f = await deployFixture();
    const t = await registerTitle(f, '60000-001', f.alice);
    return { ...f, ...t };
}

describe('5. Direct-transfer bypass', function () {
    it('transferFrom and both safeTransferFrom overloads are rejected outside the workflow', async function () {
        const { registry, alice, bob, tokenId } = await loadFixture(withTitle);
        await expect(registry.connect(alice).transferFrom(alice.address, bob.address, tokenId))
            .to.be.revertedWithCustomError(registry, 'DirectTransferDisabled');
        await expect(registry.connect(alice)['safeTransferFrom(address,address,uint256)'](alice.address, bob.address, tokenId))
            .to.be.revertedWithCustomError(registry, 'DirectTransferDisabled');
        await expect(registry.connect(alice)['safeTransferFrom(address,address,uint256,bytes)'](alice.address, bob.address, tokenId, '0x'))
            .to.be.revertedWithCustomError(registry, 'DirectTransferDisabled');
        expect(await registry.ownerOf(tokenId)).to.equal(alice.address);
    });

    it('operator approvals cannot be granted', async function () {
        const { registry, alice, bob, tokenId } = await loadFixture(withTitle);
        await expect(registry.connect(alice).approve(bob.address, tokenId)).to.be.revertedWithCustomError(registry, 'DirectTransferDisabled');
        await expect(registry.connect(alice).setApprovalForAll(bob.address, true)).to.be.revertedWithCustomError(registry, 'DirectTransferDisabled');
    });

    it('blocking direct transfers does not block the authorised internal transfer', async function () {
        const f = await loadFixture(withTitle);
        const { registry, alice, bob, approvers, tokenId } = f;
        await expect(registry.connect(alice).transferFrom(alice.address, bob.address, tokenId)).to.be.reverted;
        await registry.connect(alice).submitTransfer(tokenId, bob.address, h('sale'));
        for (let i = 0; i < 3; i++) await registry.connect(approvers[i]).approveRequest(2);
        expect(await registry.ownerOf(tokenId)).to.equal(bob.address);
    });
});
