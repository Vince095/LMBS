const fs = require('fs');
const path = require('path');

function loadDeployment(networkName) {
    const file = path.join(__dirname, '..', '..', 'deployments', `${networkName}.json`);
    if (!fs.existsSync(file)) throw new Error(`No deployment for "${networkName}". Run scripts/deploy.js first.`);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function contracts(ethers, dep) {
    const c = dep.contracts;
    return {
        authority: await ethers.getContractAt('RoleAuthority', c.RoleAuthority),
        identities: await ethers.getContractAt('IdentityRegistry', c.IdentityRegistry),
        disputes: await ethers.getContractAt('DisputeRegistry', c.DisputeRegistry),
        encumbrances: await ethers.getContractAt('EncumbranceRegistry', c.EncumbranceRegistry),
        registry: await ethers.getContractAt('LandRegistry', c.LandRegistry),
    };
}

/**
 * Run a static call and return the custom-error name it reverts with, or
 * null if the call would succeed.
 */
async function expectedRevert(contractFn, ...args) {
    try {
        await contractFn.staticCall(...args);
        return null;
    } catch (e) {
        if (e.revert && e.revert.name) return e.revert.name;
        const data = e.data || (e.error && e.error.data) || (e.info && e.info.error && e.info.error.data);
        const iface = contractFn._contract ? contractFn._contract.interface : null;
        if (data && typeof data === 'string' && iface) {
            try { const parsed = iface.parseError(data); if (parsed) return parsed.name; } catch (_) { /* fall through */ }
        }
        const m = /custom error '([A-Za-z0-9_]+)\(/.exec(e.message || '') || /reverted with custom error ([A-Za-z0-9_]+)/.exec(e.message || '');
        return m ? m[1] : (e.shortMessage || e.message);
    }
}

function writeEvidence(name, data) {
    const dir = path.join(__dirname, '..', '..', 'evidence');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
    return file;
}

const VOTE_TYPES = {
    ApprovalVote: [
        { name: 'requestId', type: 'uint256' },
        { name: 'parcelKey', type: 'bytes32' },
        { name: 'action', type: 'uint8' },
        { name: 'decision', type: 'uint8' },
        { name: 'documentHash', type: 'bytes32' },
        { name: 'role', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
    ],
};

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
}

module.exports = { loadDeployment, contracts, expectedRevert, writeEvidence, VOTE_TYPES, percentile };
