/**
 * Search & Map — replicates `stitch/land_search_map_view/screen.png`.
 *
 * Layout: a 360px Parcel Search panel on the left (district selector,
 * blockchain parcel ID input, registered owner input, results stack), and a
 * full-bleed map canvas on the right with a floating GIS Viewport panel in
 * the bottom-left.
 */

import React, { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import GoogleMap from '../components/GoogleMap';
import { searchService } from '../../services';

const DISTRICTS = ['All Districts', 'Maseru', 'Berea', 'Leribe', 'Mafeteng', 'Mokhotlong'];

const SAMPLE_RESULTS = [
    { pin: 'PRCL-8821-A', sector: 'Sector 7G, Industrial Quadrant',  status: 'verified', hash: '0x4b...a19f' },
    { pin: 'PRCL-8822-B', sector: 'Sector 7G, Commercial Zone',      status: 'pending',  hash: 'Awaiting block...' },
    { pin: 'PRCL-9014-X', sector: 'Northern Grid, Residential',      status: 'disputed', hash: '0x9c...f44b' },
];

function SearchPanel({ filters, setFilters, onSearch, results, latencyMs }) {
    return (
        <aside className="w-full lg:w-[360px] shrink-0 bg-surface-container-lowest border-r border-outline-variant flex flex-col">
            <div className="p-margin border-b border-outline-variant">
                <h1 className="font-public-sans text-h2 font-semibold text-on-surface">Parcel Search</h1>
                <p className="font-public-sans text-body-md text-on-surface-variant mt-1">
                    Query immutable land records.
                </p>
            </div>

            <form
                onSubmit={(e) => { e.preventDefault(); onSearch(); }}
                className="px-margin py-stack-md flex flex-col gap-stack-md border-b border-outline-variant"
            >
                <label className="flex flex-col gap-1">
                    <span className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">
                        DISTRICT / ZONE
                    </span>
                    <select
                        value={filters.district}
                        onChange={(e) => setFilters({ ...filters, district: e.target.value })}
                        className="px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm focus:outline-none focus:border-tertiary-fixed-dim"
                    >
                        {DISTRICTS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                </label>

                <label className="flex flex-col gap-1">
                    <span className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">
                        BLOCKCHAIN PARCEL ID
                    </span>
                    <input
                        value={filters.pin}
                        onChange={(e) => setFilters({ ...filters, pin: e.target.value })}
                        placeholder="e.g. 0x7aB3...912C"
                        className="px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm placeholder:text-outline focus:outline-none focus:border-tertiary-fixed-dim"
                    />
                </label>

                <label className="flex flex-col gap-1">
                    <span className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">
                        REGISTERED OWNER
                    </span>
                    <input
                        value={filters.owner}
                        onChange={(e) => setFilters({ ...filters, owner: e.target.value })}
                        placeholder="Entity Name or ID"
                        className="px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm placeholder:text-outline focus:outline-none focus:border-tertiary-fixed-dim"
                    />
                </label>

                <div className="flex gap-2">
                    <button
                        type="submit"
                        className="flex-1 py-2 bg-primary-container text-white rounded-DEFAULT font-public-sans text-body-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                        Search Records
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilters({ district: 'All Districts', pin: '', owner: '' })}
                        className="px-3 border border-outline-variant rounded-DEFAULT hover:bg-surface-container-low transition-colors"
                        aria-label="Clear filters"
                    >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">filter_alt_off</span>
                    </button>
                </div>
            </form>

            <div className="flex-1 overflow-y-auto px-margin py-stack-md flex flex-col gap-stack-md">
                <div className="flex items-baseline justify-between">
                    <span className="font-public-sans text-body-sm text-on-surface-variant">
                        {results.length} Results Found
                    </span>
                    <span className="font-public-sans text-body-sm text-on-surface-variant tabular-nums">
                        {(latencyMs / 1000).toFixed(3)}s
                    </span>
                </div>

                {results.map((r) => <ResultCard key={r.pin} result={r} />)}
            </div>
        </aside>
    );
}

function ResultCard({ result }) {
    const navigate = useNavigate();
    return (
        <button
            onClick={() => navigate(`/property/${encodeURIComponent(result.pin)}`)}
            className="text-left bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-md flex flex-col gap-2 hover:border-on-surface transition-colors"
        >
            <div className="flex justify-between items-start gap-2">
                <span className="font-public-sans text-body-md font-semibold text-on-surface">
                    {result.pin}
                </span>
                <StatusBadge tone={result.status}>
                    {result.status === 'verified' && 'Verified'}
                    {result.status === 'pending'  && 'Pending TX'}
                    {result.status === 'disputed' && 'Disputed'}
                </StatusBadge>
            </div>
            <span className="font-public-sans text-body-sm text-on-surface-variant">{result.sector}</span>

            <div className="flex justify-between items-end mt-1">
                <div>
                    <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">
                        Hash Record
                    </div>
                    <div className="tabular-nums text-body-sm text-on-surface">{result.hash}</div>
                </div>
                {result.status === 'disputed' && (
                    <span className="material-symbols-outlined text-[18px] text-error" aria-hidden="true">
                        report
                    </span>
                )}
            </div>
        </button>
    );
}

function MapCanvas() {
    return (
        <div className="relative flex-1 bg-surface-container">
            <GoogleMap
                title="Cadastral map"
                center={[27.4900, -29.3120]}
                zoom={13}
                mapType="hybrid"
                polygon={[
                    [27.4900, -29.3120], [27.4920, -29.3120],
                    [27.4920, -29.3140], [27.4900, -29.3140],
                    [27.4900, -29.3120],
                ]}
                style={{ position: 'absolute', inset: 0 }}
            />

            {/* Floating GIS viewport panel */}
            <div className="absolute left-6 bottom-6 bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-md min-w-[280px] shadow-[var(--imm-shadow-raised)]">
                <div className="flex items-center gap-2 pb-2 border-b border-outline-variant">
                    <span className="material-symbols-outlined text-tertiary-fixed-dim" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                        public
                    </span>
                    <span className="font-public-sans text-body-md font-semibold text-on-surface">GIS Viewport</span>
                </div>
                <dl className="grid grid-cols-[120px_1fr] gap-y-2 mt-3 text-body-sm font-public-sans">
                    <dt className="text-on-surface-variant">Coordinates</dt>
                    <dd className="text-on-surface tabular-nums">34.0522° N, 118.24° W</dd>
                    <dt className="text-on-surface-variant">Network Status</dt>
                    <dd className="text-on-surface inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-tertiary-fixed-dim" aria-hidden="true" />
                        Synced
                    </dd>
                </dl>
                <ul className="mt-3 flex flex-col gap-1 text-body-sm font-public-sans">
                    <li className="flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-tertiary-fixed-dim rounded-DEFAULT" aria-hidden="true" />
                        Verified Parcel
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-on-surface-variant rounded-DEFAULT" aria-hidden="true" />
                        Pending Transaction
                    </li>
                    <li className="flex items-center gap-2">
                        <span className="w-3 h-3 border-2 border-error rounded-DEFAULT" aria-hidden="true" />
                        Disputed Boundary
                    </li>
                </ul>
            </div>
        </div>
    );
}

export default function SearchAndMap() {
    const [params] = useSearchParams();
    const [filters, setFilters] = useState({
        district: 'All Districts',
        pin: params.get('q') || '',
        owner: '',
    });
    const [results, setResults] = useState(SAMPLE_RESULTS);
    const [latencyMs, setLatencyMs] = useState(12);

    const onSearch = useCallback(async () => {
        const start = performance.now();
        try {
            const data = await searchService.publicSearch({
                pin: filters.pin || undefined,
            });
            const mapped = (data || []).map((p) => ({
                pin: p.pin,
                sector: `${p.district} · ${p.landUse || ''}`,
                status: p.hasActiveDispute ? 'disputed' : (p.status === 'PENDING' ? 'pending' : 'verified'),
                hash: p.blockchainTxId ? `${p.blockchainTxId.slice(0, 6)}...${p.blockchainTxId.slice(-4)}` : '—',
            }));
            setResults(mapped.length ? mapped : SAMPLE_RESULTS);
        } catch {
            // Fall back to demo data if backend isn't reachable.
            setResults(SAMPLE_RESULTS);
        } finally {
            setLatencyMs(performance.now() - start);
        }
    }, [filters]);

    return (
        <div className="flex h-full">
            <SearchPanel
                filters={filters}
                setFilters={setFilters}
                onSearch={onSearch}
                results={results}
                latencyMs={latencyMs}
            />
            <MapCanvas />
        </div>
    );
}
