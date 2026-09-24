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

export function decodeChainError(err) {
    if (!err) return 'Unknown error';
    if (err.code === 'ACTION_REJECTED' || err.code === 4001) return 'You rejected the request in your wallet.';
    let name = err.revert && err.revert.name;
    const data = err.data || (err.info && err.info.error && err.info.error.data) || (err.error && err.error.data);
    if (!name && typeof data === 'string') {
        for (const i of IFACES) {
            try { const p = i.parseError(data); if (p) { name = p.name; break; } } catch (_) { /* next */ }
        }
    }
    if (name) return MESSAGES[name] || `The contract rejected the action (${name}).`;
    return err.shortMessage || err.message || String(err);
}
