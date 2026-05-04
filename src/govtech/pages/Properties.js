/**
 * Properties — full land-title registry index.
 *
 * Data source: GET /api/parcels (paginated, filterable by district / status /
 * land-use). Each row is enriched server-side with the current registered
 * owner from the active TitleDeed document.
 *
 * Features:
 *   - Live fetch from database — no hardcoded SAMPLE data
 *   - Filter bar: district, status, land-use type
 *   - Page-based pagination with Previous / Next controls
 *   - Loading skeleton rows
 *   - Empty state when no parcels match filters
 *   - Error banner with Retry
 *   - All UI strings via useTranslation()
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import { parcelService } from '../../services';
import { useTranslation } from '../../i18n';

// ─── Constants ────────────────────────────────────────────────────────────────

const LESOTHO_DISTRICTS = [
    'Maseru', 'Berea', 'Leribe', 'Botha-Bothe', 'Mafeteng',
    "Mohale's Hoek", 'Quthing', "Qacha's Nek", 'Mokhotlong', 'Thaba-Tseka',
];

const STATUSES = [
    { value: 'ACTIVE',     label: 'Active'     },
    { value: 'DISPUTED',   label: 'Disputed'   },
    { value: 'ENCUMBERED', label: 'Encumbered' },
    { value: 'REVOKED',    label: 'Revoked'    },
];

const LAND_USES = [
    { value: 'RESIDENTIAL',  label: 'Residential'  },
    { value: 'COMMERCIAL',   label: 'Commercial'   },
    { value: 'AGRICULTURAL', label: 'Agricultural' },
    { value: 'INDUSTRIAL',   label: 'Industrial'   },
    { value: 'OTHER',        label: 'Other'        },
];

const PAGE_LIMIT = 25;

function statusTone(s) {
    if (s === 'ACTIVE')     return 'verified';
    if (s === 'DISPUTED')   return 'disputed';
    if (s === 'ENCUMBERED') return 'pending';
    if (s === 'REVOKED')    return 'error';
    return 'pending';
}

function fmtArea(m2) {
    if (!m2 && m2 !== 0) return '—';
    return `${Number(m2).toLocaleString()} m²`;
}


function FilterBar({ filters, onChange, onClear }) {
    const { t } = useTranslation();
    const selectCls = 'px-3 py-1.5 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm text-on-surface focus:outline-none focus:border-tertiary-fixed-dim';

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* District */}
            <select
                value={filters.district}
                onChange={(e) => onChange('district', e.target.value)}
                className={selectCls}
                aria-label="Filter by district"
            >
                <option value="">{t('map.allDistricts')}</option>
                {LESOTHO_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            {/* Status */}
            <select
                value={filters.status}
                onChange={(e) => onChange('status', e.target.value)}
                className={selectCls}
                aria-label="Filter by status"
            >
                <option value="">All Statuses</option>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>

            {/* Land use */}
            <select
                value={filters.landUse}
                onChange={(e) => onChange('landUse', e.target.value)}
                className={selectCls}
                aria-label="Filter by land use"
            >
                <option value="">All Land Uses</option>
                {LAND_USES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>

            {/* Clear */}
            {(filters.district || filters.status || filters.landUse) && (
                <button
                    onClick={onClear}
                    className="flex items-center gap-1 px-3 py-1.5 text-on-surface-variant hover:text-error font-public-sans text-body-sm transition-colors"
                >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                    Clear filters
                </button>
            )}
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonRows({ count = 8 }) {
    return Array.from({ length: count }).map((_, i) => (
        <tr key={i} className={`border-b border-outline-variant ${i % 2 ? 'bg-surface-container-low' : ''}`}>
            {[140, 90, 80, 120, 70, 48].map((w, j) => (
                <td key={j} className="px-5 py-3.5">
                    <div
                        className="h-3 rounded bg-surface-container animate-pulse"
                        style={{ width: w, maxWidth: '100%' }}
                    />
                </td>
            ))}
        </tr>
    ));
}

// ─── Pagination controls ──────────────────────────────────────────────────────

function Pagination({ page, pages, total, limit, onPage }) {
    const from = total === 0 ? 0 : (page - 1) * limit + 1;
    const to   = Math.min(page * limit, total);

    return (
        <div className="flex items-center justify-between px-5 py-3 border-t border-outline-variant font-public-sans text-body-sm text-on-surface-variant">
            <span>{total === 0 ? 'No results' : `${from}–${to} of ${total.toLocaleString()} parcels`}</span>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onPage(page - 1)}
                    disabled={page <= 1}
                    className="p-1.5 rounded hover:bg-surface-container-low disabled:opacity-30 transition-colors"
                    aria-label="Previous page"
                >
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_left</span>
                </button>
                <span className="px-2 tabular-nums">
                    {page} / {pages || 1}
                </span>
                <button
                    onClick={() => onPage(page + 1)}
                    disabled={page >= pages}
                    className="p-1.5 rounded hover:bg-surface-container-low disabled:opacity-30 transition-colors"
                    aria-label="Next page"
                >
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_right</span>
                </button>
            </div>
        </div>
    );
}


export default function Properties() {
    const { t }    = useTranslation();
    const navigate = useNavigate();

    const [parcels,  setParcels]  = useState([]);
    const [meta,     setMeta]     = useState({ total: 0, page: 1, pages: 1, limit: PAGE_LIMIT });
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState(null);
    const [filters,  setFilters]  = useState({ district: '', status: '', landUse: '' });
    const [page,     setPage]     = useState(1);

    const fetchParcels = useCallback(async (currentFilters, currentPage) => {
        setLoading(true);
        setError(null);
        try {
            const res = await parcelService.list({
                ...currentFilters,
                limit: PAGE_LIMIT,
                page:  currentPage,
            });
            
            if (Array.isArray(res)) {
                setParcels(res);
                setMeta({ total: res.length, page: 1, pages: 1, limit: PAGE_LIMIT });
            } else {
                setParcels(res.parcels || []);
                setMeta({
                    total:  res.total  ?? 0,
                    page:   res.page   ?? 1,
                    pages:  res.pages  ?? 1,
                    limit:  res.limit  ?? PAGE_LIMIT,
                });
            }
        } catch (err) {
            setError(err.message || 'Failed to load parcels. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch whenever filters or page changes
    useEffect(() => {
        fetchParcels(filters, page);
    }, [filters, page, fetchParcels]);

    function handleFilterChange(key, value) {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setPage(1); // reset to first page on filter change
    }

    function clearFilters() {
        setFilters({ district: '', status: '', landUse: '' });
        setPage(1);
    }

    const TABLE_HEADERS = ['PARCEL PIN', 'DISTRICT', 'AREA', 'LAND USE', 'OWNER', 'STATUS', ''];

    return (
        <div className="p-margin max-w-container-max mx-auto w-full flex flex-col gap-stack-lg">

            {/* Page header */}
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="font-public-sans text-h1 font-bold text-on-surface tracking-tight">
                        {t('govtech.nav.landTitles')}
                    </h1>
                    <p className="font-public-sans text-body-md text-on-surface-variant mt-1">
                        All parcels in the LMBS registry — live from the database.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/register-parcel')}
                    className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity"
                >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
                    {t('govtech.sidebar.registerNewTitle')}
                </button>
            </header>

            {/* Filter bar */}
            <FilterBar filters={filters} onChange={handleFilterChange} onClear={clearFilters} />

            {/* Error banner */}
            {error && (
                <div role="alert" className="flex items-start gap-3 px-4 py-3 bg-error-container border border-error rounded-xl font-public-sans text-body-sm text-on-error-container">
                    <span className="material-symbols-outlined mt-0.5 flex-shrink-0" aria-hidden="true">error</span>
                    <div className="flex-1">{error}</div>
                    <button
                        onClick={() => fetchParcels(filters, page)}
                        className="font-semibold underline hover:no-underline flex-shrink-0"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Table */}
            <section className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[720px]">
                        <thead>
                            <tr className="border-b border-outline-variant bg-surface-container-low">
                                {TABLE_HEADERS.map((h) => (
                                    <th key={h} className="px-5 py-3 font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <SkeletonRows count={PAGE_LIMIT} />}

                            {!loading && parcels.map((r, i) => (
                                <tr
                                    key={r.pin || r._id || i}
                                    className={`border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low transition-colors ${i % 2 ? 'bg-surface-container-low/50' : ''}`}
                                >
                                    {/* PIN */}
                                    <td className="px-5 py-3 font-mono text-body-sm text-on-surface font-medium whitespace-nowrap">
                                        {r.pin}
                                    </td>

                                    {/* District */}
                                    <td className="px-5 py-3 font-public-sans text-body-sm text-on-surface">
                                        {r.district || '—'}
                                    </td>

                                    {/* Area */}
                                    <td className="px-5 py-3 font-public-sans text-body-sm text-on-surface tabular-nums whitespace-nowrap">
                                        {fmtArea(r.areaM2)}
                                    </td>

                                    {/* Land use */}
                                    <td className="px-5 py-3 font-public-sans text-body-sm text-on-surface-variant capitalize">
                                        {r.landUse ? r.landUse.charAt(0) + r.landUse.slice(1).toLowerCase() : '—'}
                                    </td>

                                    {/* Owner (from TitleDeed enrichment) */}
                                    <td className="px-5 py-3 font-public-sans text-body-sm text-on-surface max-w-[180px] truncate" title={r.currentOwner || ''}>
                                        {r.currentOwner || <span className="text-on-surface-variant italic">Unregistered</span>}
                                    </td>

                                    {/* Status */}
                                    <td className="px-5 py-3">
                                        <StatusBadge tone={statusTone(r.status)}>
                                            {r.status ? r.status.charAt(0) + r.status.slice(1).toLowerCase() : '—'}
                                        </StatusBadge>
                                    </td>

                                    {/* Action */}
                                    <td className="px-5 py-3 text-right">
                                        <Link
                                            to={`/property/${encodeURIComponent(r.pin)}`}
                                            className="font-public-sans text-body-sm text-on-tertiary-container hover:underline inline-flex items-center gap-0.5 whitespace-nowrap"
                                        >
                                            View
                                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">chevron_right</span>
                                        </Link>
                                    </td>
                                </tr>
                            ))}

                            {/* Empty state */}
                            {!loading && !error && parcels.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center">
                                        <span className="material-symbols-outlined text-[40px] text-on-surface-variant block" aria-hidden="true">search_off</span>
                                        <p className="font-public-sans text-body-md font-semibold text-on-surface mt-3">
                                            No parcels found
                                        </p>
                                        <p className="font-public-sans text-body-sm text-on-surface-variant mt-1">
                                            {filters.district || filters.status || filters.landUse
                                                ? 'Try adjusting or clearing the filters above.'
                                                : 'No parcels have been registered yet.'}
                                        </p>
                                        {(filters.district || filters.status || filters.landUse) && (
                                            <button
                                                onClick={clearFilters}
                                                className="mt-3 px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors"
                                            >
                                                Clear filters
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination footer */}
                {!loading && meta.total > 0 && (
                    <Pagination
                        page={meta.page}
                        pages={meta.pages}
                        total={meta.total}
                        limit={meta.limit}
                        onPage={setPage}
                    />
                )}
            </section>
        </div>
    );
}
