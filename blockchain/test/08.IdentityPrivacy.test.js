const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { deployFixture, h } = require('./fixtures');

describe('9. Identity: no raw personal data on-chain', function () {
    it('the identity ABI exposes no personal-data fields', async function () {
        const { identities } = await loadFixture(deployFixture);
        // Collect every parameter / struct-component name in the contract ABI.
        const names = new Set();
        const walk = (params) => params.forEach((p) => { names.add(p.name.toLowerCase()); if (p.components) walk(p.components); });
        identities.interface.fragments.forEach((fr) => { walk(fr.inputs || []); walk(fr.outputs || []); });
        for (const pii of ['name', 'fullname', 'email', 'phone', 'telephone', 'dateofbirth', 'dob', 'physicaladdress', 'homeaddress', 'lnid', 'nationalid']) {
            expect(names.has(pii), `ABI must not contain a "${pii}" field`).to.equal(false);
        }
        const id = await identities.getIdentity((await loadFixture(deployFixture)).alice.address);
        expect(Object.keys(id.toObject())).to.deep.equal(['subjectId', 'credentialHash', 'issuerRef', 'status', 'updatedAt']);
    });

    it('binds one pseudonymous subject to one wallet', async function () {
        const f = await loadFixture(deployFixture);
        await expect(f.identities.connect(f.issuer).register(f.outsider.address, h('subject-0'), h('c'), h('i')))
            .to.be.revertedWithCustomError(f.identities, 'SubjectAlreadyBound');
        await expect(f.identities.connect(f.issuer).register(f.alice.address, h('new-subject'), h('c'), h('i')))
            .to.be.revertedWithCustomError(f.identities, 'AlreadyRegistered');
        await expect(f.identities.connect(f.issuer).register(f.outsider.address, ethers.ZeroHash, h('c'), h('i')))
            .to.be.revertedWithCustomError(f.identities, 'InvalidInput');
    });

    it('suspension and revocation remove verified status; credential can be renewed', async function () {
        const f = await loadFixture(deployFixture);
        const { identities, issuer, alice } = f;
        expect(await identities.isVerified(alice.address)).to.equal(true);
        await identities.connect(issuer).setStatus(alice.address, 2, h('review'));
        expect(await identities.isVerified(alice.address)).to.equal(false);
        await identities.connect(issuer).setStatus(alice.address, 1, h('cleared'));
        await identities.connect(issuer).updateCredential(alice.address, h('renewed'), h('issuer:v2'));
        expect((await identities.getIdentity(alice.address)).credentialHash).to.equal(h('renewed'));
        await expect(identities.connect(issuer).setStatus(f.outsider.address, 1, h('x')))
            .to.be.revertedWithCustomError(identities, 'NotRegistered');
    });
});
