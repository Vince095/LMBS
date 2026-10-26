/**
 * GISParcelHistory — Land Ledger Admin
 *
 * Fully functional admin explorer surface. Four tabs:
 *   Explorer    — satellite map + real parcel provenance timeline
 *   Ledger Audit— paginated event log with TX links
 *   Survey Data — parcel metadata, encumbrances, disputes
 *   System Config — network / Besu status
 *
 * Data:
 *   Search         → GET /api/parcels/search?q=…
 *   Parcel detail  → GET /api/parcels/:pin   (parcel + deed + enc + disputes)
 *   History        → GET /api/parcels/:pin/history
 *   GIS history    → GET /api/parcels/:pin/gis-history
 *   Network status → GET /api/network/status
 *
 * TX links use the internal /tx/:hash route (no more :8560 404s).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link }   from 'react-router-dom';
import { parcelService }   from '../../services/parcelService';
import { networkService }  from '../../services/networkService';
import { explorerUrl }     from '../components/actions';
import GoogleMap           from '../components/GoogleMap';

/* ─────────────────────────────────────────────────────────────────────────────
   Constants
───────────────────────────────────────────────────────────────────────────── */
const TABS = ['Explorer', 'Ledger Audit', 'Survey Data', 'System Config'];

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }).toUpperCase();
}
function fmtDateFull(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString();
}
function truncHash(h, n = 8) {
    if (!h) return '—';
    return h.length > n * 2 + 1 ? h.slice(0, n) + '…' + h.slice(-n) : h;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────────────────────────────────────── */

/* Search autocomplete */
function SearchBox({ onSelect }) {
    const [q,       setQ]       = useState('');
    const [results, setResults] = useState([]);
    const [open,    setOpen]    = useState(false);
    const [busy,    setBusy]    = useState(false);
    const timer = useRef(null);

    function handleChange(e) {
        const v = e.target.value;
        setQ(v);
        clearTimeout(timer.current);
        if (v.length < 2) { setResults([]); setOpen(false); return; }
        timer.current = setTimeout(async () => {
            setBusy(true);
            try {
                const data = await parcelService.search(v);
                setResults(data.parcels || []);
                setOpen(true);
            } catch { setResults([]); }
            finally { setBusy(false); }
        }, 300);
    }

    function pick(pin) {
        setQ(pin);
        setOpen(false);
        setResults([]);
        onSelect(pin);
    }

    return (
        <div className="relative flex-1 max-w-md">
            <div className="flex items-center gap-2 bg-surface-container-low border border-outline-variant rounded-lg px-3 py-1.5">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">search</span>
                <input
                    value={q}
                    onChange={handleChange}
                    onKeyDown={e => e.key === 'Enter' && results[0] && pick(results[0].pin)}
                    placeholder="Search parcel PIN, address, district…"
                    className="bg-transparent border-none outline-none w-full font-public-sans text-body-sm placeholder:text-outline"
                />
                {busy && <span className="material-symbols-outlined animate-spin text-[16px] text-on-surface-variant">progress_activity</span>}
            </div>
            {open && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-surface rounded-xl shadow-xl border border-outline-variant overflow-hidden">
                    {results.slice(0, 8).map(p => (
                        <button key={p.pin} onClick={() => pick(p.pin)}
                                className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-surface-container-low text-left transition-colors border-b border-outline-variant last:border-0">
                            <span className="material-symbols-outlined text-primary text-[18px] mt-0.5">landscape</span>
                            <div>
                                <p className="font-mono text-sm font-semibold text-on-surface">{p.pin}</p>
                                <p className="font-public-sans text-xs text-on-surface-variant">
                                    {[p.district, p.landUse, p.currentOwner].filter(Boolean).join(' · ')}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/* Parcel info card overlaid on the map */
function ParcelCard({ pin, parcel, deed, gisEvents }) {
    const events = gisEvents?.length
        ? gisEvents.map(e => ({ date: fmtDate(e.date), tone: e.tone || '#475569', title: e.label || e.event, body: e.body || '' }))
        : [{ date: '—', tone: '#94a3b8', title: 'No events yet', body: 'Register a parcel to see its history.' }];

    return (
        <div className="absolute top-4 left-4 w-[300px] bg-surface-container-lowest border border-outline-variant rounded-xl shadow-xl flex flex-col max-h-[calc(100%-2rem)] overflow-y-auto">
            {/* header */}
            <div className="p-4 border-b border-outline-variant">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h2 className="font-public-sans text-body-md font-bold text-on-surface">Parcel: {pin}</h2>
                        {parcel?.legacyAddress && (
                            <p className="font-public-sans text-xs text-on-surface-variant mt-0.5">{parcel.legacyAddress}</p>
                        )}
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ background: parcel?.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                                   color:      parcel?.status === 'ACTIVE' ? '#166534' : '#991b1b' }}>
                        <span className="material-symbols-outlined text-[11px]">{parcel?.status === 'ACTIVE' ? 'check_circle' : 'warning'}</span>
                        {parcel?.status || 'UNKNOWN'}
                    </span>
                </div>
            </div>

            {/* metadata */}
            {parcel && (
                <div className="p-4 border-b border-outline-variant">
                    <p className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider mb-2">Current Metadata</p>
                    <table className="w-full text-xs font-public-sans">
                        <tbody>
                            <tr><td className="text-on-surface-variant py-0.5">Area</td>
                                <td className="text-on-surface text-right">{parcel.areaM2 ? (parcel.areaM2 / 10000).toFixed(3) + ' Ha' : '—'}</td></tr>
                            <tr><td className="text-on-surface-variant py-0.5">Land Use</td>
                                <td className="text-on-surface text-right">{parcel.landUse || '—'}</td></tr>
                            <tr><td className="text-on-surface-variant py-0.5">District</td>
                                <td className="text-on-surface text-right">{parcel.district || '—'}</td></tr>
                            <tr><td className="text-on-surface-variant py-0.5">Deed No.</td>
                                <td className="text-on-surface text-right font-mono">{deed?.deedNumber || parcel.titleDeedRef || '—'}</td></tr>
                            <tr><td className="text-on-surface-variant py-0.5">Owner</td>
                                <td className="text-on-surface text-right">{deed?.owners?.[0]?.fullName || '—'}</td></tr>
                            {parcel.blockchainTxId && (
                                <tr><td className="text-on-surface-variant py-0.5">Ledger Hash</td>
                                    <td className="text-right">
                                        <Link to={explorerUrl(parcel.blockchainTxId)}
                                              className="font-mono text-xs text-primary hover:underline">
                                            {truncHash(parcel.blockchainTxId, 5)}
                                        </Link>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* GIS timeline */}
            <div className="p-4">
                <p className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider mb-3">
                    Parcel History
                </p>
                <ol className="flex flex-col gap-3">
                    {events.map((h, i) => (
                        <li key={i} className="flex gap-2">
                            <div className="mt-1 w-2 h-2 rounded-full shrink-0"
                                 style={{ background: h.tone, boxShadow: '0 0 0 3px ' + h.tone + '33' }} />
                            <div>
                                <span className="font-public-sans text-label-caps font-bold uppercase tracking-wider block"
                                      style={{ color: h.tone, fontSize:'10px' }}>{h.date}</span>
                                <span className="font-public-sans text-xs font-semibold text-on-surface block">{h.title}</span>
                                {h.body && <span className="font-public-sans text-xs text-on-surface-variant">{h.body}</span>}
                            </div>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}

/* Map layers toggles */
function Toggle({ label, defaultChecked, tint }) {
    const [on, setOn] = useState(!!defaultChecked);
    return (
        <button onClick={() => setOn(v => !v)} aria-pressed={on}
                className="flex items-center justify-between w-full py-1.5 font-public-sans text-xs">
            <span className="text-on-surface">{label}</span>
            <span className="w-8 h-4 rounded-full relative transition-colors"
                  style={{ background: on ? (tint || '#0F172A') : '#c6c6cd' }}>
                <span className="absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all"
                      style={{ left: on ? 16 : 2 }} />
            </span>
        </button>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB: Ledger Audit — full provenance event table
───────────────────────────────────────────────────────────────────────────── */
function LedgerAuditTab({ events, loading, yearFilter, pin }) {
    const navigate = useNavigate();
    const filtered = yearFilter
        ? events.filter(e => e.date && new Date(e.date).getFullYear() === yearFilter)
        : events;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
            </div>
        );
    }
    if (!pin) {
        return (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl opacity-40">manage_search</span>
                <p className="font-public-sans text-body-sm">Search and select a parcel to view its ledger audit trail.</p>
            </div>
        );
    }
    if (filtered.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl opacity-40">history</span>
                <p className="font-public-sans text-body-sm">No events{yearFilter ? ` in ${yearFilter}` : ''} for parcel {pin}.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-outline-variant bg-surface-container-low">
                        {['Date','Event','Actor','Tx Hash','Status'].map(h => (
                            <th key={h} className="px-4 py-2.5 font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(e => (
                        <tr key={e.id} className="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
                            <td className="px-4 py-2.5 font-public-sans text-xs text-on-surface-variant whitespace-nowrap">
                                {fmtDate(e.date)}
                            </td>
                            <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[14px]"
                                          style={{ color: e.eventColor || '#475569' }}>
                                        {e.eventIcon || 'radio_button_checked'}
                                    </span>
                                    <span className="font-public-sans text-xs font-semibold text-on-surface">{e.event}</span>
                                </div>
                                {e.principalSub && (
                                    <p className="font-public-sans text-xs text-on-surface-variant ml-6">{e.principalSub}</p>
                                )}
                            </td>
                            <td className="px-4 py-2.5 font-public-sans text-xs text-on-surface max-w-[140px] truncate">
                                {e.principal || '—'}
                            </td>
                            <td className="px-4 py-2.5">
                                {e.txId && e.txId !== '—' ? (
                                    <button onClick={() => navigate(explorerUrl(e.txId))}
                                            className="font-mono text-xs text-primary hover:underline">
                                        {truncHash(e.txId, 6)}
                                    </button>
                                ) : (
                                    <span className="font-mono text-xs text-on-surface-variant">{e.hash || '—'}</span>
                                )}
                            </td>
                            <td className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                                      style={{
                                          background: e.status === 'verified'  ? '#dcfce7'
                                                    : e.status === 'pending'   ? '#fef3c7'
                                                    : e.status === 'cancelled' ? '#f1f5f9'
                                                    : '#fee2e2',
                                          color:      e.status === 'verified'  ? '#166534'
                                                    : e.status === 'pending'   ? '#92400e'
                                                    : e.status === 'cancelled' ? '#475569'
                                                    : '#991b1b',
                                      }}>
                                    {(e.status || 'verified').toUpperCase()}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB: Survey Data — metadata + encumbrances + disputes
───────────────────────────────────────────────────────────────────────────── */
function SurveyDataTab({ parcel, deed, encumbrances, disputes, pin }) {
    if (!pin || !parcel) {
        return (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl opacity-40">straighten</span>
                <p className="font-public-sans text-body-sm">Search and select a parcel to view its survey data.</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5">
            {/* Parcel attributes */}
            <div className="rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant">
                    <p className="font-public-sans text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Parcel Attributes</p>
                </div>
                <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-public-sans">
                    {[
                        ['PIN',        parcel.pin],
                        ['District',   parcel.district],
                        ['Land Use',   parcel.landUse],
                        ['Area',       parcel.areaM2 ? (parcel.areaM2/10000).toFixed(4)+' Ha' : '—'],
                        ['Status',     parcel.status],
                        ['Token ID',   parcel.tokenId ?? '—'],
                        ['Address',    parcel.legacyAddress || '—'],
                        ['Registered', fmtDateFull(parcel.createdAt)],
                    ].map(([k, v]) => (
                        <div key={k}>
                            <p className="text-on-surface-variant">{k}</p>
                            <p className="text-on-surface font-semibold break-all">{v || '—'}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Active deed */}
            <div className="rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant">
                    <p className="font-public-sans text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Active Title Deed</p>
                </div>
                {deed ? (
                    <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-public-sans">
                        {[
                            ['Deed No.',  deed.deedNumber],
                            ['Status',    deed.status],
                            ['Issued By', deed.issuedBy],
                            ['Issued At', fmtDateFull(deed.issuedAt)],
                        ].map(([k, v]) => (
                            <div key={k}>
                                <p className="text-on-surface-variant">{k}</p>
                                <p className="text-on-surface font-semibold break-all">{v || '—'}</p>
                            </div>
                        ))}
                        {deed.owners?.length > 0 && (
                            <div className="col-span-2">
                                <p className="text-on-surface-variant mb-1">Owners</p>
                                {deed.owners.map((o, i) => (
                                    <p key={i} className="text-on-surface font-semibold">{o.fullName} ({o.percentage}%)</p>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-4 text-xs text-on-surface-variant italic">No active title deed.</div>
                )}
            </div>

            {/* Encumbrances */}
            <div className="rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
                    <p className="font-public-sans text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Encumbrances</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: encumbrances?.filter(e=>e.status==='ACTIVE').length ? '#fee2e2' : '#dcfce7',
                                   color:      encumbrances?.filter(e=>e.status==='ACTIVE').length ? '#991b1b' : '#166534' }}>
                        {encumbrances?.filter(e=>e.status==='ACTIVE').length || 0} active
                    </span>
                </div>
                {encumbrances?.length ? (
                    <div className="divide-y divide-outline-variant">
                        {encumbrances.map(enc => (
                            <div key={enc.encumbranceId} className="px-4 py-3 text-xs">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-semibold text-on-surface">{enc.type}</span>
                                    <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                                          style={{ background: enc.status==='ACTIVE'?'#fee2e2':'#dcfce7',
                                                   color: enc.status==='ACTIVE'?'#991b1b':'#166534' }}>
                                        {enc.status}
                                    </span>
                                </div>
                                <p className="text-on-surface-variant">{enc.holder?.name}</p>
                                {enc.amountLSL > 0 && <p className="text-on-surface">LSL {Number(enc.amountLSL).toLocaleString()}</p>}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-4 text-xs text-on-surface-variant italic">No encumbrances on record.</div>
                )}
            </div>

            {/* Disputes */}
            <div className="rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
                    <p className="font-public-sans text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Disputes</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{ background: disputes?.filter(d=>['OPEN','UNDER_REVIEW'].includes(d.status)).length ? '#fef3c7' : '#dcfce7',
                                   color: disputes?.filter(d=>['OPEN','UNDER_REVIEW'].includes(d.status)).length ? '#92400e' : '#166534' }}>
                        {disputes?.filter(d=>['OPEN','UNDER_REVIEW'].includes(d.status)).length || 0} open
                    </span>
                </div>
                {disputes?.length ? (
                    <div className="divide-y divide-outline-variant">
                        {disputes.map(d => (
                            <div key={d.disputeId} className="px-4 py-3 text-xs">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="font-mono font-semibold text-on-surface">{d.disputeId}</span>
                                    <span className="px-1.5 py-0.5 rounded text-xs font-bold"
                                          style={{ background: ['OPEN','UNDER_REVIEW'].includes(d.status) ? '#fef3c7' : '#dcfce7',
                                                   color: ['OPEN','UNDER_REVIEW'].includes(d.status) ? '#92400e' : '#166534' }}>
                                        {d.status}
                                    </span>
                                </div>
                                <p className="text-on-surface-variant line-clamp-2">{d.description}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-4 text-xs text-on-surface-variant italic">No disputes on record.</div>
                )}
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB: System Config — network / Besu status
───────────────────────────────────────────────────────────────────────────── */
function SystemConfigTab() {
    const [net, setNet]   = useState(null);
    const [busy, setBusy] = useState(true);

    useEffect(() => {
        networkService.status()
            .then(setNet)
            .catch(() => setNet({ reachable: false, error: 'Could not reach backend' }))
            .finally(() => setBusy(false));
    }, []);

    if (busy) {
        return <div className="flex justify-center p-10"><span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span></div>;
    }

    const rows = net ? [
        ['RPC URL',          net.rpcUrl],
        ['Chain ID',         net.chainId ?? '—'],
        ['Latest Block',     net.blockNumber != null ? `#${net.blockNumber.toLocaleString()}` : '—'],
        ['Peer Count',       net.peerCount ?? '—'],
        ['Validator Count',  net.validatorCount ?? '—'],
        ['Latency',          net.latencyMs != null ? net.latencyMs + ' ms' : '—'],
        ['Node Status',      net.reachable ? 'REACHABLE' : 'UNREACHABLE'],
        ['Synced',           net.synced ? 'YES' : 'NO'],
    ] : [];

    return (
        <div className="p-5 max-w-2xl">
            {/* status banner */}
            <div className="flex items-center gap-3 p-4 rounded-xl border mb-5"
                 style={{ background: net?.reachable ? '#f0fdf4' : '#fef2f2',
                          borderColor: net?.reachable ? '#86efac' : '#fca5a5' }}>
                <span className="material-symbols-outlined text-[22px]"
                      style={{ color: net?.reachable ? '#16a34a' : '#dc2626' }}>
                    {net?.reachable ? 'check_circle' : 'cancel'}
                </span>
                <div>
                    <p className="font-semibold text-sm" style={{ color: net?.reachable ? '#166534' : '#991b1b' }}>
                        {net?.reachable ? 'Besu EVM Node: Online' : 'Besu EVM Node: Unreachable'}
                    </p>
                    {net?.error && <p className="text-xs" style={{ color:'#991b1b' }}>{net.error}</p>}
                </div>
            </div>

            <div className="rounded-xl border border-outline-variant overflow-hidden">
                <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant">
                    <p className="font-public-sans text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Network Parameters</p>
                </div>
                <div className="divide-y divide-outline-variant">
                    {rows.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between px-4 py-3 text-xs font-public-sans">
                            <span className="text-on-surface-variant">{k}</span>
                            <span className="font-semibold text-on-surface font-mono">{v}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════════════════ */
export default function GISParcelHistory() {
    const { pin: urlPin } = useParams();
    const navigate        = useNavigate();

    const [activeTab,   setActiveTab]   = useState(0);
    const [pin,         setPin]         = useState(urlPin || '');
    const [year,        setYear]        = useState(new Date().getFullYear());

    // Parcel data
    const [detail,      setDetail]      = useState(null);  // { parcel, deed, encumbrances, disputes }
    const [events,      setEvents]      = useState([]);
    const [gisEvents,   setGisEvents]   = useState([]);
    const [loadingData, setLoadingData] = useState(false);

    /* load parcel when pin changes */
    const loadParcel = useCallback(async (p) => {
        if (!p) return;
        setLoadingData(true);
        try {
            const [det, hist, gis] = await Promise.allSettled([
                parcelService.getDetail(p),
                parcelService.history(p),
                parcelService.gisHistory(p),
            ]);
            if (det.status  === 'fulfilled') setDetail(det.value);
            if (hist.status === 'fulfilled') setEvents((hist.value?.events) || []);
            if (gis.status  === 'fulfilled') setGisEvents(Array.isArray(gis.value) ? gis.value : []);
        } catch { /* silently ignore */ }
        finally { setLoadingData(false); }
    }, []);

    useEffect(() => {
        if (urlPin) { setPin(urlPin); loadParcel(urlPin); }
    }, [urlPin, loadParcel]);

    function handleSelect(selectedPin) {
        setPin(selectedPin);
        setDetail(null);
        setEvents([]);
        setGisEvents([]);
        navigate(`/parcel-history/${encodeURIComponent(selectedPin)}`, { replace: true });
        loadParcel(selectedPin);
    }

    const parcel       = detail?.parcel;
    const deed         = detail?.deed;
    const encumbrances = detail?.encumbrances || [];
    const disputes     = detail?.disputes     || [];

    /* map center from parcel GeoJSON or default to Maseru */
    const mapCenter = parcel?.location?.coordinates?.[0]?.[0]
        ? [parcel.location.coordinates[0][0][0], parcel.location.coordinates[0][0][1]]
        : [27.4833, -29.3167];
    const mapPolygon = parcel?.location?.coordinates?.[0] || null;

    /* years for timeline scrubber */
    const allYears = events.length
        ? [...new Set(events.map(e => e.date ? new Date(e.date).getFullYear() : null).filter(Boolean))].sort()
        : [];
    const yearMin = allYears[0] || 1990;
    const yearMax = allYears[allYears.length - 1] || new Date().getFullYear();

    return (
        <div className="flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>

            {/* ── Top bar ─────────────────────────────────────────────────── */}
            <header className="flex items-center justify-between px-5 h-12 bg-surface-container-lowest border-b border-outline-variant shrink-0 gap-4">
                {/* Search */}
                <SearchBox onSelect={handleSelect} />

                {/* Brand */}
                <div className="flex items-center gap-2 font-public-sans text-body-sm font-bold text-on-surface whitespace-nowrap">
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings:"'FILL' 1" }}>account_balance</span>
                    Land Ledger Admin
                </div>

                {/* Tabs */}
                <nav className="flex items-center gap-1">
                    {TABS.map((tab, i) => (
                        <button key={tab} onClick={() => setActiveTab(i)}
                                className={`px-3 py-1.5 rounded-md font-public-sans text-xs font-semibold transition-colors ${
                                    activeTab === i
                                        ? 'bg-surface-container-high text-on-surface'
                                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'
                                }`}>
                            {tab}
                        </button>
                    ))}
                </nav>
            </header>

            {/* ── Content area ────────────────────────────────────────────── */}
            <div className="flex flex-1 min-h-0">

                {/* Left sidebar */}
                <aside className="w-52 shrink-0 border-r border-outline-variant bg-surface-container-lowest flex flex-col p-3 gap-3 overflow-y-auto">
                    {/* Verified badge */}
                    <div className="bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-2">
                        <p className="font-public-sans text-xs font-bold text-emerald-800">Directorate of Lands</p>
                        <span className="inline-flex items-center gap-1 font-public-sans text-label-caps font-bold uppercase tracking-wider text-emerald-700 text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            BLOCKCHAIN VERIFIED
                        </span>
                    </div>

                    {/* Parcel stats if loaded */}
                    {pin && parcel && (
                        <div className="rounded-lg border border-outline-variant p-3 flex flex-col gap-2">
                            <p className="font-public-sans text-label-caps text-on-surface-variant text-[10px] uppercase tracking-wider">Current Parcel</p>
                            <p className="font-mono text-xs font-bold text-on-surface">{pin}</p>
                            <div className="grid grid-cols-2 gap-1 text-[10px]">
                                <div className="text-on-surface-variant">Status</div>
                                <div className="text-right font-semibold" style={{ color: parcel.status === 'ACTIVE' ? '#166534' : '#991b1b' }}>{parcel.status}</div>
                                <div className="text-on-surface-variant">Events</div>
                                <div className="text-right font-semibold text-on-surface">{events.length}</div>
                                <div className="text-on-surface-variant">Encumb.</div>
                                <div className="text-right font-semibold" style={{ color: encumbrances.filter(e=>e.status==='ACTIVE').length ? '#991b1b' : '#166534' }}>
                                    {encumbrances.filter(e=>e.status==='ACTIVE').length}
                                </div>
                                <div className="text-on-surface-variant">Disputes</div>
                                <div className="text-right font-semibold" style={{ color: disputes.filter(d=>['OPEN','UNDER_REVIEW'].includes(d.status)).length ? '#92400e' : '#166534' }}>
                                    {disputes.filter(d=>['OPEN','UNDER_REVIEW'].includes(d.status)).length}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Map layer toggles (Explorer tab only) */}
                    {activeTab === 0 && (
                        <div className="rounded-lg border border-outline-variant p-3">
                            <p className="font-public-sans text-label-caps text-on-surface-variant text-[10px] uppercase tracking-wider mb-2">Map Layers</p>
                            <Toggle label="Satellite Imagery"     defaultChecked tint="#059669" />
                            <Toggle label="Historical Boundaries" defaultChecked tint="#F59E0B" />
                            <Toggle label="Utility Lines" />
                        </div>
                    )}

                    {/* Quick actions */}
                    <div className="mt-auto flex flex-col gap-2">
                        <button onClick={() => navigate('/register-parcel')}
                                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-primary text-white rounded-lg font-public-sans text-xs font-semibold hover:opacity-90">
                            <span className="material-symbols-outlined text-[14px]">add</span>
                            New Parcel Entry
                        </button>
                        {pin && (
                            <Link to={`/property/${pin}`}
                                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 border border-outline rounded-lg font-public-sans text-xs text-on-surface hover:bg-surface-container-low">
                                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                View Property
                            </Link>
                        )}
                    </div>
                </aside>

                {/* Main content */}
                <div className="flex-1 min-w-0 flex flex-col">

                    {/* ── Explorer tab: map ──────────────────────────────── */}
                    {activeTab === 0 && (
                        <div className="relative flex-1">
                            {loadingData && (
                                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20">
                                    <span className="material-symbols-outlined animate-spin text-white text-5xl">progress_activity</span>
                                </div>
                            )}

                            <GoogleMap
                                title="Land Ledger Admin parcel map"
                                center={mapCenter}
                                zoom={pin ? 16 : 12}
                                mapType="satellite"
                                polygon={mapPolygon}
                                style={{ position:'absolute', inset:0 }}
                            />

                            {/* Parcel info card */}
                            {pin && (
                                <ParcelCard
                                    pin={pin}
                                    parcel={parcel}
                                    deed={deed}
                                    gisEvents={gisEvents}
                                />
                            )}

                            {/* Empty state */}
                            {!pin && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="bg-surface-container-lowest/90 backdrop-blur rounded-2xl p-8 text-center max-w-sm border border-outline-variant shadow-xl">
                                        <span className="material-symbols-outlined text-5xl text-on-surface-variant block mb-3 opacity-50">map</span>
                                        <h3 className="font-public-sans text-title-sm font-bold text-on-surface mb-2">Search for a Parcel</h3>
                                        <p className="font-public-sans text-body-sm text-on-surface-variant">
                                            Use the search bar above to find a parcel by PIN, address, or district.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Timeline scrubber */}
                            {pin && events.length > 0 && (
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-4 bg-surface-container-lowest border border-outline-variant rounded-full shadow-xl flex items-center gap-3 pl-3 pr-5 py-2 min-w-[420px]">
                                    <span className="font-public-sans text-xs text-on-surface-variant whitespace-nowrap">{yearMin}</span>
                                    <input type="range" min={yearMin} max={yearMax} value={year}
                                           onChange={e => setYear(Number(e.target.value))}
                                           className="flex-1 accent-primary" />
                                    <span className="font-public-sans text-xs font-bold text-on-surface w-10 text-right">{year}</span>
                                    {/* dot indicators */}
                                    <div className="flex gap-1 ml-2">
                                        {allYears.map(y => (
                                            <button key={y} onClick={() => setYear(y)}
                                                    className="w-2 h-2 rounded-full transition-all"
                                                    style={{ background: y === year ? 'var(--imm-primary-container, #7986cb)' : '#cbd5e1' }}
                                                    title={String(y)} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Ledger Audit tab ──────────────────────────────── */}
                    {activeTab === 1 && (
                        <div className="flex-1 overflow-y-auto">
                            {/* year filter bar */}
                            {allYears.length > 0 && (
                                <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant bg-surface-container-lowest">
                                    <span className="font-public-sans text-xs text-on-surface-variant">Filter by year:</span>
                                    <button onClick={() => setYear(null)}
                                            className={`px-2 py-0.5 rounded text-xs font-semibold ${!year ? 'bg-primary text-white' : 'border border-outline text-on-surface hover:bg-surface-container-low'}`}>
                                        All
                                    </button>
                                    {allYears.map(y => (
                                        <button key={y} onClick={() => setYear(y)}
                                                className={`px-2 py-0.5 rounded text-xs font-semibold ${year === y ? 'bg-primary text-white' : 'border border-outline text-on-surface hover:bg-surface-container-low'}`}>
                                            {y}
                                        </button>
                                    ))}
                                    <span className="ml-auto font-public-sans text-xs text-on-surface-variant">
                                        {year
                                            ? events.filter(e => e.date && new Date(e.date).getFullYear() === year).length
                                            : events.length} events
                                    </span>
                                </div>
                            )}
                            <LedgerAuditTab events={events} loading={loadingData} yearFilter={year} pin={pin} />
                        </div>
                    )}

                    {/* ── Survey Data tab ───────────────────────────────── */}
                    {activeTab === 2 && (
                        <div className="flex-1 overflow-y-auto">
                            <SurveyDataTab
                                parcel={parcel} deed={deed}
                                encumbrances={encumbrances} disputes={disputes}
                                pin={pin}
                            />
                        </div>
                    )}

                    {/* ── System Config tab ────────────────────────────── */}
                    {activeTab === 3 && (
                        <div className="flex-1 overflow-y-auto">
                            <SystemConfigTab />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
