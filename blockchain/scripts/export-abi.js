/**
 * Copies the contract ABIs (and, when given, the deployment addresses) to the
 * backend and the frontend so all three layers use the same interface.
 *
 *   node scripts/export-abi.js [deployments/besu.json]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ART = path.join(__dirname, '..', 'artifacts', 'contracts');
const CONTRACTS = {
    RoleAuthority: 'access/RoleAuthority.sol/RoleAuthority.json',
    IdentityRegistry: 'identity/IdentityRegistry.sol/IdentityRegistry.json',
    DisputeRegistry: 'constraints/DisputeRegistry.sol/DisputeRegistry.json',
    EncumbranceRegistry: 'constraints/EncumbranceRegistry.sol/EncumbranceRegistry.json',
    LandRegistry: 'registry/LandRegistry.sol/LandRegistry.json',
};
const TARGETS = [path.join(ROOT, 'backend', 'chain'), path.join(ROOT, 'src', 'chain', 'generated')];

function exportAbi(deployment) {
    const abis = {};
    for (const [name, rel] of Object.entries(CONTRACTS)) {
        abis[name] = JSON.parse(fs.readFileSync(path.join(ART, rel), 'utf8')).abi;
    }
    for (const dir of TARGETS) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'abis.json'), JSON.stringify(abis, null, 2));
        if (deployment) {
            const pub = { chainId: deployment.chainId, startBlock: deployment.startBlock, eip712: deployment.eip712, contracts: deployment.contracts, roles: deployment.roles };
            fs.writeFileSync(path.join(dir, `deployment.${deployment.network}.json`), JSON.stringify(pub, null, 2));
        }
        console.log('ABIs exported to', path.relative(ROOT, dir));
    }
}

if (require.main === module) {
    const arg = process.argv[2];
    exportAbi(arg ? JSON.parse(fs.readFileSync(arg, 'utf8')) : null);
}

module.exports = { exportAbi };
