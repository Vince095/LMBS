/**
 * Browser-side access to the LMBS contracts.
 *
 * Every state-changing call is signed by the user's OWN wallet (MetaMask or
 * an institutional wallet). The app never asks for, stores or transmits a
 * private key, seed phrase or mnemonic.
 */
import { BrowserProvider, Contract, JsonRpcProvider, keccak256, toUtf8Bytes, getAddress } from 'ethers';
import abis from './generated/abis.json';
import { http } from '../services/httpClient';
import { API_BASE } from '../config/api';

export const KIND = ['REGISTRATION', 'TRANSFER'];
export const STATUS = ['NONE', 'PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'CANCELLED'];
export const BLOCKER = ['NONE', 'OPEN_DISPUTE', 'BLOCKING_ENCUMBRANCE', 'PARTY_NOT_VERIFIED', 'OWNER_CHANGED'];
export const ENC_KIND = ['MORTGAGE', 'LIEN', 'CAVEAT', 'SERVITUDE'];
export const RPC_URL = process.env.REACT_APP_CHAIN_RPC_URL || 'http://127.0.0.1:8545';
// Besu's default --rpc-max-logs-range is 5000 blocks; stay under it.
const LOG_CHUNK_BLOCKS = 4000;
const LOG_CHUNK_CONCURRENCY = 6;

let cachedConfig = null;

/** Contract addresses, chain id and role ids come from the backend (written at deploy time). */
export async function loadChainConfig(force = false) {
    if (cachedConfig && !force) return cachedConfig;
    const cfg = await http.get(`${API_BASE}/api/chain/config`);
    cachedConfig = cfg;
    return cfg;
}

export const textHash = (s) => keccak256(toUtf8Bytes(String(s)));

export function hasBrowserWallet() {
    return typeof window !== 'undefined' && !!window.ethereum;
}

async function ensureNetwork(cfg) {
    const chainIdHex = '0x' + Number(cfg.chainId).toString(16);
    try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
    } catch (err) {
        if (err && (err.code === 4902 || /Unrecognized chain/i.test(err.message || ''))) {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: chainIdHex,
                    chainName: 'LMBS Besu QBFT (prototype)',
                    rpcUrls: [RPC_URL],
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                }],
            });
        } else {
            throw err;
        }
    }
}

export async function connectWallet(cfg) {
    if (!hasBrowserWallet()) {
        throw new Error('No browser wallet found. Install MetaMask (or use an institutional wallet) and import your account.');
    }
    const provider = new BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    await ensureNetwork(cfg);
    const signer = await new BrowserProvider(window.ethereum).getSigner();
    return { signer, address: (await signer.getAddress()).toLowerCase() };
}

export function readProvider() {
    return new JsonRpcProvider(RPC_URL);
}

export function contracts(cfg, runner) {
    const r = runner || readProvider();
    const c = cfg.contracts;
    return {
        authority: new Contract(c.RoleAuthority, abis.RoleAuthority, r),
        identities: new Contract(c.IdentityRegistry, abis.IdentityRegistry, r),
        disputes: new Contract(c.DisputeRegistry, abis.DisputeRegistry, r),
        encumbrances: new Contract(c.EncumbranceRegistry, abis.EncumbranceRegistry, r),
        registry: new Contract(c.LandRegistry, abis.LandRegistry, r),
    };
}

/** On-chain roles held by an address (read from the single RoleAuthority). */
export async function rolesOf(cfg, address) {
    const { authority, identities } = contracts(cfg);
    const names = ['REGISTRAR_ROLE', 'APPROVER_ROLE', 'IDENTITY_ISSUER_ROLE', 'DISPUTE_OFFICER_ROLE', 'ENCUMBRANCE_OFFICER_ROLE'];
    const out = {};
    await Promise.all(names.map(async (n) => { out[n] = await authority.hasRole(cfg.roles[n], address); }));
    out.DEFAULT_ADMIN_ROLE = await authority.hasRole('0x' + '0'.repeat(64), address);
    out.identityVerified = await identities.isVerified(address);
    return out;
}

function toRequest(id, r) {
    return {
        id: Number(id),
        kind: KIND[Number(r.kind)],
        status: STATUS[Number(r.status)],
        threshold: Number(r.threshold),
        approvals: Number(r.approvals),
        rejections: Number(r.rejections),
        createdAt: Number(r.createdAt),
        closedAt: Number(r.closedAt),
        parcelKey: r.parcelKey,
        documentHash: r.documentHash,
        surveyHash: r.surveyHash,
        submitter: r.submitter.toLowerCase(),
        from: r.from.toLowerCase(),
        to: r.to.toLowerCase(),
        tokenId: BigInt(r.parcelKey).toString(),
    };
}

/** All requests, newest first, with the canonical parcel number and (optionally) the viewer's vote. */
export async function listRequests(cfg, { viewer } = {}) {
    const { registry } = contracts(cfg);
    const count = Number(await registry.requestCount());
    const out = [];
    const PAGE = 100;
    for (let start = 1; start <= count; start += PAGE) {
        const page = await registry.getRequests(start, PAGE);
        page.forEach((r, i) => out.push(toRequest(start + i, r)));
    }
    await Promise.all(out.map(async (r) => {
        r.parcelNumber = await registry.canonicalParcelNumber(r.parcelKey);
        if (r.status === 'APPROVED') r.blocker = BLOCKER[Number(await registry.executionBlocker(r.id))];
        if (viewer) r.myDecision = ['NONE', 'APPROVE', 'REJECT'][Number(await registry.decisionOf(r.id, viewer))];
    }));
    return out.reverse();
}

/** Titles currently held by `owner` (from ERC-721 Transfer events, confirmed with ownerOf). */
export async function titlesOf(cfg, owner) {
    const { registry } = contracts(cfg);
    // Query in chunks: Besu (and most RPCs) cap eth_getLogs at a maximum block range.
    const filter = registry.filters.Transfer(null, owner);
    const head = await registry.runner.provider.getBlockNumber();
    const ranges = [];
    for (let from = Number(cfg.startBlock || 0); from <= head; from += LOG_CHUNK_BLOCKS) {
        ranges.push([from, Math.min(head, from + LOG_CHUNK_BLOCKS - 1)]);
    }
    // A few chunks in flight at once: fast on a long chain without flooding the RPC node.
    const logs = [];
    for (let i = 0; i < ranges.length; i += LOG_CHUNK_CONCURRENCY) {
        const batch = await Promise.all(ranges.slice(i, i + LOG_CHUNK_CONCURRENCY).map(([a, b]) => registry.queryFilter(filter, a, b)));
        batch.forEach((l) => logs.push(...l));
    }
    const ids = [...new Set(logs.map((l) => l.args.tokenId.toString()))];
    const held = await Promise.all(ids.map(async (id) => {
        const current = (await registry.ownerOf(id)).toLowerCase();
        if (current !== owner.toLowerCase()) return null;
        const key = '0x' + BigInt(id).toString(16).padStart(64, '0');
        const [parcelNumber, documentHash, pending] = await Promise.all([
            registry.canonicalParcelNumber(key),
            registry.titleDocumentHash(id),
            registry.activeTransferRequest(id),
        ]);
        return { tokenId: id, parcelKey: key, parcelNumber, documentHash, pendingTransfer: Number(pending) };
    }));
    return held.filter(Boolean);
}

/** Sends a transaction and waits until it is in a finalised QBFT block. */
async function send(txPromise) {
    const tx = await txPromise;
    const receipt = await tx.wait();
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber, receipt };
}

function requestIdFrom(cfg, receipt) {
    const { registry } = contracts(cfg);
    for (const log of receipt.logs) {
        try {
            const p = registry.interface.parseLog(log);
            if (p && p.name === 'RequestSubmitted') return Number(p.args.requestId);
        } catch (_) { /* other contract */ }
    }
    return null;
}

export async function submitRegistration(cfg, signer, { parcelNumber, beneficiary, surveyHash, documentHash }) {
    const { registry } = contracts(cfg, signer);
    const out = await send(registry.submitRegistration(parcelNumber, getAddress(beneficiary), surveyHash, documentHash));
    return { ...out, requestId: requestIdFrom(cfg, out.receipt) };
}

export async function submitTransfer(cfg, signer, { tokenId, to, documentHash }) {
    const { registry } = contracts(cfg, signer);
    const out = await send(registry.submitTransfer(tokenId, getAddress(to), documentHash));
    return { ...out, requestId: requestIdFrom(cfg, out.receipt) };
}

export const approveRequest = (cfg, signer, id) => send(contracts(cfg, signer).registry.approveRequest(id));
export const rejectRequest = (cfg, signer, id, reason) => send(contracts(cfg, signer).registry.rejectRequest(id, textHash(reason || 'rejected')));
export const cancelRequest = (cfg, signer, id) => send(contracts(cfg, signer).registry.cancel(id));
export const executeRequest = (cfg, signer, id) => send(contracts(cfg, signer).registry.execute(id));

export const anchorIdentity = (cfg, signer, { account, subjectId, credentialHash, issuerRef }) =>
    send(contracts(cfg, signer).identities.register(getAddress(account), subjectId, credentialHash, issuerRef));

export async function parcelKeyOf(cfg, parcelNumber) {
    return contracts(cfg).registry.parcelKeyOf(parcelNumber);
}

export const openDispute = async (cfg, signer, parcelNumber, claimText) =>
    send(contracts(cfg, signer).disputes.openDispute(await parcelKeyOf(cfg, parcelNumber), textHash(claimText)));
export const closeDispute = (cfg, signer, disputeId, outcomeText, dismissed) =>
    send(contracts(cfg, signer).disputes.closeDispute(disputeId, textHash(outcomeText), !!dismissed));
export const registerEncumbrance = async (cfg, signer, parcelNumber, kindIndex, holderRef, instrumentText) =>
    send(contracts(cfg, signer).encumbrances.register(await parcelKeyOf(cfg, parcelNumber), kindIndex, textHash(holderRef), textHash(instrumentText)));
export const dischargeEncumbrance = (cfg, signer, id, dischargeText) =>
    send(contracts(cfg, signer).encumbrances.discharge(id, textHash(dischargeText)));
