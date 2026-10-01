/**
 * Full-stack end-to-end check: REST API + MongoDB + Besu QBFT + indexer.
 *
 * Plays every role with the SYNTHETIC development wallets from
 * network/generated/accounts.json (standing in for MetaMask / institutional
 * wallets). Nothing is mocked: documents are encrypted and stored, requests
 * are submitted and approved on-chain, and the indexer projects the result.
 *
 * Prerequisites: Besu network running, contracts deployed (npm run deploy:besu
 * in blockchain/), backend running (npm start), an ADMIN created with
 * scripts/create-admin.js using ADMIN_EMAIL / ADMIN_PASSWORD below.
 *
 *   npm run e2e -- --email admin@laa.test --password "..."   (or ADMIN_EMAIL / ADMIN_PASSWORD)
 */
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { arg } = require('./args');

const API = process.env.API_BASE || 'http://localhost:5000';
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
const ROOT = path.join(__dirname, '..', '..');
const accounts = JSON.parse(fs.readFileSync(path.join(ROOT, 'network', 'generated', 'accounts.json'), 'utf8'));
const dep = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'chain', 'deployment.besu.json'), 'utf8'));
const abis = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'chain', 'abis.json'), 'utf8'));

const provider = new ethers.JsonRpcProvider(RPC, dep.chainId, { staticNetwork: true });
const wallet = (label) => new ethers.Wallet(accounts.find((a) => a.label === label).privateKey, provider);
const registryAs = (w) => new ethers.Contract(dep.contracts.LandRegistry, abis.LandRegistry, w);
const identitiesAs = (w) => new ethers.Contract(dep.contracts.IdentityRegistry, abis.IdentityRegistry, w);

const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

async function api(method, p, { token, body } = {}) {
    const res = await fetch(API + p, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* empty */ }
    return { status: res.status, data };
}

async function signup(name, email) {
    const password = 'synthetic-passphrase-1';
    let r = await api('POST', '/api/auth/register', { body: { name, email, password, role: 'ADMIN' } });
    if (r.status === 409) r = await api('POST', '/api/auth/login', { body: { email, password } });
    return { ...r.data, password, email };
}

async function relogin(u) {
    const r = await api('POST', '/api/auth/login', { body: { email: u.email, password: u.password } });
    return { ...u, ...r.data };
}

async function linkWallet(u, w) {
    const ch = await api('POST', '/api/auth/wallet/challenge', { token: u.token });
    const signature = await w.signMessage(ch.data.message);
    const r = await api('POST', '/api/auth/wallet/verify', { token: u.token, body: { address: w.address, signature } });
    return { ...u, ...r.data, status: r.status };
}

async function upload(u, text, type, parcelPin) {
    const r = await api('POST', '/api/documents', { token: u.token, body: {
        contentBase64: Buffer.from(text).toString('base64'), name: `${type.toLowerCase()}.txt`, type, mimeType: 'text/plain', parcelPin,
    } });
    return r.data;
}

async function waitFor(fn, label, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const v = await fn();
        if (v) return v;
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Timed out waiting for ${label}`);
}

/** Re-runs: free the synthetic dev wallets from accounts created by earlier E2E runs. */
async function releaseDevWallets() {
    if ((process.env.NODE_ENV || '') === 'production') throw new Error('Refusing to run the E2E harness in production');
    const mongoose = require('mongoose');
    const env = require('../config/env');
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
    const addrs = accounts.map((a) => a.address.toLowerCase());
    await mongoose.connection.db.collection('users').updateMany(
        { address: { $in: addrs }, email: /@example\.test$/ },
        { $unset: { address: '' }, $set: { walletVerified: false } },
    );
    await mongoose.disconnect();
}

async function main() {
    await releaseDevWallets();
    const tag = Date.now().toString(36).toUpperCase();
    const pin = `E2E-${tag}-001`;

    // ---- accounts -------------------------------------------------------
    const admin = (await api('POST', '/api/auth/login', { body: { email: arg('email', 'ADMIN_EMAIL'), password: arg('password', 'ADMIN_PASSWORD') } })).data;
    check('admin can log in', admin && admin.token);

    let registrar = await signup('Synthetic Registrar', `registrar-${tag}@example.test`);
    let issuer = await signup('Synthetic KYC Officer', `issuer-${tag}@example.test`);
    let alice = await signup('Synthetic Alice', `alice-${tag}@example.test`);
    let dave = await signup('Synthetic Dave', `dave-${tag}@example.test`);
    check('self-registration ignores a requested ADMIN role', registrar.user.role === 'CITIZEN');

    for (const u of [registrar, issuer]) {
        const r = await api('PUT', `/api/admin/users/${u.user.id}`, { token: admin.token, body: { role: 'REGISTRY_OFFICER' } });
        check(`admin assigns REGISTRY_OFFICER to ${u.user.name}`, r.status === 200);
    }
    registrar = await relogin(registrar);
    issuer = await relogin(issuer);

    // ---- wallets --------------------------------------------------------
    const wReg = wallet('registrar');
    const wIssuer = wallet('identity-issuer');
    const wAlice = wallet('citizen-alice');
    const wDave = ethers.Wallet.createRandom().connect(provider); // new citizen, identity not yet anchored
    registrar = await linkWallet(registrar, wReg);
    issuer = await linkWallet(issuer, wIssuer);
    alice = await linkWallet(alice, wAlice);
    dave = await linkWallet(dave, wDave);
    check('wallets linked by signed challenge', [registrar, issuer, alice, dave].every((u) => u.status === 200 && u.user.walletVerified));

    const stolen = await linkWallet(await signup('Synthetic Mallory', `mallory-${tag}@example.test`), wAlice);
    check('a wallet already linked to another account cannot be claimed', stolen.status === 409);

    // ---- identity anchoring (hashes only) --------------------------------
    const anchor = await api('GET', `/api/chain/identity-anchor/${dave.user.id}`, { token: issuer.token });
    check('identity anchor contains no personal data', anchor.status === 200 && !JSON.stringify(anchor.data).includes('Dave'));
    await (await identitiesAs(wIssuer).register(anchor.data.account, anchor.data.subjectId, anchor.data.credentialHash, anchor.data.issuerRef)).wait();
    check('issuer anchored the new citizen identity on-chain', await identitiesAs(wIssuer).isVerified(wDave.address));

    // ---- registration ---------------------------------------------------
    const survey = await upload(registrar, `Survey plan for ${pin} (synthetic)`, 'SURVEY_PLAN', pin);
    const lease = await upload(registrar, `Lease for ${pin} (synthetic)`, 'TITLE_DEED', pin);
    check('documents stored encrypted, hashes returned', survey.documentHash && lease.documentHash);

    const regTx = await (await registryAs(wReg).submitRegistration(pin, wAlice.address, survey.documentHash, lease.documentHash)).wait();
    let r = await api('POST', '/api/titles', { token: registrar.token, body: { parcelNumber: pin, chainTxHash: regTx.hash, district: 'Berea', areaM2: 900, landUse: 'RESIDENTIAL' } });
    check('backend records registration only after verifying the on-chain tx', r.status === 201 && r.data.parcel.status === 'PENDING_APPROVAL', `status ${r.status}`);

    r = await api('POST', '/api/titles', { token: alice.token, body: { parcelNumber: pin, chainTxHash: regTx.hash } });
    check('another user cannot claim someone else\'s submission', r.status === 403);

    r = await api('POST', '/api/titles', { token: registrar.token, body: { parcelNumber: pin, chainTxHash: '0x' + 'ab'.repeat(32) } });
    check('a fabricated transaction hash is rejected', r.status === 409 || r.status === 422, `status ${r.status}`);

    const regId = (await registryAs(wReg).requestCount());
    for (const label of ['approver-laa', 'approver-survey', 'approver-deeds']) {
        await (await registryAs(wallet(label)).approveRequest(regId)).wait();
    }
    const deed = await waitFor(async () => {
        const t = await api('GET', `/api/titles/${pin}`, { token: alice.token });
        return t.data && t.data.deed && t.data.deed.status === 'ACTIVE' ? t.data : null;
    }, 'indexer to activate the deed');
    check('indexer activated parcel and deed after on-chain execution', deed.status === 'ACTIVE' && deed.deed.anchored === true);

    // Metadata posted AFTER the chain already executed the request must not regress it.
    const pin2 = `E2E-${tag}-002`;
    const survey2 = await upload(registrar, `Survey plan for ${pin2} (synthetic)`, 'SURVEY_PLAN', pin2);
    const reg2 = await (await registryAs(wReg).submitRegistration(pin2, wAlice.address, survey2.documentHash, survey2.documentHash)).wait();
    const reg2Id = await registryAs(wReg).requestCount();
    for (const label of ['approver-laa', 'approver-deeds', 'approver-ministry']) {
        await (await registryAs(wallet(label)).approveRequest(reg2Id)).wait();
    }
    await waitFor(async () => {
        const q = await api('GET', `/api/chain/requests/${reg2Id}`, { token: alice.token });
        return q.data && q.data.indexed && q.data.indexed.status === 'EXECUTED';
    }, 'indexer to see the second execution');
    r = await api('POST', '/api/titles', { token: registrar.token, body: { parcelNumber: pin2, chainTxHash: reg2.hash, district: 'Leribe' } });
    const late = await api('GET', `/api/titles/${pin2}`, { token: alice.token });
    check('late metadata does not regress an executed registration', r.status === 201 && late.data.status === 'ACTIVE' && late.data.deed.status === 'ACTIVE', `parcel ${late.data && late.data.status}, deed ${late.data && late.data.deed && late.data.deed.status}`);

    let cert = await api('GET', `/api/certificates/${pin}`, { token: alice.token });
    check('certificate verified against the chain (owner = alice)', cert.data.verified === true && cert.data.onChain.owner === wAlice.address.toLowerCase());

    // ---- governed transfer ----------------------------------------------
    const sale = await upload(alice, `Deed of sale ${pin} alice -> dave (synthetic)`, 'DEED_OF_SALE', pin);
    const tokenId = BigInt(await registryAs(wAlice).parcelKeyOf(pin));
    const trTx = await (await registryAs(wAlice).submitTransfer(tokenId, wDave.address, sale.documentHash)).wait();
    r = await api('POST', '/api/transfers', { token: alice.token, body: { chainTxHash: trTx.hash, considerationLSL: 250000 } });
    check('transfer metadata recorded against the verified on-chain request', r.status === 201 && r.data.status === 'PENDING_APPROVAL', `status ${r.status}`);
    const transferId = r.data.transferId;

    r = await api('POST', `/api/transfers/${transferId}/advance`, { token: registrar.token });
    check('off-chain "advance" is gone (410)', r.status === 410);

    const trId = await registryAs(wReg).requestCount();
    for (const label of ['approver-survey', 'approver-deeds', 'approver-ministry']) {
        await (await registryAs(wallet(label)).approveRequest(trId)).wait();
    }
    const done = await waitFor(async () => {
        const t = await api('GET', `/api/transfers/${transferId}`, { token: alice.token });
        return t.data && t.data.status === 'COMPLETE' ? t.data : null;
    }, 'indexer to complete the transfer');
    check('transfer COMPLETE in the read model', !!done);

    cert = await api('GET', `/api/certificates/${pin}`, { token: dave.token });
    check('certificate now shows dave as on-chain owner', cert.data.verified === true && cert.data.onChain.owner === wDave.address.toLowerCase());

    // ---- document integrity ---------------------------------------------
    const v = await api('GET', `/api/documents/${sale.docId}/verify?onChainHash=${sale.documentHash}`, { token: alice.token });
    check('stored document intact and matches on-chain hash', v.data.storageIntact && v.data.matchesChain);
    const file = path.join(__dirname, '..', process.env.DOCUMENT_STORE_DIR || 'storage/documents', `${sale.docId}.enc`);
    const bytes = fs.readFileSync(file); bytes[0] ^= 1; fs.writeFileSync(file, bytes);
    const v2 = await api('GET', `/api/documents/${sale.docId}/verify`, { token: alice.token });
    check('one modified byte in the encrypted file is detected', v2.data.storageIntact === false);

    // ---- access control ---------------------------------------------------
    r = await api('GET', '/api/documents/' + sale.docId, {});
    check('anonymous document download refused', r.status === 401);
    r = await api('GET', '/api/profiles/list', { token: dave.token });
    check('citizen cannot list user profiles', r.status === 403);

    const failed = results.filter((x) => !x.ok);
    const out = path.join(ROOT, 'blockchain', 'evidence', `e2e-full-stack-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ parcel: pin, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
    console.log(`\n${results.length - failed.length}/${results.length} checks passed. Evidence: ${path.relative(ROOT, out)}`);
    if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
