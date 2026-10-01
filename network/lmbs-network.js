#!/usr/bin/env node
/**
 * LMBS network tool — runs the 4-validator Hyperledger Besu QBFT network.
 * Works the same on Windows, macOS and Linux (plain Node.js, no bash needed).
 *
 * Usage (from the repository root):
 *   npm run network:setup          generate a NEW network (keys, genesis, allowlists, test accounts)
 *   npm run network:start          start the 4 validators and wait for blocks
 *   npm run network:status         block height, peers and process of each node
 *   npm run network:stop           stop all validators
 *   npm run network:fault-test     QBFT fault-tolerance demonstration (4 -> 3 -> 2 -> 4 validators)
 *   node network/lmbs-network.js stop-node 4 | start-node 4
 *   node network/lmbs-network.js setup --docker   (then: docker compose up -d, in network/)
 *
 * Environment:
 *   BESU_BIN   full path to the besu (or besu.bat) launcher if it is not on PATH
 *
 * Everything it creates goes to network/generated/ (git-ignored). The keys are
 * SYNTHETIC development keys for a local test chain; never reuse them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const IS_WIN = process.platform === 'win32';
const ROOT = __dirname;
const GEN = path.join(ROOT, 'generated');
const PIDS = path.join(GEN, 'pids.json');
const MODE_FILE = path.join(GEN, 'mode');
const NODES = [1, 2, 3, 4];
const rpcPort = (n) => 8544 + n;
const p2pPort = (n) => 30302 + n;

const ACCOUNT_LABELS = [
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

// ---------------------------------------------------------------- helpers

function fail(message) {
    console.error(`\nERROR: ${message}\n`);
    process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return fallback; } };
const mode = () => (fs.existsSync(MODE_FILE) ? fs.readFileSync(MODE_FILE, 'utf8').trim() : 'native');

function loadEthers() {
    try {
        return require(require.resolve('ethers', { paths: [path.join(ROOT, '..', 'blockchain')] }));
    } catch (_) {
        fail('ethers not found. Run "npm ci" inside the blockchain folder first.');
    }
    return null;
}

/** Quote an argument for cmd.exe when we must use a shell (Windows .bat launchers). */
function q(arg) {
    return IS_WIN && /[\s"&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

function besuBin() {
    return process.env.BESU_BIN || 'besu';
}

function runBesuSync(args) {
    return spawnSync(q(besuBin()), args.map(q), { shell: IS_WIN, encoding: 'utf8', env: process.env });
}

/** Checks that Besu and a suitable Java are installed; returns the version line. */
function checkBesu() {
    const r = runBesuSync(['--version']);
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const javaMsg = /Java version must be at least (\d+) \(detected: (\d+)\)/.exec(out);
    if (javaMsg) {
        fail(`This Besu needs Java ${javaMsg[1]} but Java ${javaMsg[2]} is active.\n` +
            `Install JDK ${javaMsg[1]} and point JAVA_HOME at it (see docs/GETTING_STARTED_WINDOWS.md, "Java"),\n` +
            'or use Besu 25.9.0, which runs on Java 21.');
    }
    const version = (out.match(/besu\/v?[^\s]+/i) || [])[0];
    if (r.error || r.status !== 0 || !version) {
        fail('Besu was not found or did not start.\n' +
            '  Windows: download besu-25.9.0.zip from https://github.com/hyperledger/besu/releases, unzip it,\n' +
            '           and set BESU_BIN to ...\\besu-25.9.0\\bin\\besu.bat (or add that bin folder to PATH).\n' +
            '  macOS:   brew tap hyperledger/besu && brew install hyperledger/besu/besu\n' +
            `  Output was: ${out.trim().slice(0, 400) || (r.error && r.error.message)}`);
    }
    return version;
}

async function rpc(port, method, params = []) {
    const res = await fetch(`http://127.0.0.1:${port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(3000),
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message);
    return body.result;
}

async function blockNumber(port) {
    try { return parseInt(await rpc(port, 'eth_blockNumber'), 16); } catch (_) { return null; }
}

function isAlive(pid) {
    try { process.kill(pid, 0); return true; } catch (_) { return false; }
}

// ------------------------------------------------------------------ setup

function generateAccounts() {
    const { Wallet } = loadEthers();
    const accounts = ACCOUNT_LABELS.map(([label, role]) => {
        const w = Wallet.createRandom();
        return { label, role, address: w.address, privateKey: w.privateKey };
    });
    fs.writeFileSync(path.join(GEN, 'accounts.json'), JSON.stringify(accounts, null, 2), { mode: 0o600 });
    return accounts;
}

function setup({ docker }) {
    if (fs.existsSync(PIDS) && Object.keys(readJson(PIDS, {})).length) {
        fail('The network appears to be running. Run "npm run network:stop" first.');
    }
    const useDockerForKeys = docker && spawnSync(q(besuBin()), ['--version'], { shell: IS_WIN }).status !== 0;
    if (!useDockerForKeys) console.log(`Using ${checkBesu()}`);

    fs.rmSync(GEN, { recursive: true, force: true });
    fs.mkdirSync(GEN, { recursive: true });

    console.log('1/4  Generating synthetic development accounts');
    const accounts = generateAccounts();

    console.log('2/4  Building the QBFT genesis configuration');
    const cfg = readJson(path.join(ROOT, 'config', 'qbftConfigFile.template.json'));
    for (const a of accounts) cfg.genesis.alloc[a.address.toLowerCase().slice(2)] = { balance: '0x3635C9ADC5DEA00000' };
    fs.writeFileSync(path.join(GEN, 'qbftConfigFile.json'), JSON.stringify(cfg, null, 2));

    console.log('3/4  Generating validator keys and genesis (besu operator)');
    let r;
    if (useDockerForKeys) {
        r = spawnSync('docker', ['run', '--rm', '-v', `${GEN}:/gen`, 'hyperledger/besu:25.9.0', 'operator',
            'generate-blockchain-config', '--config-file=/gen/qbftConfigFile.json', '--to=/gen/networkFiles',
            '--private-key-file-name=key'], { encoding: 'utf8' });
    } else {
        r = runBesuSync(['operator', 'generate-blockchain-config',
            `--config-file=${path.join(GEN, 'qbftConfigFile.json')}`,
            `--to=${path.join(GEN, 'networkFiles')}`, '--private-key-file-name=key']);
    }
    const genesis = path.join(GEN, 'networkFiles', 'genesis.json');
    if (!fs.existsSync(genesis)) fail(`Key generation failed:\n${(r.stdout || '') + (r.stderr || '')}`);
    fs.copyFileSync(genesis, path.join(GEN, 'genesis.json'));

    const keyDirs = fs.readdirSync(path.join(GEN, 'networkFiles', 'keys')).sort();
    const enodes = keyDirs.map((dir, i) => {
        const n = i + 1;
        const nodeDir = path.join(GEN, `node${n}`);
        fs.mkdirSync(path.join(nodeDir, 'data'), { recursive: true });
        for (const f of ['key', 'key.pub']) fs.copyFileSync(path.join(GEN, 'networkFiles', 'keys', dir, f), path.join(nodeDir, f));
        fs.writeFileSync(path.join(nodeDir, 'validator-address'), dir);
        const pub = fs.readFileSync(path.join(nodeDir, 'key.pub'), 'utf8').trim().replace(/^0x/, '');
        const host = docker ? `172.16.239.${10 + n}` : '127.0.0.1';
        return `enode://${pub}@${host}:${docker ? 30303 : p2pPort(n)}`;
    });
    fs.writeFileSync(path.join(GEN, 'enodes.txt'), enodes.join('\n') + '\n');

    console.log('4/4  Writing node and account allowlists');
    const list = (xs) => xs.map((x) => `  ${JSON.stringify(x)}`).join(',\n');
    fs.writeFileSync(path.join(GEN, 'permissions_config.toml'),
        '# Only these nodes may peer and only these accounts may send transactions.\n' +
        `nodes-allowlist=[\n${list(enodes)}\n]\n\naccounts-allowlist=[\n${list(accounts.map((a) => a.address))}\n]\n`);
    fs.writeFileSync(MODE_FILE, docker ? 'docker' : 'native');

    console.log('\nNetwork created in network/generated. Validators:');
    keyDirs.forEach((a, i) => console.log(`  node${i + 1}  ${a}`));
    console.log(docker ? '\nNext: cd network && docker compose up -d' : '\nNext: npm run network:start');
}

// ------------------------------------------------------------ start / stop

function nodeArgs(n) {
    const enodes = fs.readFileSync(path.join(GEN, 'enodes.txt'), 'utf8').trim().split(/\r?\n/);
    const perm = path.join(GEN, 'permissions_config.toml');
    const args = [
        `--data-path=${path.join(GEN, `node${n}`, 'data')}`,
        `--genesis-file=${path.join(GEN, 'genesis.json')}`,
        `--node-private-key-file=${path.join(GEN, `node${n}`, 'key')}`,
        '--sync-mode=FULL',
        '--p2p-host=127.0.0.1', `--p2p-port=${p2pPort(n)}`,
        '--rpc-http-enabled', '--rpc-http-host=127.0.0.1', `--rpc-http-port=${rpcPort(n)}`,
        '--rpc-http-api=ETH,NET,QBFT,WEB3,TXPOOL,PERM',
        '--rpc-http-cors-origins=http://localhost:3000',
        '--host-allowlist=localhost,127.0.0.1',
        '--min-gas-price=0',
        '--revert-reason-enabled',
        '--permissions-nodes-config-file-enabled',
        '--permissions-accounts-config-file-enabled',
        `--permissions-nodes-config-file=${perm}`,
        `--permissions-accounts-config-file=${perm}`,
        '--logging=INFO',
    ];
    if (n !== 1) args.push(`--bootnodes=${enodes[0]}`);
    return args;
}

function startNode(n) {
    if (mode() === 'docker') return dockerCompose(['start', `node${n}`]);
    if (!fs.existsSync(path.join(GEN, 'genesis.json'))) fail('No network yet. Run "npm run network:setup" first.');
    const pids = readJson(PIDS, {});
    if (pids[n] && isAlive(pids[n])) { console.log(`node${n} already running (pid ${pids[n]})`); return; }
    fs.mkdirSync(path.join(GEN, 'logs'), { recursive: true });
    const log = fs.openSync(path.join(GEN, 'logs', `node${n}.log`), 'a');
    const child = spawn(q(besuBin()), nodeArgs(n).map(q), {
        shell: IS_WIN, detached: true, windowsHide: true, stdio: ['ignore', log, log], env: process.env,
    });
    child.unref();
    pids[n] = child.pid;
    fs.writeFileSync(PIDS, JSON.stringify(pids, null, 2));
    console.log(`node${n} started (pid ${child.pid}, rpc http://127.0.0.1:${rpcPort(n)}, log network/generated/logs/node${n}.log)`);
}

function stopNode(n) {
    if (mode() === 'docker') return dockerCompose(['stop', `node${n}`]);
    const pids = readJson(PIDS, {});
    const pid = pids[n];
    if (!pid) { console.log(`node${n} is not running`); return; }
    if (IS_WIN) {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
        try { process.kill(-pid, 'SIGTERM'); } catch (_) { try { process.kill(pid, 'SIGTERM'); } catch (__) { /* gone */ } }
    }
    delete pids[n];
    fs.writeFileSync(PIDS, JSON.stringify(pids, null, 2));
    console.log(`node${n} stopped`);
}

function dockerCompose(args) {
    const r = spawnSync('docker', ['compose', ...args], { cwd: ROOT, stdio: 'inherit' });
    if (r.status !== 0) fail(`docker compose ${args.join(' ')} failed`);
}

async function start() {
    if (mode() === 'docker') dockerCompose(['up', '-d']);
    else {
        checkBesu();
        NODES.forEach(startNode);
    }
    process.stdout.write('Waiting for new blocks (Besu takes 20-90 s to start) ');
    let first = null;
    for (let i = 0; i < 120; i++) {
        const bn = await blockNumber(rpcPort(1));
        if (bn !== null && first === null) first = bn;
        if (bn !== null && bn > first) { console.log(`\nProducing blocks (block ${bn}). RPC: http://127.0.0.1:8545`); return; }
        process.stdout.write('.');
        await sleep(2000);
    }
    fail('Nodes started but no new blocks after 4 minutes. Check network/generated/logs/node1.log');
}

function stop() {
    if (mode() === 'docker') { dockerCompose(['stop']); return; }
    NODES.forEach(stopNode);
}

async function status() {
    const pids = readJson(PIDS, {});
    for (const n of NODES) {
        const bn = await blockNumber(rpcPort(n));
        let peers = '-';
        try { peers = parseInt(await rpc(rpcPort(n), 'net_peerCount'), 16); } catch (_) { /* down */ }
        const proc = mode() === 'docker' ? 'docker' : pids[n] ? `pid ${pids[n]}${isAlive(pids[n]) ? '' : ' (dead)'}` : 'stopped';
        console.log(`node${n}  rpc :${rpcPort(n)}  ${bn === null ? 'not responding' : `block ${bn}`}  peers ${peers}  ${proc}`);
    }
}

// --------------------------------------------------------- fault tolerance

async function faultTest() {
    const WAIT = Number(process.env.WAIT || 16) * 1000;
    const lines = [];
    const say = (s) => { console.log(s); lines.push(s); };
    const measure = async () => {
        const a = await blockNumber(8545);
        await sleep(WAIT);
        const b = await blockNumber(8545);
        say(`   node1 block ${a} -> ${b} over ${WAIT / 1000}s (+${b - a})`);
        return b - a;
    };

    say(`QBFT fault-tolerance demo  ${new Date().toISOString()}`);
    try { say(`Validators: ${(await rpc(8545, 'qbft_getValidatorsByBlockNumber', ['latest'])).join(', ')}`); } catch (_) { /* optional */ }
    say('Step 1: all four validators running');
    const d1 = await measure();
    stopNode(4);
    say('Step 2: node4 stopped (3 of 4 running, quorum = 3)');
    const d2 = await measure();
    stopNode(3);
    say('Step 3: node3 also stopped (2 of 4 running, below quorum)');
    const d3 = await measure();
    startNode(3); startNode(4);
    say('Step 4: node3 and node4 restarted (waiting for start-up and QBFT round change)');
    const t0 = Date.now();
    const base = await blockNumber(8545);
    let d4 = 0;
    while (Date.now() - t0 < 240000) {
        await sleep(5000);
        const now = await blockNumber(8545);
        if (now !== null && now > base) { d4 = now - base; break; }
    }
    say(`   block production resumed after ${Math.round((Date.now() - t0) / 1000)}s (node1 at block ${await blockNumber(8545)})`);
    say('');
    say(`RESULT  4/4: +${d1} blocks | 3/4: +${d2} blocks | 2/4: +${d3} blocks | recovered: +${d4} blocks`);
    const ok = d1 > 0 && d2 > 0 && d3 === 0 && d4 > 0;
    say(ok ? 'PASS: tolerates one stopped validator; halts safely below quorum; recovers when quorum returns.'
        : 'CHECK: unexpected result, inspect network/generated/logs/');
    const file = path.join(GEN, `fault-tolerance-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    console.log(`Log: ${path.relative(path.join(ROOT, '..'), file)}`);
    if (!ok) process.exitCode = 1;
}

// ------------------------------------------------------------------- main

async function main() {
    const [cmd, arg] = process.argv.slice(2);
    switch (cmd) {
    case 'setup': return setup({ docker: process.argv.includes('--docker') });
    case 'start': return start();
    case 'stop': return stop();
    case 'status': return status();
    case 'start-node': return startNode(Number(arg));
    case 'stop-node': return stopNode(Number(arg));
    case 'fault-test': return faultTest();
    default:
        console.log('Usage: node network/lmbs-network.js <setup [--docker] | start | stop | status | start-node N | stop-node N | fault-test>');
        process.exitCode = cmd ? 1 : 0;
    }
    return undefined;
}

main().catch((e) => fail(e.stack || e.message));
