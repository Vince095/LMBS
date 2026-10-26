/**
 * Documents Registry page — cross-parcel browser for the encrypted document store.
 *
 * Fetches from GET /api/parcels/documents (aggregate of all parcel supportingDocs)
 * with type and district filters, pagination, and a copy-to-clipboard CID action.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link }                                      from 'react-router-dom';
import { parcelService }                             from '../../services/parcelService';
import { useTranslation }                            from '../../i18n';

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_LIMIT = 20;

const DOC_TYPES = [
    'SURVEY_PLAN', 'ENV_ASSESSMENT', 'DEED_OF_SALE', 'TITLE_DEED',
    'COURT_ORDER', 'ID_DOCUMENT', 'POWER_OF_ATTORNEY', 'OTHER',
];

const DISTRICTS = [
    'Maseru', 'Leribe', 'Berea', 'Mafeteng', "Mohale's Hoek",
    'Quthing', "Qacha's Nek", 'Mokhotlong', 'Thaba-Tseka', 'Butha-Buthe',
];

// ── Status tone colours — matches the Stitch design token set ────────────────
function AnchorBadge({ cid, t }) {
    const [copied, setCopied] = useState(false);
    if (!cid) return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-caps font-semibold"
              style={{ background: 'var(--imm-warning-container)', color: 'var(--imm-on-warning-container)' }}>
            {t('documents.statusPending')}
        </span>
    );
    function handleCopy() {
        navigator.clipboard.writeText(cid).then(function() {
            setCopied(true);
            setTimeout(function() { setCopied(false); }, 2000);
        });
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-caps font-semibold"
              style={{ background: 'var(--imm-success-container)', color: 'var(--imm-on-success-container)' }}>
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">verified</span>
            {t('documents.statusAnchored')}
            <button
                onClick={handleCopy}
                title={copied ? t('documents.copied') : t('documents.copyHash')}
                className="ml-1 hover:opacity-70 transition-opacity"
                aria-label={t('documents.copyHash')}
            >
                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
                    {copied ? 'check' : 'content_copy'}
                </span>
            </button>
        </span>
    );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SkeletonRows() {
    return Array.from({ length: 8 }).map(function(_, i) {
        return (
            <tr key={i} className="animate-pulse border-b border-outline-variant">
                {[140, 100, 100, 80, 80, 70, 120, 90].map(function(w, j) {
                    return (
                        <td key={j} className="px-4 py-3">
                            <div className="h-3 rounded bg-surface-container-high" style={{ width: w }} />
                        </td>
                    );
                })}
            </tr>
        );
    });
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({ filters, onChange, t }) {
    function set(key) {
        return function(e) { onChange(Object.assign({}, filters, { [key]: e.target.value })); };
    }
    return (
        <div className="flex flex-wrap gap-3 items-end">
            {/* Document type */}
            <div className="flex flex-col gap-1">
                <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">
                    {t('documents.filterType')}
                </label>
                <select
                    value={filters.type || ''}
                    onChange={set('type')}
                    className="h-9 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                    <option value="">{t('documents.allTypes')}</option>
                    {DOC_TYPES.map(function(dt) {
                        return <option key={dt} value={dt}>{dt.replace(/_/g, ' ')}</option>;
                    })}
                </select>
            </div>

            {/* District */}
            <div className="flex flex-col gap-1">
                <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">
                    {t('documents.filterDistrict')}
                </label>
                <select
                    value={filters.district || ''}
                    onChange={set('district')}
                    className="h-9 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                    <option value="">{t('documents.allDistricts')}</option>
                    {DISTRICTS.map(function(d) { return <option key={d} value={d}>{d}</option>; })}
                </select>
            </div>
        </div>
    );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ meta, page, onPage }) {
    if (!meta || meta.pages <= 1) return null;
    const from  = (page - 1) * meta.limit + 1;
    const to    = Math.min(page * meta.limit, meta.total);
    return (
        <div className="flex items-center justify-between pt-4">
            <span className="font-public-sans text-body-sm text-on-surface-variant">
                {from}–{to} / {meta.total}
            </span>
            <div className="flex gap-2">
                <button
                    disabled={page <= 1}
                    onClick={function() { onPage(page - 1); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-outline font-public-sans text-body-sm disabled:opacity-40 hover:bg-surface-container-low transition-colors"
                >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
                </button>
                <button
                    disabled={page >= meta.pages}
                    onClick={function() { onPage(page + 1); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-outline font-public-sans text-body-sm disabled:opacity-40 hover:bg-surface-container-low transition-colors"
                >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
                </button>
            </div>
        </div>
    );
}

// ── Main Documents component ──────────────────────────────────────────────────
export default function Documents() {
    const { t } = useTranslation();

    const [docs,    setDocs]    = useState([]);
    const [meta,    setMeta]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);
    const [filters, setFilters] = useState({});
    const [page,    setPage]    = useState(1);

    const fetchDocs = useCallback(function() {
        setLoading(true);
        setError(null);
        parcelService.listDocuments(Object.assign({}, filters, { limit: PAGE_LIMIT, page: page }))
            .then(function(data) {
                if (data && Array.isArray(data.documents)) {
                    setDocs(data.documents);
                    setMeta({ total: data.total, page: data.page, limit: data.limit, pages: data.pages });
                } else if (Array.isArray(data)) {
                    setDocs(data);
                    setMeta(null);
                } else {
                    setDocs([]);
                    setMeta(null);
                }
            })
            .catch(function(err) {
                setError(err.message || 'Failed to load documents');
            })
            .finally(function() { setLoading(false); });
    }, [filters, page]);

    useEffect(function() { fetchDocs(); }, [fetchDocs]);

    function handleFilterChange(newFilters) {
        setFilters(newFilters);
        setPage(1);
    }

    function formatDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function truncateCid(cid) {
        if (!cid) return '—';
        return cid.length > 16 ? cid.slice(0, 8) + '…' + cid.slice(-6) : cid;
    }

    return (
        <div className="p-6 flex flex-col gap-6">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h1 className="font-public-sans text-title-lg font-bold text-on-surface">
                    {t('documents.heading')}
                </h1>
                <p className="font-public-sans text-body-sm text-on-surface-variant">
                    {t('documents.subtitle')}
                </p>
            </div>

            {/* Filters */}
            <FilterBar filters={filters} onChange={handleFilterChange} t={t} />

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg border"
                     style={{ background: 'var(--imm-error-container)', borderColor: 'var(--imm-error)', color: 'var(--imm-on-error-container)' }}>
                    <span className="material-symbols-outlined" aria-hidden="true">error</span>
                    <span className="font-public-sans text-body-sm">{error}</span>
                    <button onClick={fetchDocs} className="ml-auto underline font-public-sans text-body-sm">
                        Retry
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-outline-variant overflow-hidden bg-surface">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="bg-surface-container-low">
                            <tr>
                                {[
                                    t('documents.colDocument'),
                                    t('documents.colType'),
                                    t('documents.colParcel'),
                                    t('documents.colDistrict'),
                                    t('documents.colUploaded'),
                                    t('documents.colSize'),
                                    t('documents.colIpfs'),
                                    t('documents.colStatus'),
                                ].map(function(col) {
                                    return (
                                        <th key={col} className="px-4 py-3 text-left font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                                            {col}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <SkeletonRows />
                            ) : docs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
                                            <span className="material-symbols-outlined text-[48px]" aria-hidden="true">description</span>
                                            <span className="font-public-sans text-body-md">{t('documents.noDocuments')}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : docs.map(function(doc) {
                                return (
                                    <tr key={doc.id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-lowest transition-colors">
                                        {/* Document name */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">description</span>
                                                <span className="font-public-sans text-body-sm text-on-surface max-w-[160px] truncate" title={doc.name || '—'}>
                                                    {doc.name || '—'}
                                                </span>
                                            </div>
                                        </td>
                                        {/* Type */}
                                        <td className="px-4 py-3">
                                            <span className="font-public-sans text-body-sm text-on-surface-variant whitespace-nowrap">
                                                {t('docTypes.' + doc.type) || doc.type}
                                            </span>
                                        </td>
                                        {/* Parcel PIN */}
                                        <td className="px-4 py-3">
                                            <Link
                                                to={'/property/' + encodeURIComponent(doc.parcelPin)}
                                                className="font-public-sans text-body-sm font-mono text-primary underline-offset-2 hover:underline"
                                            >
                                                {doc.parcelPin}
                                            </Link>
                                        </td>
                                        {/* District */}
                                        <td className="px-4 py-3">
                                            <span className="font-public-sans text-body-sm text-on-surface-variant">
                                                {doc.district || '—'}
                                            </span>
                                        </td>
                                        {/* Uploaded at */}
                                        <td className="px-4 py-3">
                                            <span className="font-public-sans text-body-sm text-on-surface-variant whitespace-nowrap">
                                                {formatDate(doc.uploadedAt)}
                                            </span>
                                        </td>
                                        {/* Size */}
                                        <td className="px-4 py-3">
                                            <span className="font-public-sans text-body-sm text-on-surface-variant">
                                                {doc.sizeKB ? t('documents.sizeKb').replace('{n}', doc.sizeKB) : '—'}
                                            </span>
                                        </td>
                                        {/* keccak256 document hash */}
                                        <td className="px-4 py-3">
                                            {doc.documentHash ? (
                                                <span
                                                    className="font-mono text-label-sm text-on-surface-variant cursor-default"
                                                    title={doc.documentHash}
                                                >
                                                    {truncateCid(doc.documentHash)}
                                                </span>
                                            ) : (
                                                <span className="font-public-sans text-body-sm text-on-surface-variant">—</span>
                                            )}
                                        </td>
                                        {/* Status */}
                                        <td className="px-4 py-3">
                                            <AnchorBadge cid={doc.anchoredOnChain ? doc.documentHash : null} t={t} />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {!loading && docs.length > 0 && (
                    <div className="px-4 pb-4">
                        <Pagination meta={meta} page={page} onPage={setPage} />
                    </div>
                )}
            </div>
        </div>
    );
}
