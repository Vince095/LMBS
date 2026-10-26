/**
 * Performance benchmark (supervisor section 8): representative registration
 * and transfer workloads. Reports throughput, p50/p95/p99 latency, failure
 * rate and (for a local Besu network) node CPU / memory.
 *
 *   REQUESTS=40 CONCURRENCY=4 npx hardhat run scripts/benchmark.js --network besu
 *
 * Latency = time from sending a transaction to receiving its receipt
 * (i.e. included in a finalised QBFT block). End-to-end latency = time from
 * submitting a request to the receipt of the approval that executed it.
 *
 * This is a lightweight ethers.js harness. For the dissertation's formal
 * results Hyperledger Caliper can be pointed at the same network; see
 * docs/EVALUATION.md.
 */
const { execSync } = require('child_process');
const hre = require('hardhat');
const { actors } = require('./lib/accounts');
const { loadDeployment, contracts, writeEvidence, percentile } = require('./lib/common');

function besuResources() {
    try {
        const out = execSync("ps -eo pid,pcpu,rss,args | grep -i '[o]rg.hyperledger.besu' || true").toString().trim();
        return out.split('\n').filter(Boolean).map((l) => {
            const [pid, cpu, rss] = l.trim().split(/\s+/);
            return { pid: Number(pid), cpuPercent: Number(cpu), rssMB: Math.round(Number(rss) / 1024) };
        });
    } catch { return []; }
}

function stats(samples) {
    const s = [...samples].sort((x, y) => x - y);
    return {
        n: s.length,
        p50ms: percentile(s, 50), p95ms: percentile(s, 95), p99ms: percentile(s, 99),
        meanMs: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null,
        maxMs: s.length ? s[s.length - 1] : null,
    };
}

async function main() {
    const { ethers, network } = hre;
    const REQUESTS = Number(process.env.REQUESTS || 40);
    const CONCURRENCY = Number(process.env.CONCURRENCY || 4);
    const dep = loadDeployment(network.name);
    const a = await actors(ethers);
    const { registry } = await contracts(ethers, dep);
    const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
    const tag = `B${Date.now().toString(36).toUpperCase()}`;

    // Each sender keeps its own nonce and broadcasts in nonce order (a per-sender
    // queue), so many transactions can be in flight while receipts are awaited
    // concurrently.
    const nonces = new Map();
    const queues = new Map();
    async function send(signer, fn) {
        const addr = signer.address;
        const prev = queues.get(addr) || Promise.resolve();
        let t0;
        const sent = prev.then(async () => {
            if (!nonces.has(addr)) nonces.set(addr, await ethers.provider.getTransactionCount(addr, 'pending'));
            const nonce = nonces.get(addr);
            nonces.set(addr, nonce + 1);
            t0 = Date.now();
            return fn({ nonce });
        });
        queues.set(addr, sent.catch(() => {}));
        const tx = await sent;
        const receipt = await tx.wait();
        return { ms: Date.now() - t0, receipt };
    }
    async function pool(items, worker) {
        const results = []; let next = 0;
        await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
            while (next < items.length) { const i = next++; results[i] = await worker(items[i], i); }
        }));
        return results;
    }

    const res = { submitRegistration: [], approve: [], submitTransfer: [], endToEndRegistration: [], endToEndTransfer: [] };
    const failures = [];
    const before = besuResources();

    // Registrations are submitted by the citizens themselves (self-application), one sender per worker.
    const regs = Array.from({ length: REQUESTS }, (_, i) => ({ parcel: `${tag}-${i}`, owner: a.citizens[i % 3] }));
    const t0 = Date.now();
    await pool(regs, async (r) => {
        try {
            const start = Date.now();
            const s = await send(r.owner, (o) => registry.connect(r.owner).submitRegistration(r.parcel, r.owner.address, h('s'), h('d'), o));
            res.submitRegistration.push(s.ms);
            const ev = s.receipt.logs.map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === 'RequestSubmitted');
            r.id = ev.args.requestId;
            for (const ap of a.approvers.slice(0, 3)) {
                const x = await send(ap, (o) => registry.connect(ap).approveRequest(r.id, o));
                res.approve.push(x.ms);
            }
            res.endToEndRegistration.push(Date.now() - start);
            r.tokenId = BigInt(await registry.parcelKeyOf(r.parcel));
        } catch (e) { failures.push({ op: 'registration', parcel: r.parcel, error: e.shortMessage || e.message }); }
    });
    const regSeconds = (Date.now() - t0) / 1000;

    const t1 = Date.now();
    await pool(regs.filter((r) => r.tokenId !== undefined), async (r, i) => {
        try {
            const buyer = a.citizens[(regs.indexOf(r) + 1) % 3];
            const start = Date.now();
            const s = await send(r.owner, (o) => registry.connect(r.owner).submitTransfer(r.tokenId, buyer.address, h('sale'), o));
            res.submitTransfer.push(s.ms);
            const ev = s.receipt.logs.map((l) => { try { return registry.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === 'RequestSubmitted');
            for (const ap of a.approvers.slice(1, 4)) {
                const x = await send(ap, (o) => registry.connect(ap).approveRequest(ev.args.requestId, o));
                res.approve.push(x.ms);
            }
            res.endToEndTransfer.push(Date.now() - start);
        } catch (e) { failures.push({ op: 'transfer', parcel: r.parcel, index: i, error: e.shortMessage || e.message }); }
    });
    const trSeconds = (Date.now() - t1) / 1000;
    const after = besuResources();

    const totalTx = res.submitRegistration.length + res.submitTransfer.length + res.approve.length;
    const summary = {
        network: network.name, requests: REQUESTS, concurrency: CONCURRENCY,
        registrationPhaseSeconds: regSeconds, transferPhaseSeconds: trSeconds,
        throughputTxPerSecond: +(totalTx / (regSeconds + trSeconds)).toFixed(2),
        completedRegistrationsPerSecond: +(res.endToEndRegistration.length / regSeconds).toFixed(2),
        completedTransfersPerSecond: +(res.endToEndTransfer.length / trSeconds).toFixed(2),
        failureRate: `${((failures.length / (REQUESTS * 2)) * 100).toFixed(1)}%`,
        latency: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, stats(v)])),
        besuProcesses: { before, after },
    };
    console.log(JSON.stringify(summary, null, 2));
    const file = writeEvidence(`benchmark-${network.name}`, { summary, failures });
    console.log('Evidence:', file);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
