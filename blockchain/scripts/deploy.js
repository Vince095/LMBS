/**
 * Deploy the LMBS contracts, wire the single RoleAuthority, grant the
 * institutional roles and (optionally) anchor pseudonymous identities for the
 * synthetic demo citizens.
 *
 *   npx hardhat run scripts/deploy.js --network besu
 *
 * Env:
 *   APPROVAL_THRESHOLD   (default 3)  M in M-of-N
 *   REJECTION_THRESHOLD  (default 2)
 *   ADMIN_DELAY_SECONDS  (default 0 for the prototype; use >= 86400 in production)
 *   SEED_DEMO_IDENTITIES (default 1)  register the synthetic citizens' identities
 *
 * Output: deployments/<network>.json and ABI files for backend + frontend.
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');
const { deploySystem, grant } = require('./lib/system');
const { actors } = require('./lib/accounts');
const { exportAbi } = require('./export-abi');

async function main() {
    const { ethers, network } = hre;
    const a = await actors(ethers);
    const approvalThreshold = Number(process.env.APPROVAL_THRESHOLD || 3);
    const rejectionThreshold = Number(process.env.REJECTION_THRESHOLD || 2);
    const adminDelay = Number(process.env.ADMIN_DELAY_SECONDS || 0);

    console.log(`Deploying to ${network.name} (chainId ${(await ethers.provider.getNetwork()).chainId})`);
    const startBlock = await ethers.provider.getBlockNumber();
    const sys = await deploySystem(ethers, { governance: a.governance, approvalThreshold, rejectionThreshold, adminDelay });
    const { authority, identities, disputes, encumbrances, registry, roles } = sys;

    const grants = [
        [roles.REGISTRAR_ROLE, a.registrar],
        ...a.approvers.map((s) => [roles.APPROVER_ROLE, s]),
        [roles.IDENTITY_ISSUER_ROLE, a['identity-issuer']],
        [roles.DISPUTE_OFFICER_ROLE, a['dispute-officer']],
        [roles.ENCUMBRANCE_OFFICER_ROLE, a['encumbrance-officer']],
    ];
    for (const [role, signer] of grants) await grant(authority, a.governance, role, signer.address);

    if ((process.env.SEED_DEMO_IDENTITIES || '1') === '1') {
        const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
        for (const c of a.citizens) {
            // Pseudonymous subject id only; no personal data is written on-chain.
            await (await identities.connect(a['identity-issuer']).register(
                c.address, h(`lmbs:demo-subject:${c.address.toLowerCase()}`), h(`lmbs:demo-credential:${c.address.toLowerCase()}`), h('issuer:LAA-KYC-desk'),
            )).wait();
        }
    }

    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const out = {
        network: network.name,
        chainId,
        deployedAt: new Date().toISOString(),
        startBlock,
        approvalThreshold,
        rejectionThreshold,
        eip712: { name: 'LMBS LandRegistry', version: '1' },
        contracts: {
            RoleAuthority: await authority.getAddress(),
            IdentityRegistry: await identities.getAddress(),
            DisputeRegistry: await disputes.getAddress(),
            EncumbranceRegistry: await encumbrances.getAddress(),
            LandRegistry: await registry.getAddress(),
        },
        roles,
        actors: Object.fromEntries(Object.entries(a).filter(([, v]) => v && v.address).map(([k, v]) => [k, v.address])),
    };
    const dir = path.join(__dirname, '..', 'deployments');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${network.name}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log('Deployment written to', path.relative(process.cwd(), file));
    console.table(out.contracts);
    exportAbi(out);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
