const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture } = require('./fixtures');

describe('10. Governance parameters', function () {
    it('thresholds must be at least 1', async function () {
        const { registry, governance } = await loadFixture(deployFixture);
        await expect(registry.connect(governance).setThresholds(0, 1)).to.be.revertedWithCustomError(registry, 'InvalidThreshold');
        await expect(registry.connect(governance).setThresholds(1, 0)).to.be.revertedWithCustomError(registry, 'InvalidThreshold');
        await expect(registry.connect(governance).setThresholds(2, 1)).to.emit(registry, 'ThresholdsUpdated').withArgs(2, 1);
    });

    it('exposes the EIP-712 domain for off-line signers', async function () {
        const { registry } = await loadFixture(deployFixture);
        const d = await registry.eip712Domain();
        expect(d.name).to.equal('LMBS LandRegistry');
        expect(d.version).to.equal('1');
        expect(d.verifyingContract).to.equal(await registry.getAddress());
    });
});
