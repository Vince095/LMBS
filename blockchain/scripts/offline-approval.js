/**
 * Off-line EIP-712 approval: an approver signs a vote without sending a
 * transaction (e.g. on an air-gapped or hardware wallet); anyone can relay it.
 *
 * Sign:   MODE=sign  REQUEST_ID=3 SIGNER=approver-ministry DECISION=approve npx hardhat run scripts/offline-approval.js --network besu
 * Relay:  MODE=relay VOTE_FILE=evidence/vote-3-....json RELAYER=registrar       npx hardhat run scripts/offline-approval.js --network besu
 */
const fs = require('fs');
const hre = require('hardhat');
const { actors } = require('./lib/accounts');
const { loadDeployment, contracts, writeEvidence, VOTE_TYPES } = require('./lib/common');

async function main() {
    const { ethers, network } = hre;
    const dep = loadDeployment(network.name);
    const a = await actors(ethers);
    const { registry } = await contracts(ethers, dep);
    const mode = process.env.MODE || 'sign';

    if (mode === 'sign') {
        const id = BigInt(process.env.REQUEST_ID || 0);
        const signer = a[process.env.SIGNER || 'approver-ministry'];
        if (!signer) throw new Error('Unknown SIGNER label');
        const r = await registry.getRequest(id);
        const latest = await ethers.provider.getBlock('latest');
        const vote = {
            requestId: id, parcelKey: r.parcelKey, action: Number(r.kind),
            decision: (process.env.DECISION || 'approve') === 'reject' ? 2 : 1,
            documentHash: r.documentHash, role: dep.roles.APPROVER_ROLE,
            nonce: BigInt(process.env.NONCE || Date.now()),
            deadline: BigInt(latest.timestamp + Number(process.env.TTL_SECONDS || 3600)),
        };
        const domain = { ...dep.eip712, chainId: dep.chainId, verifyingContract: dep.contracts.LandRegistry };
        const signature = await signer.signTypedData(domain, VOTE_TYPES, vote);
        const file = writeEvidence(`vote-${id}`, { domain, types: VOTE_TYPES, vote, signature, signer: signer.address });
        console.log('Signed vote written to', file);
    } else {
        const doc = JSON.parse(fs.readFileSync(process.env.VOTE_FILE, 'utf8'));
        const relayer = a[process.env.RELAYER || 'registrar'];
        const receipt = await (await registry.connect(relayer).submitSignedDecision(doc.vote, doc.signature)).wait();
        console.log('Relayed in block', receipt.blockNumber, 'tx', receipt.hash);
    }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
