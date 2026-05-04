/**
 * Transaction History - replicates `stitch/transaction_history/screen.png`.
 * Live data via /api/parcels/:pin/history + /api/certificates/:pin.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { downloadCSV, printPage } from '../components/actions';
import { parcelService, certificateService } from '../../services';

const SAMPLE_ROWS = [
    { date: '2023-10-15', event: 'Title Transfer',    principal: 'Apex Holdings Ltd.',    hash: '0x6892...a7b3e1', status: 'verified' },
    { date: '2021-04-22', event: 'Easement Update',   principal: 'City Utility Board',    hash: '0x3b4c...f1d2e3', status: 'verified' },
    { date: '2015-11-05', event: 'Subdivision',       principal: 'Harrison Estate',       hash: '0x9b8b...7c8d5e', status: 'verified' },
    { date: '2010-02-18', event: 'Legacy Digitation', principal: 'State Registry Office', hash: '0x1c21...3a4b5c', status: 'verified' },
];

function fmtDate(d) {
    if (!d) return '-';
    return new Date(d).toISOString().slice(0, 10);
}

function StatTile({ label, value, valueMono, sub, tone }) {
    return (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-md flex flex-col gap-2">
            <span className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
            <span className={'font-public-sans text-h3 font-semibold text-on-surface ' + (valueMono ? 'tabular-nums break-all' : '')}>
                {valueMono || value}
            </span>
            {sub && (tone === 'verified'
                ? <StatusBadge tone="verified" icon="check_circle">{sub}</StatusBadge>
                : <span className="font-public-sans text-body-sm text-on-surface-variant">{sub}</span>)}
        </div>
    );
}

export default function TransactionHistory() {
    const { pin = '8A-992' } = useParams();
    const navigate = useNavigate();
    const [rows, setRows] = useState(SAMPLE_ROWS);
    const [cert, setCert] = useState(null);
    const [filter, setFilter] = useState({ event: 'All', range: '12' });

    useEffect(() => {
        let cancelled = false;
        Promise.allSettled([
            parcelService.history(pin, { limit: 200 }),
            certificateService.get(pin),
        ]).then((results) => {
            if (cancelled) return;
            const [h, c] = results;
            if (h.status === 'fulfilled' && h.value && Array.isArray(h.value.events) && h.value.events.length) {
                setRows(h.value.events);
            }
            if (c.status === 'fulfilled') setCert(c.value);
        });
        return () => { cancelled = true; };
    }, [pin]);

    const filtered = useMemo(() => {
        let out = rows;
        if (filter.event !== 'All') out = out.filter((r) => r.event === filter.event);
        if (filter.range !== 'All') {
            const months = parseInt(filter.range, 10);
            const since = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
            out = out.filter((r) => new Date(r.date).getTime() >= since);
        }
        return out;
    }, [rows, filter]);

    return (
        <div className="p-margin max-w-container-max mx-auto w-full flex flex-col gap-stack-lg">
            <div className="flex justify-between items-center">
                <nav aria-label="Breadcrumb" className="font-public-sans text-body-sm text-on-surface-variant">
                    <Link to="/properties" className="hover:text-on-surface">Land Titles</Link>
                    <span className="mx-2 text-outline">/</span>
                    <Link to={'/property/' + encodeURIComponent(pin)} className="hover:text-on-surface">Parcel {pin}</Link>
                    <span className="mx-2 text-outline">/</span>
                    <span className="text-on-surface">History</span>
                </nav>
                <button
                    onClick={() => navigate('/certificate/' + encodeURIComponent(pin))}
                    className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors flex items-center gap-2 bg-surface-container-lowest"
                >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">verified</span>
                    Verify Title
                </button>
            </div>

            <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="font-public-sans text-h1 font-bold text-on-surface tracking-tight">Transaction History: Parcel {pin}</h1>
                    <p className="font-public-sans text-body-md text-on-surface-variant mt-2">Complete immutable provenance ledger recorded on the LMBS network.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => printPage()}
                        className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors flex items-center gap-2 bg-surface-container-lowest"
                    >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">picture_as_pdf</span>
                        Export PDF
                    </button>
                    <button
                        onClick={() => downloadCSV('lmbs-' + pin + '-transactions.csv', filtered)}
                        disabled={!filtered.length}
                        className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors flex items-center gap-2 bg-surface-container-lowest disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">table_chart</span>
                        Export CSV
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                <StatTile label="BLOCKCHAIN ID" valueMono={(cert && cert.did) || 'DID:LMBS:8F92A7B3...E1'} sub={cert && cert.verified ? 'VERIFIED NODE' : 'PENDING'} tone={cert && cert.verified ? 'verified' : 'pending'} />
                <StatTile label="CURRENT OWNER" value={(cert && cert.currentOwner) || 'Apex Holdings Ltd.'} sub="Corporate Entity" />
                <StatTile label="TOTAL AREA" value={cert && cert.areaM2 ? (Number(cert.areaM2).toLocaleString() + ' sq m') : '14,250 sq m'} sub="Geospatially Confirmed" />
            </div>

            <section className="bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col overflow-hidden">
                <div className="flex flex-wrap justify-between items-center gap-2 px-5 py-4 border-b border-outline-variant">
                    <h2 className="font-public-sans text-h3 font-semibold text-on-surface">Provenance Ledger</h2>
                    <div className="flex gap-2">
                        <select value={filter.event} onChange={(e) => setFilter({ ...filter, event: e.target.value })} className="px-3 py-1.5 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm bg-surface-container-lowest">
                            <option value="All">All Event Types</option>
                            <option>Title Issuance</option>
                            <option>Title Transfer</option>
                            <option>Easement Update</option>
                            <option>Subdivision</option>
                            <option>Encumbrance</option>
                            <option>Dispute Filed</option>
                            <option>Dispute Resolved</option>
                        </select>
                        <select value={filter.range} onChange={(e) => setFilter({ ...filter, range: e.target.value })} className="px-3 py-1.5 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm bg-surface-container-lowest">
                            <option value="12">Last 12 Months</option>
                            <option value="60">Last 5 Years</option>
                            <option value="All">All time</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-outline-variant">
                                {['DATE','EVENT TYPE','PRINCIPAL','TRANSACTION HASH','STATUS'].map((h) => (
                                    <th key={h} className="px-5 py-3 font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((row, i) => (
                                <tr key={row.id || i} className={'border-b border-outline-variant ' + (i % 2 ? 'bg-surface-container-low' : '')}>
                                    <td className="px-5 py-3 tabular-nums text-body-sm">{fmtDate(row.date)}</td>
                                    <td className="px-5 py-3 font-public-sans text-body-sm font-semibold">{row.event}</td>
                                    <td className="px-5 py-3 font-public-sans text-body-sm">
                                        {row.principal}
                                        {row.principalSub && (<div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{row.principalSub}</div>)}
                                    </td>
                                    <td className="px-5 py-3 tabular-nums text-body-sm">{row.hash || row.txId || '-'}</td>
                                    <td className="px-5 py-3">
                                        <StatusBadge tone={row.status || 'verified'} icon="check_circle">
                                            {(row.status || 'verified').toUpperCase()}
                                        </StatusBadge>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={5} className="px-5 py-8 text-center font-public-sans text-body-sm text-on-surface-variant">No matching transactions in this range.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-between items-center px-5 py-3 border-t border-outline-variant text-body-sm text-on-surface-variant">
                    <span>Showing {filtered.length} of {rows.length} transactions</span>
                </div>
            </section>
        </div>
    );
}
