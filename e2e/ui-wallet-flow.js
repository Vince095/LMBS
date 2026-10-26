/**
 * Browser E2E: drives the real React portal with Playwright.
 *
 * A small EIP-1193 provider is injected as window.ethereum and backed by the
 * SYNTHETIC development keys in network/generated/accounts.json. It stands in
 * for MetaMask: the portal only ever asks it to sign or send; it never sees a key.
 *
 * Flow: registrar fills the Register-parcel wizard (encrypted upload + on-chain
 * submit) -> three approvers open Approvals, connect + link their wallets and
 * approve -> the request executes on Besu and the indexer marks it ACTIVE.
 *
 * Needs: Besu + deployed contracts, backend on :5000, portal on :3000
 * (`npm start` or `npx serve -s build -l 3000`), an ADMIN (scripts/create-admin.js).
 *   npm test -- --email admin@laa.test --password "..."   (or ADMIN_EMAIL / ADMIN_PASSWORD)
 */
/* global window */ // used inside page.addInitScript (browser context)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { ethers } = require('ethers');
const { arg } = require('../backend/scripts/args');

const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.API_BASE || 'http://localhost:5000';
const RPC = process.env.RPC_URL || 'http://127.0.0.1:8545';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'blockchain', 'evidence', 'ui');
const accounts = JSON.parse(fs.readFileSync(path.join(ROOT, 'network', 'generated', 'accounts.json'), 'utf8'));
const dep = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'chain', 'deployment.besu.json'), 'utf8'));
const abis = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend', 'chain', 'abis.json'), 'utf8'));
const provider = new ethers.JsonRpcProvider(RPC, dep.chainId, { staticNetwork: true });
const key = (label) => accounts.find((a) => a.label === label).privateKey;

const results = [];
const step = (m) => console.log(`  … ${m}`);
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };

async function api(method, p, { token, body } = {}) {
    const res = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json().catch(() => null) };
}

async function portalUser(admin, name, role) {
    const email = `${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now().toString(36)}@example.test`;
    const password = 'synthetic-passphrase-1';
    const reg = await api('POST', '/api/auth/register', { body: { name, email, password } });
    if (reg.status !== 201) throw new Error(`register failed (${reg.status}): ${JSON.stringify(reg.data)}. For repeated test runs start the backend with AUTH_RATE_LIMIT=1000.`);
    if (role) await api('PUT', `/api/admin/users/${reg.data.user.id}`, { token: admin.token, body: { role } });
    return (await api('POST', '/api/auth/login', { body: { email, password } })).data;
}

/** Browser context whose window.ethereum is backed by `privateKey`. */
async function walletContext(browser, privateKey, token) {
    const wallet = new ethers.Wallet(privateKey, provider);
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
    context.setDefaultTimeout(30000);
    // Offline-friendly: skip third-party assets (styling CDN, fonts, maps) if they are unreachable.
    if (process.env.BLOCK_EXTERNAL === '1') {
        await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
    }
    await context.exposeBinding('__lmbsEth', async (_src, method, params) => {
        switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': return [wallet.address];
        case 'eth_chainId': return '0x' + Number(dep.chainId).toString(16);
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain': return null;
        case 'personal_sign': return wallet.signMessage(ethers.getBytes(params[0]));
        case 'eth_sendTransaction': {
            const t = params[0];
            const tx = await wallet.sendTransaction({ to: t.to, data: t.data, value: t.value || 0, gasLimit: t.gas || 3_000_000, gasPrice: 0 });
            return tx.hash;
        }
        default: return provider.send(method, params || []);
        }
    });
    await context.addInitScript(({ tok }) => {
        try {
            window.localStorage.setItem('lmbs.token', tok);
            window.localStorage.setItem('lmbs.lang', 'en');
        } catch (_) { /* opaque-origin frames have no storage */ }
        window.ethereum = {
            isMetaMask: false,
            request: ({ method, params }) => window.__lmbsEth(method, params),
            on: () => {}, removeListener: () => {},
        };
    }, { tok: token });
    return { context, wallet };
}

async function connectAndLink(page) {
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    const link = page.getByRole('button', { name: 'Link this wallet to my account' });
    await link.waitFor({ timeout: 20000 });
    await link.click();
    try {
        await page.getByText('Link this wallet to my account').waitFor({ state: 'detached', timeout: 20000 });
    } catch (e) {
        const alerts = await page.getByRole('alert').allInnerTexts();
        throw new Error(`Wallet link failed: ${alerts.join(' | ') || e.message}`);
    }
}

/** Re-runs: free the synthetic dev wallets from test accounts created by earlier runs (dev DB only). */
async function releaseDevWallets() {
    const backend = path.join(ROOT, 'backend');
    require(path.join(backend, 'node_modules', 'dotenv')).config({ path: path.join(backend, '.env'), quiet: true });
    if ((process.env.NODE_ENV || '') === 'production') throw new Error('Refusing to run in production');
    const mongoose = require(path.join(backend, 'node_modules', 'mongoose'));
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lmbs_db', { dbName: process.env.MONGODB_DB_NAME || 'lmbs_db' });
    await mongoose.connection.db.collection('users').updateMany(
        { address: { $in: accounts.map((a) => a.address.toLowerCase()) }, email: /@example\.test$/ },
        { $unset: { address: '' }, $set: { walletVerified: false } },
    );
    await mongoose.disconnect();
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    await releaseDevWallets();
    const admin = (await api('POST', '/api/auth/login', { body: { email: arg('email', 'ADMIN_EMAIL'), password: arg('password', 'ADMIN_PASSWORD') } })).data;
    step('launching browser');
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const pin = `UI-${Date.now().toString(36).toUpperCase()}-001`;
    const alice = accounts.find((a) => a.label === 'citizen-alice').address;

    // ---- registrar uses the wizard ----------------------------------------------
    const registrar = await portalUser(admin, 'UI Registrar', 'REGISTRY_OFFICER');
    const { context: rc } = await walletContext(browser, key('registrar'), registrar.token);
    const page = await rc.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    step('registrar opens the wizard');
    await page.goto(`${APP}/register-parcel`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('e.g. Thabo Moshoeshoe').fill('Synthetic Alice');
    await page.getByPlaceholder('0x…').fill(alice);
    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.getByPlaceholder('LSO-MAS-00001-2026-AB12').fill(pin);
    await page.locator('select').first().selectOption('Berea');
    await page.getByPlaceholder('e.g. 14250').fill('900');
    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.locator('input[type=file]').setInputFiles({ name: 'survey-plan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 synthetic survey plan ' + pin) });
    await page.locator('ul select').first().selectOption('SURVEY_PLAN');
    await page.getByRole('button', { name: 'Next Step' }).click();
    step('connect and link the registrar wallet');
    await connectAndLink(page);
    await page.screenshot({ path: path.join(OUT, '1-wizard-verify-step.png'), fullPage: true });
    step('sign and submit');
    await page.getByRole('button', { name: /Sign and Submit/ }).click();
    await page.waitForURL(new RegExp(`/property/${pin}`), { timeout: 60000 });
    check('registrar submitted the registration from the wizard (wallet-signed)', true, pin);

    const registry = new ethers.Contract(dep.contracts.LandRegistry, abis.LandRegistry, provider);
    const id = await registry.requestCount();
    const req = await registry.getRequest(id);
    check('request is PENDING on-chain for the right beneficiary', Number(req.status) === 1 && req.to === alice);

    // ---- three approvers vote in the Approvals page ------------------------------
    for (const [label, role] of [['approver-laa', 'NOTARY'], ['approver-survey', 'SURVEYOR'], ['approver-deeds', 'NOTARY']]) {
        const u = await portalUser(admin, `UI ${label}`, role);
        const { context } = await walletContext(browser, key(label), u.token);
        const p = await context.newPage();
        p.on('pageerror', (e) => pageErrors.push(e.message));
        step(`${label} opens Approvals`);
        await p.goto(`${APP}/approvals`, { waitUntil: 'domcontentloaded' });
        await connectAndLink(p);
        const row = p.locator('li', { hasText: pin }).first();
        await row.waitFor({ timeout: 30000 });
        await row.getByRole('button', { name: 'Approve' }).click();
        await p.getByText(/Recorded in block/).waitFor({ timeout: 60000 });
        if (label === 'approver-laa') await p.screenshot({ path: path.join(OUT, '2-approvals-after-first-vote.png'), fullPage: true });
        await context.close();
    }
    const after = await registry.getRequest(id);
    check('three wallet approvals executed the request on-chain', Number(after.status) === 3 && (await registry.ownerOf(BigInt(req.parcelKey))) === alice);

    // ---- indexer + property page ------------------------------------------------
    let active = false;
    for (let i = 0; i < 20 && !active; i++) {
        const t = await api('GET', `/api/titles/${pin}`, { token: registrar.token });
        active = t.data && t.data.status === 'ACTIVE' && t.data.deed && t.data.deed.status === 'ACTIVE';
        if (!active) await new Promise((r) => setTimeout(r, 2000));
    }
    check('indexer marked parcel and deed ACTIVE', active);

    await page.goto(`${APP}/registry`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Request ledger').waitFor();
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await page.locator('tr', { hasText: pin }).first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(OUT, '3-registry-console.png'), fullPage: true });
    check('registry console lists the executed request', (await page.locator('tr', { hasText: pin }).first().innerText()).includes('EXECUTED'));
    // With BLOCK_EXTERNAL=1 the Tailwind CDN is not loaded, so its inline config script fails; ignore only that.
    const realErrors = pageErrors.filter((m) => !(process.env.BLOCK_EXTERNAL === '1' && /tailwind is not defined/.test(m)));
    check('no uncaught browser errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

    await browser.close();
    const failed = results.filter((r) => !r.ok).length;
    fs.writeFileSync(path.join(OUT, 'ui-wallet-flow.json'), JSON.stringify({ pin, results }, null, 2));
    console.log(`\n${results.length - failed}/${results.length} UI checks passed. Screenshots in ${path.relative(ROOT, OUT)}`);
    if (failed) process.exitCode = 1;
}

main().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error(e); process.exit(1); });
