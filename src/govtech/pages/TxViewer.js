/**
 * TxViewer — internal blockchain transaction viewer.
 *
 * Route: /tx/:txHash
 *
 * Replaces the broken external link to http://127.0.0.1:8560/tx/...
 * Queries GET /api/network/tx/:txHash and displays:
 *  - If found on-chain: block, from, to, gas, status, timestamp
 *  - If only in MongoDB: resource type, ID, timestamp, related entities
 *  - If not found: friendly 404 with a copy-to-clipboard of the hash
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { http } from '../../services/httpClient';
import { ENDPOINTS } from '../../config/api';

/* ── helpers ──────────────────────────────────────────────────────────────── */
function fmtHash(h, len = 12) {
    if (!h) return '—';
    if (h.length <= len * 2) return h;
    return h.slice(0, len) + '…' + h.slice(-len);
}
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString();
}
function fmtWei(wei) {
    if (!wei || wei === '0') return '0 LOTI';
    const n = BigInt(wei);
    const whole = n / BigInt(1e18);
    const frac  = Number(n % BigInt(1e18)) / 1e18;
    return (Number(whole) + frac).toFixed(6) + ' LOTI';
}

/* ── status pill ──────────────────────────────────────────────────────────── */
function StatusPill({ status }) {
    const MAP = {
        SUCCESS:  { bg:'#dcfce7', fg:'#166534', icon:'check_circle'    },
        FAILED:   { bg:'#fee2e2', fg:'#991b1b', icon:'cancel'          },
        PENDING:  { bg:'#fef3c7', fg:'#92400e', icon:'pending'         },
        RECORDED: { bg:'#dbeafe', fg:'#1d4ed8', icon:'database'        },
    };
    const s = MAP[status] || MAP.RECORDED;
    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold text-sm"
              style={{ background: s.bg, color: s.fg }}>
            <span className="material-symbols-outlined text-[16px]">{s.icon}</span>
            {status}
        </span>
    );
}

/* ── row in the detail table ──────────────────────────────────────────────── */
function Row({ label, value, mono, copy }) {
    const [copied, setCopied] = useState(false);
    async function doCopy() {
        await navigator.clipboard.writeText(String(value)).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
    return (
        <div className="flex items-start gap-4 py-3 border-b border-outline-variant last:border-0">
            <span className="w-40 shrink-0 font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider pt-0.5">
                {label}
            </span>
            <span className={`flex-1 font-public-sans text-body-sm text-on-surface break-all ${mono ? 'font-mono text-xs' : ''}`}>
                {value ?? '—'}
            </span>
            {copy && value && (
                <button onClick={doCopy} title="Copy"
                        className="shrink-0 p-1 rounded hover:bg-surface-container text-on-surface-variant transition-colors">
                    <span className="material-symbols-outlined text-[16px]">
                        {copied ? 'check' : 'content_copy'}
                    </span>
                </button>
            )}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════════════ */
export default function TxViewer() {
    const { txHash }   = useParams();
    const navigate     = useNavigate();
    const [tx,     setTx]     = useState(null);
    const [loading,setLoading]= useState(true);
    const [err,    setErr]    = useState(null);

    useEffect(() => {
        if (!txHash) return;
        setLoading(true);
        setErr(null);
        http.get(`${ENDPOINTS.network}/tx/${encodeURIComponent(txHash)}`)
            .then(setTx)
            .catch((e) => setErr(e.message || 'Not found'))
            .finally(() => setLoading(false));
    }, [txHash]);

    /* ── loading ──────────────────────────────────────────────────────────── */
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <span className="material-symbols-outlined animate-spin text-primary text-5xl">progress_activity</span>
                <p className="font-public-sans text-body-md text-on-surface-variant">Looking up transaction…</p>
            </div>
        );
    }

    /* ── not found ────────────────────────────────────────────────────────── */
    if (err || !tx) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-10">
                <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-surface-container-low border border-outline-variant text-center">
                    <span className="material-symbols-outlined text-5xl text-on-surface-variant">search_off</span>
                    <h1 className="font-public-sans text-title-lg font-bold text-on-surface">Transaction Not Found</h1>
                    <p className="font-public-sans text-body-sm text-on-surface-variant max-w-md">
                        This transaction hash was not found on the chain or in the local ledger database.
                        It may be from a different network or may not have been submitted yet.
                    </p>
                    <div className="w-full p-3 rounded-lg bg-surface-container border border-outline-variant font-mono text-xs text-on-surface-variant break-all">
                        {txHash}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => navigate(-1)}
                                className="px-4 py-2 rounded-lg border border-outline text-body-sm hover:bg-surface-container">
                            ← Back
                        </button>
                        <button onClick={() => navigator.clipboard.writeText(txHash).catch(() => {})}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-body-sm hover:opacity-90">
                            <span className="material-symbols-outlined text-[16px]">content_copy</span>
                            Copy Hash
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isChain = tx.source === 'chain';

    return (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

            {/* breadcrumb */}
            <nav className="flex items-center gap-2 font-public-sans text-body-sm text-on-surface-variant">
                <button onClick={() => navigate(-1)} className="hover:text-on-surface flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back
                </button>
                <span>/</span>
                <span className="text-on-surface">Transaction</span>
                <span>/</span>
                <span className="font-mono text-xs text-on-surface">{fmtHash(txHash, 8)}</span>
            </nav>

            {/* header card */}
            <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">receipt_long</span>
                            <h1 className="font-public-sans text-title-md font-bold text-on-surface">
                                {isChain ? 'On-Chain Transaction' : 'Ledger Record'}
                            </h1>
                        </div>
                        <p className="font-public-sans text-body-sm text-on-surface-variant">
                            {isChain
                                ? 'Retrieved from the Besu EVM node'
                                : 'Retrieved from the LMBS MongoDB ledger (chain unreachable or hash is off-chain)'}
                        </p>
                    </div>
                    <StatusPill status={tx.status} />
                </div>

                {/* source badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
                     style={{ background: isChain ? '#dcfce7' : '#f1f5f9', color: isChain ? '#166534' : '#475569' }}>
                    <span className="material-symbols-outlined text-[14px]">
                        {isChain ? 'verified' : 'database'}
                    </span>
                    Source: {isChain ? 'Besu EVM' : 'MongoDB Ledger'}
                </div>
            </div>

            {/* detail table */}
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
                <div className="px-5 py-3 border-b border-outline-variant bg-surface-container-low">
                    <h2 className="font-public-sans text-label-lg font-semibold text-on-surface-variant text-xs uppercase tracking-wider">
                        Transaction Details
                    </h2>
                </div>
                <div className="px-5">
                    <Row label="Hash"   value={tx.hash || txHash} mono copy />
                    <Row label="Status" value={<StatusPill status={tx.status} />} />
                    {tx.timestamp && <Row label="Timestamp" value={fmtDate(tx.timestamp)} />}

                    {isChain ? (
                        <>
                            <Row label="Block"        value={tx.blockNumber ?? 'Pending'} />
                            <Row label="Block Hash"   value={tx.blockHash}  mono copy />
                            <Row label="From"         value={tx.from}       mono copy />
                            <Row label="To"           value={tx.to || '—'}  mono copy />
                            <Row label="Value"        value={fmtWei(tx.value)} />
                            <Row label="Gas Used"     value={tx.gasUsed ? Number(tx.gasUsed).toLocaleString() : '—'} />
                            <Row label="Gas Limit"    value={tx.gasLimit ? Number(tx.gasLimit).toLocaleString() : '—'} />
                            <Row label="Gas Price"    value={tx.gasPrice  ? (Number(tx.gasPrice) / 1e9).toFixed(2) + ' Gwei' : '—'} />
                            <Row label="Nonce"        value={tx.nonce} />
                            <Row label="Confirmations" value={tx.confirmations} />
                            {tx.data && tx.data !== '0x' && (
                                <Row label="Input Data" value={tx.data} mono copy />
                            )}
                        </>
                    ) : (
                        <>
                            {tx.resourceType && <Row label="Resource Type" value={tx.resourceType} />}
                            {tx.resourceId   && <Row label="Resource ID"   value={tx.resourceId} mono />}
                        </>
                    )}
                </div>
            </div>

            {/* related entities (MongoDB source) */}
            {!isChain && tx.relatedEntities && tx.relatedEntities.length > 0 && (
                <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
                    <div className="px-5 py-3 border-b border-outline-variant bg-surface-container-low">
                        <h2 className="font-public-sans text-label-lg font-semibold text-on-surface-variant text-xs uppercase tracking-wider">
                            Related Ledger Entities
                        </h2>
                    </div>
                    <div className="px-5 py-3 flex flex-col gap-2">
                        {tx.relatedEntities.map((e, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low border border-outline-variant">
                                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">
                                    {e.type === 'parcel'      ? 'landscape'         :
                                     e.type === 'titleDeed'  ? 'workspace_premium'  :
                                     e.type === 'transfer'   ? 'swap_horiz'         :
                                     e.type === 'dispute'    ? 'gavel'              :
                                     'lock'}
                                </span>
                                <div>
                                    <p className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase">{e.type}</p>
                                    <p className="font-mono text-sm text-on-surface">{e.id}</p>
                                </div>
                                {/* deep link to the resource */}
                                {e.type === 'parcel' && (
                                    <Link to={`/property/${e.id}`}
                                          className="ml-auto text-primary text-body-sm hover:underline flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                        View Parcel
                                    </Link>
                                )}
                                {e.type === 'transfer' && (
                                    <Link to={`/approvals`}
                                          className="ml-auto text-primary text-body-sm hover:underline flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                        Approvals
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* dev note when chain is unreachable */}
            {!isChain && (
                <div className="flex items-start gap-3 p-4 rounded-xl border"
                     style={{ background:'#fffbeb', borderColor:'#d97706' }}>
                    <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color:'#b45309' }}>info</span>
                    <div className="font-public-sans text-body-sm" style={{ color:'#78350f' }}>
                        <p className="font-semibold mb-0.5">Chain connection unavailable</p>
                        <p>
                            The Besu EVM node is unreachable at <code className="font-mono text-xs bg-yellow-100 px-1 rounded">{
                                process.env.REACT_APP_EXPLORER_BASE || 'http://127.0.0.1:8560'
                            }</code>.
                            Showing data from the LMBS MongoDB projection instead.
                            Start the Besu node to see full on-chain details.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
