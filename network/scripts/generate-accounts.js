/**
 * Generates SYNTHETIC development accounts for the demo network and writes
 * them to network/generated/accounts.json (git-ignored). These keys guard
 * nothing of value: they exist only on a local test chain. Never reuse them.
 */
const fs = require('fs');
const path = require('path');
const { Wallet } = require(require.resolve('ethers', { paths: [path.join(__dirname, '..', '..', 'blockchain')] }));

const LABELS = [
    ['governance', 'DEFAULT_ADMIN_ROLE (LAA governance board)'],
    ['registrar', 'REGISTRAR_ROLE (LAA registry officer)'],
    ['approver-laa', 'APPROVER_ROLE (Land Administration Authority)'],
    ['approver-survey', 'APPROVER_ROLE (Survey and Physical Planning)'],
    ['approver-deeds', 'APPROVER_ROLE (Deeds Registry)'],
    ['approver-ministry', 'APPROVER_ROLE (Ministry of Local Government)'],
    ['identity-issuer', 'IDENTITY_ISSUER_ROLE (KYC desk)'],
    ['dispute-officer', 'DISPUTE_OFFICER_ROLE'],
    ['encumbrance-officer', 'ENCUMBRANCE_OFFICER_ROLE (Deeds Registry)'],
    ['citizen-alice', 'synthetic citizen'],
    ['citizen-bob', 'synthetic citizen'],
    ['citizen-carol', 'synthetic citizen'],
];

const out = path.join(__dirname, '..', 'generated', 'accounts.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
const accounts = LABELS.map(([label, role]) => {
    const w = Wallet.createRandom();
    return { label, role, address: w.address, privateKey: w.privateKey };
});
fs.writeFileSync(out, JSON.stringify(accounts, null, 2), { mode: 0o600 });
console.log(`Wrote ${accounts.length} synthetic accounts to ${path.relative(process.cwd(), out)}`);
