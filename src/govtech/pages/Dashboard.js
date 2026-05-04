/**
 * Dashboard - replicates `stitch/lmbs_dashboard/screen.png`.
 * Live data from /api/dashboard + /api/network with graceful fallback.
 * Recent registrations rows are clickable - navigate to the parcel.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import GoogleMap from '../components/GoogleMap';
import { downloadCSV } from '../components/actions';
import { dashboardService, networkService } from '../../services';

// Maseru, Lesotho - centre of the seeded sample parcels.
const LMBS_CENTRE = [27.4900, -29.3120];
const SAMPLE_POLYGON = [
    [27.4900, -29.3120], [27.4920, -29.3120],
    [27.4920, -29.3140], [27.4900, -29.3140],
    [27.4900, -29.3120],
];

const SAMPLE_RECENT = [
    { hash: '0x7A9B...2F...', parcelRef: 'GEO-89-204-A', owner: 'Metro Holdings LLC',     status: 'verified', time: '1m' },
    { hash: '0x3C4D...9E...', parcelRef: 'GEO-12-005-B', owner: 'Sarah Jenkins',           status: 'pending',  time: '2h' },
    { hash: '0x9F1E...4B2D', parcelRef: 'GEO-55-912-C', owner: 'Crestwood Development',    status: 'disputed', time: '1d' },
    { hash: '0x1A2B...3C...', parcelRef: 'GEO-88-101-Z', owner: 'Municipal Trust',         status: 'verified', time: '3d' },
];

function fmt(n) {
    if (n === undefined || n === null) return '-';
    return Number(n).toLocaleString();
}

function pickMetrics(stats, network) {
    const delta = stats.verifiedDeltaPct == null ? 0 : stats.verifiedDeltaPct;
    return [
        {
            label: 'TOTAL VERIFIED TITLES',
            value: fmt(stats.totalVerifiedTitles),
            delta: delta >= 0 ? ('+' + delta + '%') : (delta + '%'),
            deltaTone: delta >= 0 ? 'good' : 'neutral',
            icon: 'account_balance',
            progress: 0.85,
            progressClass: 'bg-primary-container',
        },
        {
            label: 'ACTIVE NODE VALIDATORS',
            value: fmt(network.validatorCount == null ? stats.activeNodeValidators : network.validatorCount),
            delta: network.reachable ? 'Stable Network' : 'Network unreachable',
            deltaTone: 'neutral',
            icon: 'hub',
            progress: 1.0,
            progressClass: 'bg-outline-variant',
        },
        {
            label: 'PENDING TRANSACTIONS',
            value: fmt(stats.pendingTransactions),
            delta: 'Awaiting consensus',
            deltaTone: 'neutral',
            icon: 'pending_actions',
            progress: 0.15,
            progressClass: 'bg-surface-tint',
        },
    ];
}

function MetricCard({ label, value, delta, deltaTone, icon, progress, progressClass }) {
    const deltaColor = deltaTone === 'good' ? 'text-tertiary-fixed-dim' : 'text-outline';
    return (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-md flex flex-col gap-4">
            <div className="flex justify-between items-start">
                <span className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
                <span className="material-symbols-outlined text-tertiary-fixed-dim" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">{icon}</span>
            </div>
            <div className="flex items-baseline gap-2">
                <span className="font-public-sans text-h2 font-semibold text-on-surface tabular-nums">{value}</span>
                <span className={'font-public-sans text-body-sm flex items-center ' + deltaColor}>{delta}</span>
            </div>
            <div className="w-full h-1 bg-surface-container mt-auto rounded-full overflow-hidden">
                <div className={'h-full ' + progressClass} style={{ width: (progress * 100) + '%' }} />
            </div>
        </div>
    );
}

function RecentRegistrations({ rows }) {
    const navigate = useNavigate();
    return (
        <div className="xl:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-5 py-4 border-b border-outline-variant">
                <h2 className="font-public-sans text-h3 font-semibold text-on-surface">Recent Registrations</h2>
                <a className="font-public-sans text-body-sm text-on-surface-variant hover:text-on-surface" href="/properties">View Full Ledger</a>
            </div>
            <table className="w-full text-left">
                <thead>
                    <tr className="border-b border-outline-variant">
                        <th className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider px-5 py-3 font-bold">HASH ID</th>
                        <th className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider px-5 py-3 font-bold">PARCEL REF</th>
                        <th className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider px-5 py-3 font-bold">OWNER / ENTITY</th>
                        <th className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider px-5 py-3 font-bold">STATUS</th>
                        <th className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider px-5 py-3 font-bold">TIME</th>
                    </tr>
                </thead>
                <tbody>
                    {(rows || []).map((row, i) => (
                        <tr
                            key={i}
                            onClick={() => row.parcelRef && navigate('/property/' + encodeURIComponent(row.parcelRef))}
                            className={'border-b border-outline-variant last:border-b-0 cursor-pointer hover:bg-surface-container-low transition-colors ' + (i % 2 ? 'bg-surface-container-low' : '')}
                            title={row.parcelRef ? ('Open ' + row.parcelRef) : ''}
                        >
                            <td className="px-5 py-3 tabular-nums text-body-sm">{row.hash}</td>
                            <td className="px-5 py-3 font-public-sans text-body-sm">{row.parcelRef}</td>
                            <td className="px-5 py-3 font-public-sans text-body-sm">{row.owner}</td>
                            <td className="px-5 py-3">
                                <StatusBadge tone={row.status}>
                                    {row.status === 'verified' && 'Verified'}
                                    {row.status === 'pending' && 'Pending'}
                                    {row.status === 'disputed' && 'Disputed'}
                                </StatusBadge>
                            </td>
                            <td className="px-5 py-3 tabular-nums text-body-sm text-on-surface-variant">{row.time}</td>
                        </tr>
                    ))}
                    {(!rows || rows.length === 0) && (
                        <tr><td colSpan={5} className="px-5 py-8 text-center font-public-sans text-body-sm text-on-surface-variant">No registrations yet.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

function GeoLedgerPanel({ network }) {
    const synced = network && network.synced;
    return (
        <aside aria-label="Live Geo-Ledger preview" className="xl:col-span-4 bg-surface-container-low border border-outline-variant rounded-xl p-stack-md flex flex-col gap-4 min-h-[260px]">
            <div className="flex items-center gap-2">
                <span className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">LIVE GEO-LEDGER</span>
                <span className="ml-auto inline-flex items-center gap-1.5 font-public-sans text-body-sm" style={{ color: synced ? '#059669' : '#76777d' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: synced ? '#059669' : '#76777d' }} aria-hidden="true" />
                    {synced ? ('Block #' + (network.blockNumber || 0).toLocaleString()) : 'Awaiting sync'}
                </span>
            </div>
            <GoogleMap
                title="Live Geo-Ledger preview"
                center={LMBS_CENTRE}
                zoom={15}
                mapType="hybrid"
                polygon={SAMPLE_POLYGON}
                className="flex-1 rounded-lg"
                style={{ minHeight: 220 }}
            />
        </aside>
    );
}

export default function Dashboard() {
    const [stats, setStats] = useState({});
    const [network, setNetwork] = useState({});
    const [recent, setRecent] = useState(SAMPLE_RECENT);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        Promise.allSettled([
            dashboardService.stats(),
            dashboardService.recentRegistrations(),
            networkService.status(),
        ]).then((results) => {
            if (cancelled) return;
            const [s, r, n] = results;
            if (s.status === 'fulfilled') setStats(s.value);
            if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length) setRecent(r.value);
            if (n.status === 'fulfilled') setNetwork(n.value);
            const failed = results.find((x) => x.status === 'rejected');
            if (failed) setError((failed.reason && failed.reason.message) || 'Backend unreachable - showing demo data');
        });
        return () => { cancelled = true; };
    }, []);

    const metrics = pickMetrics(stats, network);

    return (
        <div className="p-margin max-w-container-max mx-auto w-full flex flex-col gap-stack-lg">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="font-public-sans text-h1 font-bold text-on-surface tracking-tight">Dashboard</h1>
                    <p className="font-public-sans text-body-md text-on-surface-variant mt-2">System overview and real-time ledger metrics.</p>
                    {error && <p role="status" className="font-public-sans text-body-sm text-on-surface-variant mt-1">{error}</p>}
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => downloadCSV('lmbs-recent-registrations.csv', recent)}
                        disabled={!recent || recent.length === 0}
                        className="px-4 py-2 bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-public-sans text-body-sm rounded-DEFAULT hover:bg-surface-container-low transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
                        Export Ledger
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
                {metrics.map((m) => <MetricCard key={m.label} {...m} />)}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter">
                <RecentRegistrations rows={recent} />
                <GeoLedgerPanel network={network} />
            </div>
        </div>
    );
}
