/**
 * Disputes Registry page — list all disputes + File New Dispute modal.
 *
 * Implements FR-DR-001..007:
 *  - Any authenticated user can file a dispute against a parcel.
 *  - Disputes are shown with status, parcel link, filing date.
 *  - Status badges colour-coded: OPEN=warning, UNDER_REVIEW=info,
 *    ESCALATED=error, RESOLVED=success, WITHDRAWN=neutral.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link }                                              from 'react-router-dom';
import { disputeService }                                    from '../../services/disputeService';
import { useTranslation }                                    from '../../i18n';
import { useAuth }                                           from '../../auth';

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_LIMIT = 20;

const STATUS_STYLE = {
    OPEN:         { bg: 'var(--imm-warning-container)',  fg: 'var(--imm-on-warning-container)',  icon: 'pending'       },
    UNDER_REVIEW: { bg: 'var(--imm-info-container,#e0f2fe)',    fg: 'var(--imm-on-info-container,#0369a1)',   icon: 'rate_review'   },
    ESCALATED:    { bg: 'var(--imm-error-container)',    fg: 'var(--imm-on-error-container)',    icon: 'arrow_upward'  },
    RESOLVED:     { bg: 'var(--imm-success-container)',  fg: 'var(--imm-on-success-container)',  icon: 'check_circle'  },
    WITHDRAWN:    { bg: 'var(--imm-surface-container-high,#e5e7eb)', fg: 'var(--imm-on-surface-variant,#6b7280)', icon: 'undo' },
};

function StatusBadge({ status, t }) {
    const style = STATUS_STYLE[status] || STATUS_STYLE['OPEN'];
    const labelKey = 'disputesPage.status' + status.charAt(0) + status.slice(1).toLowerCase().replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-public-sans text-label-caps font-semibold whitespace-nowrap"
            style={{ background: style.bg, color: style.fg }}
        >
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">{style.icon}</span>
            {t(labelKey) || status}
        </span>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRows() {
    return Array.from({ length: 6 }).map(function(_, i) {
        return (
            <tr key={i} className="animate-pulse border-b border-outline-variant">
                {[160, 100, 220, 90, 100, 140].map(function(w, j) {
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

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ meta, page, onPage }) {
    if (!meta || meta.pages <= 1) return null;
    const from = (page - 1) * meta.limit + 1;
    const to   = Math.min(page * meta.limit, meta.total);
    return (
        <div className="flex items-center justify-between pt-4">
            <span className="font-public-sans text-body-sm text-on-surface-variant">{from}–{to} / {meta.total}</span>
            <div className="flex gap-2">
                <button disabled={page <= 1} onClick={function() { onPage(page - 1); }}
                    className="inline-flex items-center px-3 py-1.5 rounded-md border border-outline font-public-sans text-body-sm disabled:opacity-40 hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
                </button>
                <button disabled={page >= meta.pages} onClick={function() { onPage(page + 1); }}
                    className="inline-flex items-center px-3 py-1.5 rounded-md border border-outline font-public-sans text-body-sm disabled:opacity-40 hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
                </button>
            </div>
        </div>
    );
}

// ── File Dispute Modal ────────────────────────────────────────────────────────
function FileDisputeModal({ open, onClose, onSuccess, prefillPin, t }) {
    const { user } = useAuth();
    const [form, setForm] = useState({
        parcelPin:   prefillPin || '',
        description: '',
        evidence:    '',
        filerLnid:   '',
        filerAddress: user ? (user.walletAddress || user.address || '') : '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error,      setError]      = useState(null);
    const inputRef = useRef(null);

    // Reset on open / pin change
    useEffect(function() {
        if (open) {
            setForm({
                parcelPin:    prefillPin || '',
                description:  '',
                evidence:     '',
                filerLnid:    '',
                filerAddress: user ? (user.walletAddress || user.address || '') : '',
            });
            setError(null);
            setSubmitting(false);
            setTimeout(function() { if (inputRef.current) inputRef.current.focus(); }, 50);
        }
    }, [open, prefillPin, user]);

    function setField(key) {
        return function(e) { setForm(function(prev) { return Object.assign({}, prev, { [key]: e.target.value }); }); };
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!form.parcelPin.trim() || !form.description.trim() || !form.filerAddress.trim()) return;
        setSubmitting(true);
        setError(null);
        var payload = {
            parcelPin:    form.parcelPin.trim(),
            description:  form.description.trim(),
            filerAddress: form.filerAddress.trim(),
        };
        if (form.filerLnid.trim())  payload.filerLnid = form.filerLnid.trim();
        if (form.evidence.trim())   payload.evidence  = [{ description: 'User-submitted CID', ipfsCid: form.evidence.trim() }];

        disputeService.file(payload)
            .then(function(result) {
                setSubmitting(false);
                onSuccess(result);
            })
            .catch(function(err) {
                setSubmitting(false);
                setError(err.message || t('disputesPage.errorMsg'));
            });
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.4)' }}
             onClick={function(e) { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-lg rounded-2xl shadow-2xl bg-surface border border-outline-variant overflow-y-auto max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
                    <div>
                        <h2 className="font-public-sans text-title-md font-bold text-on-surface">{t('disputesPage.modalHeading')}</h2>
                        <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">{t('disputesPage.modalSubtitle')}</p>
                    </div>
                    <button onClick={onClose} aria-label={t('disputesPage.cancelBtn')}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant" aria-hidden="true">close</span>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
                    {/* Parcel PIN */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-sm font-semibold text-on-surface">
                            {t('disputesPage.fieldPin')} <span className="text-error">*</span>
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            required
                            value={form.parcelPin}
                            onChange={setField('parcelPin')}
                            placeholder={t('disputesPage.fieldPinHint')}
                            className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>

                    {/* Description */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-sm font-semibold text-on-surface">
                            {t('disputesPage.fieldDesc')} <span className="text-error">*</span>
                        </label>
                        <textarea
                            required
                            rows={4}
                            value={form.description}
                            onChange={setField('description')}
                            placeholder={t('disputesPage.fieldDescHint')}
                            className="px-3 py-2 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                        />
                    </div>

                    {/* Evidence CID */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-sm font-semibold text-on-surface">
                            {t('disputesPage.fieldEvidence')}
                        </label>
                        <input
                            type="text"
                            value={form.evidence}
                            onChange={setField('evidence')}
                            placeholder={t('disputesPage.fieldEvidenceHint')}
                            className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>

                    {/* LNID */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-sm font-semibold text-on-surface">
                            {t('disputesPage.fieldLnid')}
                        </label>
                        <input
                            type="text"
                            value={form.filerLnid}
                            onChange={setField('filerLnid')}
                            className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>

                    {/* Wallet address */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-sm font-semibold text-on-surface">
                            {t('disputesPage.fieldAddress')} <span className="text-error">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            value={form.filerAddress}
                            onChange={setField('filerAddress')}
                            className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg text-body-sm font-public-sans"
                             style={{ background: 'var(--imm-error-container)', color: 'var(--imm-on-error-container)' }}>
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">error</span>
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg border border-outline font-public-sans text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                        >
                            {t('disputesPage.cancelBtn')}
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-5 py-2 rounded-lg font-public-sans text-body-sm font-semibold text-white disabled:opacity-60 transition-opacity"
                            style={{ background: 'var(--imm-primary-container)' }}
                        >
                            {submitting ? (
                                <span className="inline-flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    {t('disputesPage.submitting')}
                                </span>
                            ) : t('disputesPage.submitBtn')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main Disputes component ───────────────────────────────────────────────────
export default function Disputes() {
    const { t }   = useTranslation();

    const [disputes, setDisputes] = useState([]);
    const [meta,     setMeta]     = useState(null);
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState(null);
    const [status,   setStatus]   = useState('');
    const [page,     setPage]     = useState(1);
    const [modal,    setModal]    = useState({ open: false, pin: '' });
    const [success,  setSuccess]  = useState(null);

    const STATUSES = ['OPEN', 'UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'WITHDRAWN'];

    const fetchDisputes = useCallback(function() {
        setLoading(true);
        setError(null);
        const params = { limit: PAGE_LIMIT, page: page };
        if (status) params.status = status;
        disputeService.list(params)
            .then(function(data) {
                if (data && Array.isArray(data.disputes)) {
                    setDisputes(data.disputes);
                    setMeta({ total: data.total, page: data.page, limit: data.limit, pages: data.pages });
                } else if (Array.isArray(data)) {
                    setDisputes(data);
                    setMeta(null);
                } else {
                    setDisputes([]);
                    setMeta(null);
                }
            })
            .catch(function(err) { setError(err.message || 'Failed to load disputes'); })
            .finally(function() { setLoading(false); });
    }, [status, page]);

    useEffect(function() { fetchDisputes(); }, [fetchDisputes]);

    function handleSuccess(result) {
        const id = (result && (result.disputeId || result._id)) || '';
        setSuccess(t('disputesPage.successMsg').replace('{id}', id));
        setModal({ open: false, pin: '' });
        fetchDisputes();
    }

    function formatDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    }

    return (
        <div className="p-6 flex flex-col gap-6">
            {/* File Dispute Modal */}
            <FileDisputeModal
                open={modal.open}
                prefillPin={modal.pin}
                onClose={function() { setModal({ open: false, pin: '' }); }}
                onSuccess={handleSuccess}
                t={t}
            />

            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h1 className="font-public-sans text-title-lg font-bold text-on-surface">
                        {t('disputesPage.heading')}
                    </h1>
                    <p className="font-public-sans text-body-sm text-on-surface-variant">
                        {t('disputesPage.subtitle')}
                    </p>
                </div>
                <button
                    onClick={function() { setModal({ open: true, pin: '' }); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-public-sans text-body-sm font-semibold text-white shrink-0"
                    style={{ background: 'var(--imm-primary-container)' }}
                >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
                    {t('disputesPage.fileNew')}
                </button>
            </div>

            {/* Success banner */}
            {success && (
                <div className="flex items-center gap-3 p-4 rounded-lg border"
                     style={{ background: 'var(--imm-success-container)', borderColor: 'var(--imm-success,#16a34a)', color: 'var(--imm-on-success-container)' }}>
                    <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
                    <span className="font-public-sans text-body-sm">{success}</span>
                    <button onClick={function() { setSuccess(null); }} className="ml-auto">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
                    </button>
                </div>
            )}

            {/* Status filter */}
            <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1">
                    <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">
                        {t('disputesPage.filterStatus')}
                    </label>
                    <select
                        value={status}
                        onChange={function(e) { setStatus(e.target.value); setPage(1); }}
                        className="h-9 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                        <option value="">{t('disputesPage.allStatuses')}</option>
                        {STATUSES.map(function(s) {
                            const lk = 'disputesPage.status' + s.charAt(0) + s.slice(1).toLowerCase().replace(/_([a-z])/g, function(_, c) { return c.toUpperCase(); });
                            return <option key={s} value={s}>{t(lk) || s}</option>;
                        })}
                    </select>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg border"
                     style={{ background: 'var(--imm-error-container)', borderColor: 'var(--imm-error)', color: 'var(--imm-on-error-container)' }}>
                    <span className="material-symbols-outlined" aria-hidden="true">error</span>
                    <span className="font-public-sans text-body-sm">{error}</span>
                    <button onClick={fetchDisputes} className="ml-auto underline font-public-sans text-body-sm">Retry</button>
                </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-outline-variant overflow-hidden bg-surface">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[700px]">
                        <thead className="bg-surface-container-low">
                            <tr>
                                {[
                                    t('disputesPage.colId'),
                                    t('disputesPage.colParcel'),
                                    t('disputesPage.colDescription'),
                                    t('disputesPage.colStatus'),
                                    t('disputesPage.colFiled'),
                                    t('disputesPage.colOfficer'),
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
                            ) : disputes.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center">
                                        <div className="flex flex-col items-center gap-3 text-on-surface-variant">
                                            <span className="material-symbols-outlined text-[48px]" aria-hidden="true">gavel</span>
                                            <span className="font-public-sans text-body-md">{t('disputesPage.noDisputes')}</span>
                                            <button
                                                onClick={function() { setModal({ open: true, pin: '' }); }}
                                                className="px-4 py-2 rounded-lg border border-primary text-primary font-public-sans text-body-sm hover:bg-primary-container/10 transition-colors"
                                            >
                                                {t('disputesPage.fileNew')}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : disputes.map(function(d) {
                                return (
                                    <tr key={d._id || d.disputeId} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-lowest transition-colors">
                                        {/* ID */}
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-label-sm text-on-surface-variant" title={d.disputeId}>
                                                {d.disputeId ? d.disputeId.slice(0, 12) + '…' : '—'}
                                            </span>
                                        </td>
                                        {/* Parcel */}
                                        <td className="px-4 py-3">
                                            <Link
                                                to={'/property/' + encodeURIComponent(d.parcelPin)}
                                                className="font-mono text-body-sm text-primary underline-offset-2 hover:underline"
                                            >
                                                {d.parcelPin}
                                            </Link>
                                        </td>
                                        {/* Description */}
                                        <td className="px-4 py-3 max-w-[260px]">
                                            <p className="font-public-sans text-body-sm text-on-surface line-clamp-2" title={d.description}>
                                                {d.description}
                                            </p>
                                        </td>
                                        {/* Status */}
                                        <td className="px-4 py-3">
                                            <StatusBadge status={d.status} t={t} />
                                        </td>
                                        {/* Filed */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="font-public-sans text-body-sm text-on-surface-variant">
                                                {formatDate(d.createdAt)}
                                            </span>
                                        </td>
                                        {/* Officer */}
                                        <td className="px-4 py-3">
                                            <span className="font-public-sans text-body-sm text-on-surface-variant">
                                                {d.assignedOfficer || '—'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!loading && disputes.length > 0 && (
                    <div className="px-4 pb-4">
                        <Pagination meta={meta} page={page} onPage={setPage} />
                    </div>
                )}
            </div>
        </div>
    );
}
