/**
 * ApprovalsQueue — pending transfer workflow approvals for REGISTRY_OFFICER and ADMIN.
 *
 * SEC-TRANSFER-01: rows where isSelfDealing===true are blocked — the officer
 * is shown a warning badge and the Advance button is disabled.
 *
 * Workflow steps:
 *   PENDING_OWNER → PENDING_KYC → PENDING_NOTARY → PENDING_OFFICER → COMPLETE
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link }                                              from 'react-router-dom';
import { transferService }                                   from '../../services/transferService';
import { useTranslation }                                    from '../../i18n';
import { useAuth }                                           from '../../auth';

// ── Step display helpers ──────────────────────────────────────────────────────
const STEP_META = {
    PENDING_OWNER:   { icon: 'person',          tone: 'warning' },
    PENDING_KYC:     { icon: 'badge',            tone: 'info'    },
    PENDING_NOTARY:  { icon: 'gavel',            tone: 'info'    },
    PENDING_OFFICER: { icon: 'verified_user',    tone: 'primary' },
    COMPLETE:        { icon: 'check_circle',     tone: 'success' },
    CANCELLED:       { icon: 'cancel',           tone: 'error'   },
};

const TONE_STYLE = {
    warning: { bg: 'var(--imm-warning-container,#fef9c3)',  fg: 'var(--imm-on-warning-container,#713f12)' },
    info:    { bg: '#e0f2fe',                               fg: '#0369a1'                                  },
    primary: { bg: 'var(--imm-primary-container,#dbeafe)',  fg: 'var(--imm-on-primary-container,#1e3a5f)' },
    success: { bg: 'var(--imm-success-container,#dcfce7)',  fg: 'var(--imm-on-success-container,#166534)' },
    error:   { bg: 'var(--imm-error-container,#fee2e2)',    fg: 'var(--imm-on-error-container,#7f1d1d)'   },
    neutral: { bg: 'var(--imm-surface-container-high,#e5e7eb)', fg: '#374151'                             },
};

function StepBadge({ status, t }) {
    const meta  = STEP_META[status] || STEP_META['PENDING_OWNER'];
    const style = TONE_STYLE[meta.tone] || TONE_STYLE.neutral;
    const labelKey = {
        PENDING_OWNER:   'approvals.stepPendingOwner',
        PENDING_KYC:     'approvals.stepPendingKyc',
        PENDING_NOTARY:  'approvals.stepPendingNotary',
        PENDING_OFFICER: 'approvals.stepPendingOfficer',
        COMPLETE:        'approvals.stepComplete',
        CANCELLED:       'approvals.stepCancelled',
    }[status] || status;

    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-caps font-semibold whitespace-nowrap"
              style={{ background: style.bg, color: style.fg }}>
            <span className="material-symbols-outlined text-[12px]" aria-hidden="true">{meta.icon}</span>
            {t(labelKey)}
        </span>
    );
}

// ── Advance / Cancel Modal ────────────────────────────────────────────────────
function ActionModal({ mode, transfer, onClose, onDone, t }) {
    const [notes,      setNotes]      = useState('');
    const [reason,     setReason]     = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error,      setError]      = useState(null);
    const firstRef = useRef(null);

    useEffect(() => {
        setNotes(''); setReason(''); setError(null); setSubmitting(false);
        setTimeout(() => firstRef.current && firstRef.current.focus(), 60);
    }, [mode, transfer]);

    if (!transfer || !mode) return null;

    function handleSubmit(e) {
        e.preventDefault();
        setSubmitting(true); setError(null);
        const promise = mode === 'advance'
            ? transferService.advance(transfer.transferId, { notes })
            : transferService.cancel(transfer.transferId, reason);
        promise
            .then(() => { setSubmitting(false); onDone(mode); })
            .catch(err => { setSubmitting(false); setError(err.message || 'Operation failed'); });
    }

    const isAdvance = mode === 'advance';
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.4)' }}
             onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-md rounded-2xl bg-surface border border-outline-variant shadow-2xl">
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
                    <h2 className="font-public-sans text-title-md font-bold text-on-surface">
                        {isAdvance ? t('approvals.advanceModal') : t('approvals.cancelModal')}
                    </h2>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-low">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant" aria-hidden="true">close</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
                    {/* Parcel info strip */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low">
                        <span className="material-symbols-outlined text-on-surface-variant" aria-hidden="true">swap_horiz</span>
                        <div className="flex flex-col">
                            <span className="font-mono text-body-sm text-on-surface font-semibold">{transfer.parcelPin}</span>
                            <span className="font-public-sans text-label-sm text-on-surface-variant">
                                {transfer.fromOwner && transfer.fromOwner.fullName} → {transfer.toOwner && transfer.toOwner.fullName}
                            </span>
                        </div>
                        <StepBadge status={transfer.status} t={t} />
                    </div>

                    {isAdvance ? (
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('approvals.notesLabel')}</label>
                            <textarea ref={firstRef} rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                                placeholder={t('approvals.notesHint')}
                                className="px-3 py-2 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('approvals.cancelReasonLabel')}</label>
                            <textarea ref={firstRef} rows={3} value={reason} onChange={e => setReason(e.target.value)}
                                placeholder={t('approvals.cancelReasonHint')} required
                                className="px-3 py-2 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg text-body-sm font-public-sans"
                             style={{ background: TONE_STYLE.error.bg, color: TONE_STYLE.error.fg }}>
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">error</span>
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-1">
                        <button type="button" onClick={onClose}
                            className="px-4 py-2 rounded-lg border border-outline font-public-sans text-body-sm text-on-surface hover:bg-surface-container-low">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={submitting}
                            className="px-5 py-2 rounded-lg font-public-sans text-body-sm font-semibold text-white disabled:opacity-60"
                            style={{ background: isAdvance ? 'var(--imm-primary-container)' : 'var(--imm-error,#dc2626)' }}>
                            {submitting ? (
                                <span className="inline-flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    {t('common.loading')}
                                </span>
                            ) : isAdvance ? t('approvals.confirmAdvance') : t('approvals.confirmCancel')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRows() {
    return Array.from({ length: 5 }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-outline-variant">
            {[120,90,130,130,130,80,90,100].map((w,j) => (
                <td key={j} className="px-4 py-3">
                    <div className="h-3 rounded bg-surface-container-high" style={{ width: w }} />
                </td>
            ))}
        </tr>
    ));
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ApprovalsQueue() {
    const { t }    = useTranslation();
    const { user } = useAuth();

    const [transfers, setTransfers] = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);
    const [modal,     setModal]     = useState({ mode: null, transfer: null });
    const [toast,     setToast]     = useState(null);

    const load = useCallback(() => {
        setLoading(true); setError(null);
        transferService.pending()
            .then(data => {
                setTransfers(Array.isArray(data) ? data : (data.transfers || []));
            })
            .catch(err => setError(err.message || t('approvals.errorLoad')))
            .finally(() => setLoading(false));
    }, [t]);

    useEffect(() => { load(); }, [load]);

    function showToast(msg) {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    }

    function handleDone(mode) {
        setModal({ mode: null, transfer: null });
        const msg = mode === 'advance' ? t('approvals.successAdvanced').replace('{step}','') : t('approvals.successCancelled');
        showToast(msg);
        load();
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' });
    }
    function fmtAddr(a) { return a ? a.slice(0,8)+'…'+a.slice(-4) : '—'; }

    const canAdvance = user && (user.role === 'REGISTRY_OFFICER' || user.role === 'ADMIN' || user.role === 'NOTARY');

    return (
        <div className="p-6 flex flex-col gap-6">
            {/* Modal */}
            <ActionModal
                mode={modal.mode}
                transfer={modal.transfer}
                onClose={() => setModal({ mode: null, transfer: null })}
                onDone={handleDone}
                t={t}
            />

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg font-public-sans text-body-sm text-white"
                     style={{ background: 'var(--imm-primary-container)' }}>
                    {toast}
                </div>
            )}

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="font-public-sans text-title-lg font-bold text-on-surface">{t('approvals.heading')}</h1>
                    <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">{t('approvals.subtitle')}</p>
                </div>
                <button onClick={load}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-outline font-public-sans text-body-sm text-on-surface hover:bg-surface-container-low">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">refresh</span>
                    {t('approvals.refreshBtn')}
                </button>
            </div>

            {/* Pending count */}
            {!loading && !error && (
                <p className="font-public-sans text-body-sm text-on-surface-variant">
                    {t('approvals.pendingCount').replace('{n}', transfers.length)}
                </p>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg border"
                     style={{ background: TONE_STYLE.error.bg, borderColor: 'var(--imm-error,#dc2626)', color: TONE_STYLE.error.fg }}>
                    <span className="material-symbols-outlined" aria-hidden="true">error</span>
                    <span className="font-public-sans text-body-sm">{error}</span>
                    <button onClick={load} className="ml-auto underline text-body-sm font-public-sans">Retry</button>
                </div>
            )}

            {/* Table */}
            <div className="rounded-xl border border-outline-variant overflow-hidden bg-surface">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="bg-surface-container-low">
                            <tr>
                                {[
                                    t('approvals.colTransferId'), t('approvals.colParcel'),
                                    t('approvals.colFrom'),       t('approvals.colTo'),
                                    t('approvals.colStep'),       t('approvals.colAmount'),
                                    t('approvals.colDate'),       t('approvals.colActions'),
                                ].map(col => (
                                    <th key={col} className="px-4 py-3 text-left font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider whitespace-nowrap">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <SkeletonRows /> :
                             transfers.length === 0 ? (
                                <tr><td colSpan={8} className="px-4 py-12 text-center">
                                    <div className="flex flex-col items-center gap-3 text-on-surface-variant">
                                        <span className="material-symbols-outlined text-[48px]" aria-hidden="true">task_alt</span>
                                        <span className="font-public-sans text-body-md">{t('approvals.noApprovals')}</span>
                                    </div>
                                </td></tr>
                             ) : transfers.map(tr => {
                                const selfDeal = tr.isSelfDealing;
                                return (
                                    <tr key={tr._id || tr.transferId}
                                        className={'border-b border-outline-variant last:border-0 transition-colors ' + (selfDeal ? 'bg-red-50' : 'hover:bg-surface-container-lowest')}>
                                        {/* Transfer ID */}
                                        <td className="px-4 py-3">
                                            <span className="font-mono text-label-sm text-on-surface-variant" title={tr.transferId}>
                                                {tr.transferId ? tr.transferId.slice(0,8)+'…' : '—'}
                                            </span>
                                        </td>
                                        {/* Parcel */}
                                        <td className="px-4 py-3">
                                            <Link to={'/property/'+encodeURIComponent(tr.parcelPin)}
                                                className="font-mono text-body-sm text-primary hover:underline underline-offset-2">
                                                {tr.parcelPin}
                                            </Link>
                                        </td>
                                        {/* From */}
                                        <td className="px-4 py-3">
                                            <div className="font-public-sans text-body-sm text-on-surface">{tr.fromOwner && tr.fromOwner.fullName || '—'}</div>
                                            <div className="font-mono text-label-sm text-on-surface-variant">{fmtAddr(tr.fromOwner && tr.fromOwner.address)}</div>
                                        </td>
                                        {/* To */}
                                        <td className="px-4 py-3">
                                            <div className="font-public-sans text-body-sm text-on-surface">{tr.toOwner && tr.toOwner.fullName || '—'}</div>
                                            <div className="font-mono text-label-sm text-on-surface-variant">{fmtAddr(tr.toOwner && tr.toOwner.address)}</div>
                                        </td>
                                        {/* Step */}
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-1">
                                                <StepBadge status={tr.status} t={t} />
                                                {selfDeal && (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
                                                          style={{ color: 'var(--imm-error,#dc2626)' }}>
                                                        <span className="material-symbols-outlined text-[12px]" aria-hidden="true">block</span>
                                                        {t('approvals.selfDealingWarning').split('—')[0].trim()}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {/* Amount */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="font-public-sans text-body-sm text-on-surface-variant">
                                                {tr.isGiftTransfer
                                                    ? t('approvals.isGift')
                                                    : t('approvals.consideration').replace('{n}', (tr.considerationLSL||0).toLocaleString())}
                                            </span>
                                        </td>
                                        {/* Date */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className="font-public-sans text-body-sm text-on-surface-variant">{fmtDate(tr.createdAt)}</span>
                                        </td>
                                        {/* Actions */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    disabled={!canAdvance || selfDeal || tr.status === 'COMPLETE' || tr.status === 'CANCELLED'}
                                                    onClick={() => setModal({ mode: 'advance', transfer: tr })}
                                                    title={selfDeal ? t('approvals.selfDealingWarning') : t('approvals.advanceBtn')}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-body-sm font-semibold font-public-sans text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                                                    style={{ background: selfDeal ? '#9ca3af' : 'var(--imm-primary-container)' }}>
                                                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_forward</span>
                                                    {t('approvals.advanceBtn')}
                                                </button>
                                                <button
                                                    disabled={tr.status === 'COMPLETE' || tr.status === 'CANCELLED'}
                                                    onClick={() => setModal({ mode: 'cancel', transfer: tr })}
                                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-outline text-body-sm font-public-sans text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                                                    <span className="material-symbols-outlined text-[14px]" aria-hidden="true">cancel</span>
                                                    {t('approvals.cancelBtn')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                             })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
