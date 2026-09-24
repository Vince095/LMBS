/**
 * ChainConsole — the on-chain side of the registry for every role.
 *
 *   Everyone        wallet status, titles held, own requests (cancel)
 *   Identity issuer anchor a pseudonymous identity for a user (hashes only)
 *   Dispute officer open / close a dispute on a parcel
 *   Encumbrance off. register / discharge a mortgage, lien, caveat, servitude
 *   Auditor / all   full request ledger
 *
 * Tools are shown according to the roles the connected wallet holds in the
 * RoleAuthority contract; the contracts enforce the same rules.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useChain } from '../../chain/ChainContext';
import {
    ENC_KIND, anchorIdentity, cancelRequest, closeDispute, dischargeEncumbrance, listRequests,
    openDispute, registerEncumbrance, titlesOf,
} from '../../chain/registry';
import { decodeChainError } from '../../chain/errors';
import { http } from '../../services/httpClient';
import { API_BASE } from '../../config/api';
import WalletPanel from '../components/WalletPanel';
import { Badge, Button, Card, Notice, TxLink, inputCls, short } from '../components/chainUi';

function useAction() {
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const run = async (fn) => {
        setBusy(true); setError(null); setResult(null);
        try { const out = await fn(); setResult(out); return out; }
        catch (e) { setError(decodeChainError(e)); return null; }
        finally { setBusy(false); }
    };
    const feedback = (
        <>
            {result && result.txHash && <Notice tone="success">Confirmed in block {result.blockNumber}: <TxLink hash={result.txHash} /></Notice>}
            {error && <Notice tone="error">{error}</Notice>}
        </>
    );
    return { busy, run, feedback };
}

function IdentityTool({ config, signer }) {
    const [userId, setUserId] = useState('');
    const [anchor, setAnchor] = useState(null);
    const a = useAction();
    const preview = () => a.run(async () => { setAnchor(await http.get(`${API_BASE}/api/chain/identity-anchor/${encodeURIComponent(userId.trim())}`)); return null; });
    return (
        <Card title="Anchor a verified identity" icon="badge">
            <p className="font-public-sans text-body-sm text-on-surface-variant">
                After KYC, anchor the user's wallet with a pseudonymous subject id and a salted credential hash.
                No name, ID number, contact details or date of birth are written on-chain.
            </p>
            <div className="flex flex-wrap gap-2">
                <input className={inputCls + ' max-w-sm'} placeholder="User id (from Admin panel)" value={userId} onChange={(e) => setUserId(e.target.value)} />
                <Button variant="secondary" onClick={preview} disabled={!userId.trim()} busy={a.busy}>Prepare</Button>
            </div>
            {anchor && (
                <div className="flex flex-col gap-2">
                    <dl className="font-mono text-label-sm break-all grid gap-1">
                        <div>wallet {anchor.account}</div><div>subjectId {anchor.subjectId}</div>
                        <div>credentialHash {anchor.credentialHash}</div><div>issuerRef {anchor.issuerRef}</div>
                    </dl>
                    <div><Button onClick={() => a.run(() => anchorIdentity(config, signer, anchor))} busy={a.busy}>Anchor on-chain</Button></div>
                </div>
            )}
            {a.feedback}
        </Card>
    );
}

function DisputeTool({ config, signer }) {
    const [parcel, setParcel] = useState('');
    const [claim, setClaim] = useState('');
    const [id, setId] = useState('');
    const [outcome, setOutcome] = useState('');
    const [dismissed, setDismissed] = useState(false);
    const a = useAction();
    return (
        <Card title="Disputes (on-chain)" icon="gavel">
            <p className="font-public-sans text-body-sm text-on-surface-variant">An open dispute blocks every registration and transfer of the parcel until it is closed.</p>
            <div className="flex flex-wrap gap-2">
                <input className={inputCls + ' max-w-xs'} placeholder="Parcel number" value={parcel} onChange={(e) => setParcel(e.target.value)} />
                <input className={inputCls + ' max-w-sm'} placeholder="Claim / case reference (hashed)" value={claim} onChange={(e) => setClaim(e.target.value)} />
                <Button onClick={() => a.run(() => openDispute(config, signer, parcel, claim))} disabled={!parcel || !claim} busy={a.busy}>Open dispute</Button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
                <input className={inputCls + ' max-w-[120px]'} placeholder="Dispute id" value={id} onChange={(e) => setId(e.target.value)} />
                <input className={inputCls + ' max-w-sm'} placeholder="Outcome / court order reference (hashed)" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
                <label className="font-public-sans text-body-sm flex items-center gap-1"><input type="checkbox" checked={dismissed} onChange={(e) => setDismissed(e.target.checked)} /> dismissed</label>
                <Button variant="secondary" onClick={() => a.run(() => closeDispute(config, signer, id, outcome, dismissed))} disabled={!id || !outcome} busy={a.busy}>Close dispute</Button>
            </div>
            {a.feedback}
        </Card>
    );
}

function EncumbranceTool({ config, signer }) {
    const [parcel, setParcel] = useState('');
    const [kind, setKind] = useState(0);
    const [holder, setHolder] = useState('');
    const [instrument, setInstrument] = useState('');
    const [id, setId] = useState('');
    const [ref, setRef] = useState('');
    const a = useAction();
    return (
        <Card title="Encumbrances (on-chain)" icon="lock">
            <p className="font-public-sans text-body-sm text-on-surface-variant">Mortgages, liens and caveats block transfer until discharged; servitudes do not.</p>
            <div className="flex flex-wrap gap-2">
                <input className={inputCls + ' max-w-xs'} placeholder="Parcel number" value={parcel} onChange={(e) => setParcel(e.target.value)} />
                <select className={inputCls + ' max-w-[160px]'} value={kind} onChange={(e) => setKind(Number(e.target.value))}>
                    {ENC_KIND.map((k, i) => <option key={k} value={i}>{k}</option>)}
                </select>
                <input className={inputCls + ' max-w-xs'} placeholder="Holder reference (hashed)" value={holder} onChange={(e) => setHolder(e.target.value)} />
                <input className={inputCls + ' max-w-xs'} placeholder="Instrument reference (hashed)" value={instrument} onChange={(e) => setInstrument(e.target.value)} />
                <Button onClick={() => a.run(() => registerEncumbrance(config, signer, parcel, kind, holder, instrument))} disabled={!parcel || !instrument} busy={a.busy}>Register</Button>
            </div>
            <div className="flex flex-wrap gap-2">
                <input className={inputCls + ' max-w-[140px]'} placeholder="Encumbrance id" value={id} onChange={(e) => setId(e.target.value)} />
                <input className={inputCls + ' max-w-sm'} placeholder="Discharge reference (hashed)" value={ref} onChange={(e) => setRef(e.target.value)} />
                <Button variant="secondary" onClick={() => a.run(() => dischargeEncumbrance(config, signer, id, ref))} disabled={!id || !ref} busy={a.busy}>Discharge</Button>
            </div>
            {a.feedback}
        </Card>
    );
}

export default function ChainConsole() {
    const { config, account, signer, roles, walletMatchesAccount } = useChain();
    const [titles, setTitles] = useState([]);
    const [requests, setRequests] = useState([]);
    const [error, setError] = useState(null);
    const a = useAction();

    const load = useCallback(async () => {
        if (!config || !config.configured) return;
        setError(null);
        try {
            setRequests(await listRequests(config));
            if (account) setTitles(await titlesOf(config, account));
        } catch (e) { setError(decodeChainError(e)); }
    }, [config, account]);

    useEffect(() => { load(); }, [load]);

    const mine = requests.filter((r) => account && [r.submitter, r.from, r.to].includes(account));
    const ready = !!signer && walletMatchesAccount;

    return (
        <div className="p-margin max-w-container-max mx-auto w-full flex flex-col gap-stack-lg">
            <header>
                <h1 className="font-public-sans text-h1 font-bold text-on-surface tracking-tight">Blockchain registry</h1>
                <p className="font-public-sans text-body-md text-on-surface-variant mt-2">
                    Titles and requests as recorded on the permissioned Hyperledger Besu network. The token is the registry's
                    internal digital record of a title; legal ownership follows the Land Act and the authorised registry act.
                </p>
            </header>

            <WalletPanel />
            {error && <Notice tone="error">{error}</Notice>}

            {account && (
                <Card title="Titles held by this wallet" icon="verified_user" actions={<Button variant="secondary" onClick={load}>Refresh</Button>}>
                    {titles.length === 0 && <p className="font-public-sans text-body-sm text-on-surface-variant">No titles.</p>}
                    <ul className="flex flex-col gap-2">
                        {titles.map((t) => (
                            <li key={t.tokenId} className="flex flex-wrap items-center justify-between gap-2 border border-outline-variant rounded-lg p-3">
                                <div className="flex flex-col">
                                    <span className="font-public-sans text-body-md font-semibold">{t.parcelNumber}</span>
                                    <span className="font-mono text-label-sm text-on-surface-variant break-all">document {t.documentHash}</span>
                                </div>
                                {t.pendingTransfer
                                    ? <Badge tone="PENDING">Transfer #{t.pendingTransfer} pending</Badge>
                                    : <Link to={`/transfer/${encodeURIComponent(t.parcelNumber)}`} className="px-3 py-1.5 rounded-DEFAULT bg-primary-container text-white font-public-sans text-body-sm font-semibold">Start transfer</Link>}
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {account && (
                <Card title="My requests" icon="pending_actions">
                    {mine.length === 0 && <p className="font-public-sans text-body-sm text-on-surface-variant">None.</p>}
                    <ul className="flex flex-col gap-2">
                        {mine.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border border-outline-variant rounded-lg p-3">
                                <span className="font-public-sans text-body-sm">#{r.id} {r.kind.toLowerCase()} · {r.parcelNumber} · {r.approvals}/{r.threshold} approvals</span>
                                <div className="flex items-center gap-2">
                                    <Badge tone={r.status}>{r.status}</Badge>
                                    {r.submitter === account && ['PENDING', 'APPROVED'].includes(r.status) && (
                                        <Button variant="secondary" disabled={!ready} busy={a.busy} onClick={() => a.run(async () => { const o = await cancelRequest(config, signer, r.id); await load(); return o; })}>Cancel</Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                    {a.feedback}
                </Card>
            )}

            {ready && roles && roles.IDENTITY_ISSUER_ROLE && <IdentityTool config={config} signer={signer} />}
            {ready && roles && roles.DISPUTE_OFFICER_ROLE && <DisputeTool config={config} signer={signer} />}
            {ready && roles && roles.ENCUMBRANCE_OFFICER_ROLE && <EncumbranceTool config={config} signer={signer} />}

            <Card title="Request ledger" icon="receipt_long">
                <div className="overflow-x-auto">
                    <table className="w-full font-public-sans text-body-sm">
                        <thead><tr className="text-left text-on-surface-variant">
                            <th className="py-1 pr-3">#</th><th className="pr-3">Kind</th><th className="pr-3">Parcel</th>
                            <th className="pr-3">From → To</th><th className="pr-3">Approvals</th><th>Status</th>
                        </tr></thead>
                        <tbody>
                            {requests.map((r) => (
                                <tr key={r.id} className="border-t border-outline-variant">
                                    <td className="py-1 pr-3">{r.id}</td><td className="pr-3">{r.kind}</td><td className="pr-3">{r.parcelNumber}</td>
                                    <td className="pr-3 font-mono">{r.kind === 'TRANSFER' ? `${short(r.from)} → ${short(r.to)}` : `— → ${short(r.to)}`}</td>
                                    <td className="pr-3">{r.approvals}/{r.threshold}</td><td><Badge tone={r.status}>{r.status}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
