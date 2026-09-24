/**
 * Reliability run (supervisor section 8): repeat each core operation N times
 * (default 50) and report the success rate and every failure.
 *
 *   RUNS=50 npx hardhat run scripts/reliability.js --network besu
 *
 * Operations per run:
 *   A  registration: submit + 3 approvals -> title minted to the citizen
 *   B  duplicate:    re-submit the same parcel -> must be rejected
 *   C  transfer:     owner submits + 3 approvals -> ownership changes
 *   D  bypass:       direct transferFrom -> must be rejected
 */
const hre = require('hardhat');
const { actors } = require('./lib/accounts');
const { loadDeployment, contracts, expectedRevert, writeEvidence } = require('./lib/common');

async function main() {
    const { ethers, network } = hre;
    const RUNS = Number(process.env.RUNS || 50);
    const dep = loadDeployment(network.name);
    const a = await actors(ethers);
    const { registry } = await contracts(ethers, dep);
    const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
    const tag = Date.now().toString(36).toUpperCase();

    const ops = { registration: [], duplicate: [], transfer: [], bypass: [] };
    const record = (op, run, ok, detail) => { ops[op].push({ run, ok, detail }); };

    for (let i = 1; i <= RUNS; i++) {
        const parcel = `REL-${tag}-${String(i).padStart(3, '0')}`;
        const owner = a.citizens[i % 3];
        const buyer = a.citizens[(i + 1) % 3];
        let tokenId;
        try {
            await (await registry.connect(a.registrar).submitRegistration(parcel, owner.address, h(`s${i}`), h(`d${i}`))).wait();
            const id = await registry.requestCount();
            for (const ap of a.approvers.slice(0, 3)) await (await registry.connect(ap).approveRequest(id)).wait();
            tokenId = BigInt(await registry.parcelKeyOf(parcel));
            const ok = (await registry.ownerOf(tokenId)) === owner.address;
            record('registration', i, ok, ok ? 'minted' : 'owner mismatch');
        } catch (e) { record('registration', i, false, e.shortMessage || e.message); }

        const dup = await expectedRevert(registry.connect(a.registrar).submitRegistration, parcel, buyer.address, h('x'), h('y'));
        record('duplicate', i, dup === 'ParcelUnavailable', dup || 'NOT REJECTED');

        if (tokenId !== undefined) {
            const byp = await expectedRevert(registry.connect(owner).transferFrom, owner.address, buyer.address, tokenId);
            record('bypass', i, byp === 'DirectTransferDisabled', byp || 'NOT REJECTED');
            try {
                await (await registry.connect(owner).submitTransfer(tokenId, buyer.address, h(`sale${i}`))).wait();
                const id = await registry.requestCount();
                for (const ap of a.approvers.slice(1, 4)) await (await registry.connect(ap).approveRequest(id)).wait();
                const ok = (await registry.ownerOf(tokenId)) === buyer.address;
                record('transfer', i, ok, ok ? 'transferred' : 'owner mismatch');
            } catch (e) { record('transfer', i, false, e.shortMessage || e.message); }
        } else {
            record('bypass', i, false, 'skipped: registration failed');
            record('transfer', i, false, 'skipped: registration failed');
        }
        if (i % 10 === 0) console.log(`  ${i}/${RUNS} runs complete`);
    }

    const summary = Object.fromEntries(Object.entries(ops).map(([op, rs]) => {
        const ok = rs.filter((r) => r.ok).length;
        return [op, { attempts: rs.length, succeeded: ok, failed: rs.length - ok, successRate: `${((ok / rs.length) * 100).toFixed(1)}%` }];
    }));
    console.table(summary);
    const failures = Object.fromEntries(Object.entries(ops).map(([op, rs]) => [op, rs.filter((r) => !r.ok)]));
    const file = writeEvidence(`reliability-${network.name}`, { network: network.name, runs: RUNS, summary, failures });
    console.log('Evidence:', file);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
