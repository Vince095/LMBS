/**
 * Blockchain adapter (read-only).
 *
 * The backend NEVER signs land-registry transactions and NEVER fabricates
 * transaction hashes. Every state change is sent by the acting person's own
 * wallet (registrar, owner, institutional approver). The backend only:
 *   - reads contract state,
 *   - verifies that a transaction hash a client reports really contains the
 *     expected LandRegistry event from the expected wallet, and
 *   - indexes events into MongoDB read models (see indexerService.js).
 *
 * If the chain is not configured the chain-dependent endpoints answer 503
 * instead of pretending to write to a blockchain.
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const env = require('../config/env');
const { HttpError } = require('../middleware/error');

const BACKEND_ROOT = path.join(__dirname, '..');
const KIND = ['REGISTRATION', 'TRANSFER'];
const STATUS = ['NONE', 'PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'CANCELLED'];

let cache = null;
let provider = null;

function readJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

function loadConfig() {
    if (cache) return cache;
    const deploymentFile = path.isAbsolute(env.chainDeploymentFile)
        ? env.chainDeploymentFile
        : path.join(BACKEND_ROOT, env.chainDeploymentFile);
    const deployment = readJson(deploymentFile);
    const abis = readJson(path.join(BACKEND_ROOT, 'chain', 'abis.json'));
    cache = { deployment, abis };
    return cache;
}

function resetCache() { cache = null; provider = null; }

/** Test hook: inject a provider (pass null to reset). */
function _setProvider(p) { provider = p; }

function isConfigured() {
    const { deployment, abis } = loadConfig();
    return !!(deployment && deployment.contracts && deployment.contracts.LandRegistry && abis && abis.LandRegistry);
}

function requireConfigured() {
    if (!isConfigured()) {
        throw new HttpError(503, 'Blockchain network not configured: deploy the contracts (blockchain/) and set CHAIN_DEPLOYMENT_FILE');
    }
}

function getProvider() {
    if (!provider) provider = new ethers.JsonRpcProvider(env.rpcUrl, env.chainId, { staticNetwork: true });
    return provider;
}

function contract(name) {
    requireConfigured();
    const { deployment, abis } = loadConfig();
    return new ethers.Contract(deployment.contracts[name], abis[name], getProvider());
}

function registryInterface() {
    const { abis } = loadConfig();
    return new ethers.Interface(abis.LandRegistry);
}

/** Public configuration for the frontend (addresses, chain id, EIP-712 domain, role ids). */
function publicConfig() {
    if (!isConfigured()) return { configured: false };
    const { deployment } = loadConfig();
    return {
        configured: true,
        chainId: deployment.chainId,
        contracts: deployment.contracts,
        eip712: deployment.eip712,
        roles: deployment.roles,
        startBlock: deployment.startBlock,
    };
}

/** JS mirror of LandRegistry.normalizeParcelNumber (kept identical; covered by tests). */
function normalizeParcelNumber(parcelNumber) {
    const raw = String(parcelNumber || '');
    if (!/^[A-Za-z0-9\-/ \t\n\r]*$/.test(raw)) throw new HttpError(422, 'Invalid parcel number');
    const out = raw.replace(/[ \t\n\r]/g, '').toUpperCase();
    if (!out || out.length > 64) throw new HttpError(422, 'Invalid parcel number');
    return out;
}

function parcelKeyOf(parcelNumber) {
    return ethers.keccak256(ethers.toUtf8Bytes(normalizeParcelNumber(parcelNumber)));
}

function tokenIdOf(parcelKey) {
    return BigInt(parcelKey).toString();
}

/**
 * Verifies that `txHash` is a successful LandRegistry transaction that emitted
 * RequestSubmitted from `expectedSubmitter`. Returns the decoded request.
 */
async function verifySubmission(txHash, { expectedSubmitter, expectedKind, expectedParcelKey } = {}) {
    requireConfigured();
    if (!/^0x[0-9a-fA-F]{64}$/.test(String(txHash || ''))) throw new HttpError(400, 'chainTxHash must be a 32-byte hex transaction hash');

    const receipt = await getProvider().getTransactionReceipt(txHash);
    if (!receipt) throw new HttpError(409, 'Transaction not yet mined; retry after it is confirmed');
    if (receipt.status !== 1) throw new HttpError(422, 'Transaction reverted on-chain');

    const registryAddr = loadConfig().deployment.contracts.LandRegistry.toLowerCase();
    const iface = registryInterface();
    const events = receipt.logs
        .filter((l) => l.address.toLowerCase() === registryAddr)
        .map((l) => { try { return iface.parseLog(l); } catch (_) { return null; } })
        .filter(Boolean);
    const submitted = events.find((e) => e.name === 'RequestSubmitted');
    if (!submitted) throw new HttpError(422, 'Transaction did not submit a LandRegistry request');

    const a = submitted.args;
    const result = {
        requestId: Number(a.requestId),
        kind: KIND[Number(a.kind)],
        parcelKey: a.parcelKey,
        tokenId: a.tokenId.toString(),
        submitter: a.submitter.toLowerCase(),
        from: a.from.toLowerCase(),
        to: a.to.toLowerCase(),
        documentHash: a.documentHash,
        threshold: Number(a.threshold),
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
    };
    if (expectedSubmitter && result.submitter !== expectedSubmitter.toLowerCase()) {
        throw new HttpError(403, 'The on-chain request was not submitted by your verified wallet');
    }
    if (expectedKind && result.kind !== expectedKind) throw new HttpError(422, `Expected a ${expectedKind} request`);
    if (expectedParcelKey && result.parcelKey.toLowerCase() !== expectedParcelKey.toLowerCase()) {
        throw new HttpError(422, 'On-chain parcel key does not match the parcel number supplied');
    }
    return result;
}

async function readRequest(requestId) {
    const r = await contract('LandRegistry').getRequest(requestId);
    return {
        requestId: Number(requestId),
        kind: KIND[Number(r.kind)],
        status: STATUS[Number(r.status)],
        threshold: Number(r.threshold),
        approvals: Number(r.approvals),
        rejections: Number(r.rejections),
        parcelKey: r.parcelKey,
        documentHash: r.documentHash,
        submitter: r.submitter.toLowerCase(),
        from: r.from.toLowerCase(),
        to: r.to.toLowerCase(),
    };
}

module.exports = {
    KIND,
    STATUS,
    loadConfig,
    resetCache,
    isConfigured,
    requireConfigured,
    getProvider,
    contract,
    registryInterface,
    publicConfig,
    normalizeParcelNumber,
    parcelKeyOf,
    tokenIdOf,
    verifySubmission,
    readRequest,
    _setProvider,
};
