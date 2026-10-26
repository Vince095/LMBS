/**
 * Human-readable messages for the LandRegistry custom errors, so users see
 * why the contract refused an action.
 */
import { Interface } from 'ethers';
import abis from './generated/abis.json';

const IFACES = Object.values(abis).map((abi) => new Interface(abi));

const MESSAGES = {
    ParcelUnavailable: 'This parcel number is already reserved by a pending request or already registered.',
    InvalidParcelNumber: 'Parcel numbers may only contain letters, digits, "-" and "/".',
    PartyNotVerified: 'That wallet has no verified identity in the registry. An identity issuer must anchor it first.',
    NotTitleHolder: 'Only the current title holder can start a transfer of this title.',
    TransferAlreadyPending: 'A transfer of this title is already pending.',
    ParcelHasOpenDispute: 'The parcel has an open dispute; no registration or transfer is possible until it is resolved.',
    ParcelEncumbered: 'The title has an active mortgage, lien or caveat; it must be discharged first.',
    AlreadyDecided: 'Your wallet has already voted on this request.',
    ConflictOfInterest: 'You cannot vote on a request you submitted or are a party to.',
    RequestNotPending: 'The request is no longer pending.',
    RequestNotApproved: 'Only an approved request can be executed.',
    ExecutionBlocked: 'The request is approved but blocked (dispute, encumbrance or unverified party).',
    NotSubmitter: 'Only the wallet that submitted the request can cancel it.',
    RequestClosed: 'The request is already closed.',
    Unauthorized: 'Your wallet does not hold the on-chain role required for this action.',
    DirectTransferDisabled: 'Titles can only change hands through an approved transfer request.',
    ApprovalExpired: 'The signed approval has expired.',
    NonceAlreadyUsed: 'This signed approval has already been used.',
    InvalidInput: 'Some required values are missing (address, survey or document hash).',
    SubjectAlreadyBound: 'This person is already linked to another wallet.',
    AlreadyRegistered: 'This wallet already has an identity record.',
};

// Wallets wrap the revert payload at different depths (MetaMask: info.error.data.data,
// error.data.data, or a JSON `body` string). Collect every hex blob that could be one.
function revertDataCandidates(e, depth = 0, out = []) {
    if (e == null || depth > 6) return out;
    if (typeof e === 'string') {
        if (/^0x[0-9a-fA-F]{8,}$/.test(e)) out.push(e);
        else if (e.startsWith('{')) { try { revertDataCandidates(JSON.parse(e), depth + 1, out); } catch (_) { /* not JSON */ } }
        return out;
    }
    if (typeof e !== 'object') return out;
    for (const k of ['data', 'error', 'info', 'cause', 'payload', 'body']) revertDataCandidates(e[k], depth + 1, out);
    return out;
}

// Innermost human message from the wallet / node (e.g. "nonce too low", "execution reverted").
function innerMessage(e, depth = 0) {
    if (!e || typeof e !== 'object' || depth > 6) return null;
    for (const k of ['error', 'info', 'cause', 'data']) {
        const m = innerMessage(e[k], depth + 1);
        if (m) return m;
    }
    return depth > 0 && typeof e.message === 'string' ? e.message : null;
}

export function decodeChainError(err) {
    if (!err) return 'Unknown error';
    if (err.code === 'ACTION_REJECTED' || err.code === 4001) return 'You rejected the request in your wallet.';
    let name = err.revert && err.revert.name;
    if (!name) {
        outer: for (const data of revertDataCandidates(err)) {
            for (const i of IFACES) {
                try { const p = i.parseError(data); if (p) { name = p.name; break outer; } } catch (_) { /* next */ }
            }
        }
    }
    if (name) return MESSAGES[name] || `The contract rejected the action (${name}).`;
    const inner = innerMessage(err);
    if (/nonce/i.test(inner || '')) {
        return `Your wallet's transaction count is out of sync with the network (${inner}). In MetaMask open Settings → Advanced → "Clear activity tab data", then try again.`;
    }
    if (/could not coalesce/i.test(err.shortMessage || err.message || '') && inner) return `The wallet reported: ${inner}`;
    return err.shortMessage || err.message || String(err);
}
