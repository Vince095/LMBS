/**
 * Shared deployment logic used by scripts/deploy.js AND the test fixture, so
 * the contracts under test are wired exactly as they are on Besu.
 */

const ROLE_NAMES = [
    'REGISTRAR_ROLE',
    'APPROVER_ROLE',
    'IDENTITY_ISSUER_ROLE',
    'DISPUTE_OFFICER_ROLE',
    'ENCUMBRANCE_OFFICER_ROLE',
];

async function deploySystem(ethers, { governance, approvalThreshold = 3, rejectionThreshold = 2, adminDelay = 0 }) {
    const govAddr = await governance.getAddress();

    const Authority = await ethers.getContractFactory('RoleAuthority', governance);
    const authority = await Authority.deploy(adminDelay, govAddr);
    await authority.waitForDeployment();

    const Identity = await ethers.getContractFactory('IdentityRegistry', governance);
    const identities = await Identity.deploy(await authority.getAddress());
    await identities.waitForDeployment();

    const Disputes = await ethers.getContractFactory('DisputeRegistry', governance);
    const disputes = await Disputes.deploy(await authority.getAddress());
    await disputes.waitForDeployment();

    const Encumbrances = await ethers.getContractFactory('EncumbranceRegistry', governance);
    const encumbrances = await Encumbrances.deploy(await authority.getAddress());
    await encumbrances.waitForDeployment();

    const Registry = await ethers.getContractFactory('LandRegistry', governance);
    const registry = await Registry.deploy(
        await authority.getAddress(),
        await identities.getAddress(),
        await disputes.getAddress(),
        await encumbrances.getAddress(),
        approvalThreshold,
        rejectionThreshold,
    );
    await registry.waitForDeployment();

    const roles = {};
    for (const name of ROLE_NAMES) roles[name] = await authority[name]();
    roles.DEFAULT_ADMIN_ROLE = ethers.ZeroHash;

    return { authority, identities, disputes, encumbrances, registry, roles };
}

async function grant(authority, governance, role, account) {
    const tx = await authority.connect(governance).grantRole(role, account);
    return tx.wait();
}

module.exports = { deploySystem, grant, ROLE_NAMES };
