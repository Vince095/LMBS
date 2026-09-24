/**
 * ApprovalsQueue — institutional M-of-N approval of registration and transfer
 * requests, read directly from the LandRegistry contract.
 *
 * Every request that still needs a decision is listed (PENDING), together
 * with approved requests whose execution was deferred (APPROVED + blocker).
 * Approving or rejecting sends a transaction from the approver's own wallet;
 * the contract enforces the APPROVER_ROLE, one vote per approver, and the
 * separation-of-duties rule (no vote on a request you submitted or are a
 * party to). There is no seed-phrase entry and no simulated consensus phase:
 * network consensus is Besu QBFT, business approval is the M-of-N threshold.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useChain } from '../../chain/ChainContext';
import { approveRequest, executeRequest, listRequests, rejectRequest } from '../../chain/registry';
import { decodeChainError } from '../../chain/errors';
import WalletPanel from '../components/WalletPanel';
import { Badge, Button, Card, Notice, TxLink, inputCls, short } from '../components/chainUi';

const BLOCKER_TEXT = {
    OPEN_DISPUTE: 'open dispute on the parcel',
    BLOCKING_ENCUMBRANCE: 'active mortgage, lien or caveat',
    PARTY_NOT_VERIFIED: 'recipient identity not verified',
    OWNER_CHANGED: 'title holder changed',
};

function Progress({ approvals, threshold, rejections }) {
    const pct = Math.min(100, Math.round((approvals / Math.max(threshold, 1)) * 100));
    return (
        <div className="flex flex-col gap-1 min-w-[140px]">
            <div className="h-2 rounded-full bg-surface-container-high overflow-hidden" aria-hidden="true">
                <div className="h-full" style={{ width: `${pct}%`, background: '#059669' }} />
            </div>
            <span className="font-public-sans text-label-sm text-on-surface-variant">
                {approvals} of {threshold} approvals{rejections ? ` · ${rejections} rejection(s)` : ''}
            </span>
        </div>
    );
}

function RequestRow({ r, me, canVote, onAction, busyId }) {
    const [reason, setReason] = useState('');
    const conflicted = !!me && [r.submitter, r.from, r.to].includes(me);
    const voted = r.myDecision && r.myDecision !== 'NONE';
    const busy = busyId === r.id;
    return (
        <li className="border border-outline-variant rounded-lg p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">{r.kind === 'TRANSFER' ? 'swap_horiz' : 'add_location_alt'}</span>
                    <div className="flex flex-col">
                        <span className="font-public-sans text-body-md font-semibold text-on-surface">
                            #{r.id} · {r.kind === 'TRANSFER' ? 'Transfer' : 'First registration'} ·{' '}
                            <Link className="underline" to={`/property/${encodeURIComponent(r.parcelNumber)}`}>{r.parcelNumber}</Link>
                        </span>
                        <span className="font-mono text-label-sm text-on-surface-variant">
                            {r.kind === 'TRANSFER' ? `${short(r.from)} → ${short(r.to)}` : `beneficiary ${short(r.to)}`} · submitted by {short(r.submitter)}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Progress approvals={r.approvals} threshold={r.threshold} rejections={r.rejections} />
                    <Badge tone={r.status}>{r.status}</Badge>
                </div>
            </div>
            <div className="font-mono text-label-sm text-on-surface-variant break-all">document hash {r.documentHash}</div>

            {r.status === 'APPROVED' && (
                <div className="flex flex-wrap items-center gap-3">
                    <Notice tone="error">Approved but not executed: {BLOCKER_TEXT[r.blocker] || r.blocker}. It executes once the blocker is cleared.</Notice>
                    <Button onClick={() => onAction('execute', r)} busy={busy} disabled={r.blocker !== 'NONE'}>Execute now</Button>
                </div>
            )}

            {r.status === 'PENDING' && (
                <div className="flex flex-wrap items-center gap-2">
                    {voted && <Badge tone={r.myDecision === 'APPROVE' ? 'YES' : 'NO'}>You voted {r.myDecision.toLowerCase()}</Badge>}
                    {conflicted && <Badge tone="NO">Conflict of interest: you cannot vote</Badge>}
                    {!voted && !conflicted && canVote && (
                        <>
                            <Button onClick={() => onAction('approve', r)} busy={busy}>Approve</Button>
                            <input className={inputCls + ' max-w-xs'} placeholder="Reason for rejection (hashed on-chain)" value={reason} onChange={(e) => setReason(e.target.value)} />
                            <Button variant="danger" onClick={() => onAction('reject', r, reason)} busy={busy} disabled={!reason.trim()}>Reject</Button>
                        </>
                    )}
                </div>
            )}
        </li>
    );
}

export default function ApprovalsQueue() {
    const { config, account, signer, roles, walletMatchesAccount } = useChain();
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [busyId, setBusyId] = useState(null);
    const [filter, setFilter] = useState('OPEN');

    const load = useCallback(async () => {
        if (!config || !config.configured) return;
        setLoading(true); setError(null);
        try { setRequests(await listRequests(config, { viewer: account || undefined })); }
        catch (e) { setError(decodeChainError(e)); }
        finally { setLoading(false); }
    }, [config, account]);

    useEffect(() => { load(); }, [load]);

    const onAction = async (kind, r, reason) => {
        setBusyId(r.id); setError(null); setMessage(null);
        try {
            const fn = kind === 'approve' ? approveRequest : kind === 'reject' ? rejectRequest : executeRequest;
            const out = await fn(config, signer, r.id, reason);
            setMessage(<span>Recorded in block {out.blockNumber}: <TxLink hash={out.txHash} /></span>);
            await load();
        } catch (e) { setError(decodeChainError(e)); }
        finally { setBusyId(null); }
    };

    const canVote = !!signer && !!roles && roles.APPROVER_ROLE && walletMatchesAccount;
    const visible = requests.filter((r) => (filter === 'OPEN' ? ['PENDING', 'APPROVED'].includes(r.status) : true));

    return (
        <div className="p-margin max-w-container-max mx-auto w-full flex flex-col gap-stack-lg">
            <header>
                <h1 className="font-public-sans text-h1 font-bold text-on-surface tracking-tight">Approvals</h1>
                <p className="font-public-sans text-body-md text-on-surface-variant mt-2">
                    Registration and transfer requests awaiting institutional approval. A request executes automatically when{' '}
                    {config && config.approvalThreshold ? `${config.approvalThreshold}` : 'M'} authorised approvers have approved it.
                </p>
            </header>

            <WalletPanel />

            {account && roles && !roles.APPROVER_ROLE && (
                <Notice>Your wallet does not hold APPROVER_ROLE, so you can view requests but not vote.</Notice>
            )}

            <Card title="Requests" icon="checklist" actions={
                <div className="flex items-center gap-2">
                    <select className={inputCls} value={filter} onChange={(e) => setFilter(e.target.value)}>
                        <option value="OPEN">Awaiting action</option>
                        <option value="ALL">All requests</option>
                    </select>
                    <Button variant="secondary" onClick={load} busy={loading}>Refresh</Button>
                </div>
            }>
                {message && <Notice tone="success">{message}</Notice>}
                {error && <Notice tone="error">{error}</Notice>}
                {!loading && visible.length === 0 && <p className="font-public-sans text-body-sm text-on-surface-variant">No requests.</p>}
                <ul className="flex flex-col gap-3">
                    {visible.map((r) => <RequestRow key={r.id} r={r} me={account} canVote={canVote} onAction={onAction} busyId={busyId} />)}
                </ul>
            </Card>
        </div>
    );
}
