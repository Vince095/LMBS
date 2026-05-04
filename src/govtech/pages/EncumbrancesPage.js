/**
 * EncumbrancesPage — manage mortgages, liens, easements and caveats.
 *
 * Roles: REGISTRY_OFFICER, FINANCIAL_INST, ADMIN (write)
 *        All authenticated users (read)
 *
 * Features:
 *  - Paginated encumbrance list with type / status / parcelPin filters
 *  - Register new encumbrance (modal) — FINANCIAL_INST / REGISTRY_OFFICER / ADMIN
 *  - Discharge encumbrance — holder or officer
 *  - SEC-ENC-01/02 enforced server-side; client gates the buttons by role
 *  - FR-OT-003: Active encumbrances block transfer approvals (server-side check)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link }                  from 'react-router-dom';
import { encumbranceService }    from '../../services/encumbranceService';
import { useTranslation }        from '../../i18n';
import { useAuth }               from '../../auth';

const PAGE_LIMIT = 20;

const TYPE_META = {
    MORTGAGE: { bg:'#dbeafe', fg:'#1d4ed8', icon:'home'         },
    LIEN:     { bg:'#fef3c7', fg:'#92400e', icon:'gavel'         },
    EASEMENT: { bg:'#d1fae5', fg:'#065f46', icon:'route'         },
    CAVEAT:   { bg:'#fee2e2', fg:'#991b1b', icon:'warning'       },
};

const STATUS_META = {
    ACTIVE:     { bg:'#fee2e2', fg:'#991b1b', icon:'lock'         },
    DISCHARGED: { bg:'#dcfce7', fg:'#166534', icon:'lock_open'    },
    EXPIRED:    { bg:'#f1f5f9', fg:'#475569', icon:'timer_off'    },
};

const ENC_TYPES = ['MORTGAGE','LIEN','EASEMENT','CAVEAT'];
const DISTRICTS = ['Berea','Butha-Buthe','Leribe','Mafeteng','Maseru',
    "Mohale's Hoek",'Mokhotlong',"Qacha's Nek",'Quthing','Thaba-Tseka'];

function TypeBadge({ type }) {
    const m = TYPE_META[type] || { bg:'#f1f5f9', fg:'#475569', icon:'info' };
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
              style={{ background: m.bg, color: m.fg, fontSize:'11px' }}>
            <span className="material-symbols-outlined" style={{ fontSize:'12px' }}>{m.icon}</span>
            {type}
        </span>
    );
}

function StatusBadge({ status }) {
    const m = STATUS_META[status] || STATUS_META['ACTIVE'];
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
              style={{ background: m.bg, color: m.fg, fontSize:'11px' }}>
            <span className="material-symbols-outlined" style={{ fontSize:'12px' }}>{m.icon}</span>
            {status}
        </span>
    );
}

/* ── Toast ───────────────────────────────────────────────────────────────────── */
function Toast({ msg, kind, onDismiss }) {
    useEffect(() => { const id = setTimeout(onDismiss, 4500); return () => clearTimeout(id); }, [onDismiss]);
    const cls = kind === 'error'
        ? 'bg-red-50 border-red-300 text-red-800'
        : 'bg-green-50 border-green-300 text-green-800';
    return (
        <div role="status" aria-live="polite"
             className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border ${cls} font-public-sans text-body-sm max-w-sm`}>
            <span className="material-symbols-outlined text-[18px]">{kind==='error'?'error':'check_circle'}</span>
            <span className="flex-1">{msg}</span>
            <button onClick={onDismiss}><span className="material-symbols-outlined text-[18px] opacity-60">close</span></button>
        </div>
    );
}

/* ── Skeleton ────────────────────────────────────────────────────────────────── */
function SkeletonRows({ cols = 7 }) {
    return Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-outline-variant">
            {Array.from({ length: cols }).map((_, j) => (
                <td key={j} className="px-4 py-3">
                    <div className="h-3 rounded bg-slate-200" style={{ width: [90,100,140,80,120,90,80][j] || 80 }} />
                </td>
            ))}
        </tr>
    ));
}

/* ── Pagination ──────────────────────────────────────────────────────────────── */
function Pagination({ meta, page, onPage }) {
    if (!meta || meta.pages <= 1) return null;
    const from = (page-1)*meta.limit+1, to = Math.min(page*meta.limit, meta.total);
    return (
        <div className="flex items-center justify-between pt-4">
            <span className="font-public-sans text-body-sm text-on-surface-variant">{from}–{to} / {meta.total}</span>
            <div className="flex gap-2">
                <button disabled={page<=1} onClick={() => onPage(page-1)}
                    className="px-3 py-1.5 rounded border border-outline text-body-sm disabled:opacity-40 hover:bg-surface-container-low">
                    <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </button>
                <button disabled={page>=meta.pages} onClick={() => onPage(page+1)}
                    className="px-3 py-1.5 rounded border border-outline text-body-sm disabled:opacity-40 hover:bg-surface-container-low">
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
            </div>
        </div>
    );
}

/* ── Register Modal ───────────────────────────────────────────────────────────── */
const EMPTY_FORM = {
    parcelPin: '', type: 'MORTGAGE',
    holderName: '', holderAddress: '', holderInstitutionId: '',
    amountLSL: '', interestRateBps: '',
    startDate: '', expiryDate: '',
    description: '',
};

function RegisterModal({ onClose, onDone, t }) {
    const [form, setForm] = useState(EMPTY_FORM);
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState('');

    const f = (key) => ({
        value: form[key],
        onChange: (e) => setForm(prev => ({ ...prev, [key]: e.target.value })),
        disabled: busy,
    });

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.parcelPin.trim() || !form.holderName.trim()) {
            setErr(t('encumbrances.registerRequired'));
            return;
        }
        setBusy(true);
        setErr('');
        try {
            await encumbranceService.register({
                parcelPin: form.parcelPin.trim().toUpperCase(),
                type: form.type,
                holder: {
                    name: form.holderName.trim(),
                    address: form.holderAddress.trim().toLowerCase() || undefined,
                    institutionId: form.holderInstitutionId.trim() || undefined,
                },
                amountLSL:       form.amountLSL      ? Number(form.amountLSL)      : 0,
                interestRateBps: form.interestRateBps? Number(form.interestRateBps): 0,
                startDate:  form.startDate  || undefined,
                expiryDate: form.expiryDate || undefined,
                description: form.description.trim() || undefined,
            });
            onDone(t('encumbrances.registerSuccess'));
        } catch (ex) {
            setErr(ex.message || t('encumbrances.registerError'));
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h2 className="font-public-sans text-title-md font-bold text-on-surface">
                        {t('encumbrances.registerTitle')}
                    </h2>
                    <button onClick={onClose}><span className="material-symbols-outlined text-on-surface-variant">close</span></button>
                </div>

                {err && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-body-sm flex gap-2">
                        <span className="material-symbols-outlined text-[16px] mt-0.5">error</span>{err}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {/* Parcel + Type */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                {t('encumbrances.fieldParcel')} *
                            </label>
                            <input type="text" {...f('parcelPin')} placeholder="LS-MAS-…"
                                   className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                {t('encumbrances.fieldType')} *
                            </label>
                            <select {...f('type')}
                                    className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none">
                                {ENC_TYPES.map(t2 => <option key={t2} value={t2}>{t2}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Holder section */}
                    <div>
                        <p className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold mb-3 border-b border-outline-variant pb-2">
                            {t('encumbrances.sectionHolder')}
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                    {t('encumbrances.holderName')} *
                                </label>
                                <input type="text" {...f('holderName')} placeholder={t('encumbrances.holderNamePlaceholder')}
                                       className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                    {t('encumbrances.holderInstitution')}
                                </label>
                                <input type="text" {...f('holderInstitutionId')} placeholder="LNBLS-…"
                                       className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                            </div>
                            <div className="col-span-2 flex flex-col gap-1">
                                <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                    {t('encumbrances.holderAddress')}
                                </label>
                                <input type="text" {...f('holderAddress')} placeholder="0x…"
                                       className="border border-outline-variant rounded-md px-3 py-2 text-body-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none" />
                            </div>
                        </div>
                    </div>

                    {/* Financial terms */}
                    <div>
                        <p className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold mb-3 border-b border-outline-variant pb-2">
                            {t('encumbrances.sectionTerms')}
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                    {t('encumbrances.amountLSL')}
                                </label>
                                <input type="number" min="0" step="0.01" {...f('amountLSL')} placeholder="0.00"
                                       className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                    {t('encumbrances.interestBps')}
                                </label>
                                <input type="number" min="0" step="1" {...f('interestRateBps')} placeholder="0"
                                       className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                    {t('encumbrances.startDate')}
                                </label>
                                <input type="date" {...f('startDate')}
                                       className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                                    {t('encumbrances.expiryDate')}
                                </label>
                                <input type="date" {...f('expiryDate')}
                                       className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
                            {t('encumbrances.description')}
                        </label>
                        <textarea rows={3} {...f('description')} placeholder={t('encumbrances.descriptionPlaceholder')}
                                  className="border border-outline-variant rounded-md px-3 py-2 text-body-sm resize-none focus:ring-2 focus:ring-primary focus:outline-none" />
                    </div>

                    <div className="flex justify-end gap-3 pt-2 border-t border-outline-variant">
                        <button type="button" onClick={onClose} disabled={busy}
                                className="px-4 py-2 rounded-lg border border-outline text-body-sm hover:bg-surface-container disabled:opacity-50">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={busy}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-body-sm font-semibold hover:opacity-90 disabled:opacity-50">
                            {busy && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                            {t('encumbrances.registerBtn')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ── Discharge Confirm Modal ──────────────────────────────────────────────────── */
function DischargeModal({ enc, onClose, onDone, t }) {
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState('');

    async function handleConfirm() {
        setBusy(true);
        setErr('');
        try {
            await encumbranceService.discharge(enc.encumbranceId, {});
            onDone(t('encumbrances.dischargeSuccess'));
        } catch (ex) {
            setErr(ex.message || t('encumbrances.dischargeError'));
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-red-600">lock_open</span>
                    </div>
                    <h2 className="font-public-sans text-title-md font-bold text-on-surface">{t('encumbrances.dischargeTitle')}</h2>
                </div>

                <p className="font-public-sans text-body-sm text-on-surface-variant mb-2">
                    {t('encumbrances.dischargeConfirm')}
                </p>
                <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant mb-4 text-body-sm">
                    <p><span className="font-semibold">{t('encumbrances.fieldId')}:</span> {enc.encumbranceId}</p>
                    <p><span className="font-semibold">{t('encumbrances.fieldParcel')}:</span> {enc.parcelPin}</p>
                    <p><span className="font-semibold">{t('encumbrances.fieldType')}:</span> {enc.type}</p>
                    <p><span className="font-semibold">{t('encumbrances.holderName')}:</span> {enc.holder?.name}</p>
                </div>

                {err && <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-body-sm">{err}</div>}

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} disabled={busy}
                            className="px-4 py-2 rounded-lg border border-outline text-body-sm hover:bg-surface-container disabled:opacity-50">
                        {t('common.cancel')}
                    </button>
                    <button onClick={handleConfirm} disabled={busy}
                            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-error text-white text-body-sm font-semibold hover:opacity-90 disabled:opacity-50"
                            style={{ background:'#dc2626' }}>
                        {busy && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                        {t('encumbrances.dischargeBtn')}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════════════════ */
export default function EncumbrancesPage() {
    const { t }    = useTranslation();
    const { user } = useAuth();

    const [encumbrances, setEncumbrances] = useState([]);
    const [meta,         setMeta]         = useState(null);
    const [page,         setPage]         = useState(1);
    const [loading,      setLoading]      = useState(true);

    const [filterType,   setFilterType]   = useState('');
    const [filterStatus, setFilterStatus] = useState('ACTIVE');
    const [filterPin,    setFilterPin]    = useState('');

    const [showRegister, setShowRegister] = useState(false);
    const [dischargeEnc, setDischargeEnc] = useState(null);
    const [toast,        setToast]        = useState(null);

    const role     = user?.role || 'CITIZEN';
    const canWrite = ['FINANCIAL_INST','REGISTRY_OFFICER','ADMIN'].includes(role);
    const isOfficer= ['REGISTRY_OFFICER','ADMIN'].includes(role);

    const load = useCallback(async (p = page) => {
        setLoading(true);
        try {
            const params = { page: p, limit: PAGE_LIMIT };
            if (filterType)   params.type      = filterType;
            if (filterStatus) params.status    = filterStatus;
            if (filterPin)    params.parcelPin = filterPin.trim();
            const data = await encumbranceService.list(params);
            setEncumbrances(data.encumbrances || []);
            setMeta({ total: data.total, pages: data.pages, limit: data.limit });
        } catch {
            setEncumbrances([]);
        } finally {
            setLoading(false);
        }
    }, [page, filterType, filterStatus, filterPin]);

    useEffect(() => { load(1); setPage(1); }, [filterType, filterStatus, filterPin]);
    useEffect(() => { load(page); }, [page]);

    function handleDone(msg) {
        setShowRegister(false);
        setDischargeEnc(null);
        setToast({ msg, kind: 'success' });
        load(page);
    }

    function formatAmount(amt) {
        if (!amt) return '—';
        return 'LSL ' + Number(amt).toLocaleString('en-LS', { minimumFractionDigits: 2 });
    }

    function canDischarge(enc) {
        if (enc.status !== 'ACTIVE') return false;
        if (isOfficer) return true;
        return enc.holder?.address?.toLowerCase() === user?.address?.toLowerCase();
    }

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-public-sans text-display-sm font-bold text-on-surface">{t('encumbrances.heading')}</h1>
                    <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">{t('encumbrances.subheading')}</p>
                </div>
                {canWrite && (
                    <button onClick={() => setShowRegister(true)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-public-sans text-body-sm font-semibold hover:opacity-90">
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        {t('encumbrances.registerBtn')}
                    </button>
                )}
            </div>

            {/* FR-OT-003 notice */}
            <div className="flex items-start gap-3 p-4 rounded-xl border"
                 style={{ background:'#fffbeb', borderColor:'#d97706' }}>
                <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color:'#b45309' }}>info</span>
                <p className="font-public-sans text-body-sm" style={{ color:'#78350f' }}>
                    {t('encumbrances.frOt003Notice')}
                </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                        className="border border-outline-variant rounded-lg px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none bg-surface-container-lowest min-w-[140px]">
                    <option value="">{t('encumbrances.allTypes')}</option>
                    {ENC_TYPES.map(tp => <option key={tp} value={tp}>{tp}</option>)}
                </select>

                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        className="border border-outline-variant rounded-lg px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none bg-surface-container-lowest min-w-[140px]">
                    <option value="">{t('encumbrances.allStatuses')}</option>
                    {['ACTIVE','DISCHARGED','EXPIRED'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <input type="text" placeholder={t('encumbrances.filterByPin')}
                       value={filterPin} onChange={e => setFilterPin(e.target.value)}
                       className="border border-outline-variant rounded-lg px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none bg-surface-container-lowest" />

                {(filterType || filterStatus || filterPin) && (
                    <button onClick={() => { setFilterType(''); setFilterStatus('ACTIVE'); setFilterPin(''); }}
                            className="text-body-sm text-primary hover:underline">
                        {t('common.clearFilters')}
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-outline-variant bg-surface-container-low">
                            {[
                                t('encumbrances.colId'), t('encumbrances.colParcel'),
                                t('encumbrances.colType'), t('encumbrances.colHolder'),
                                t('encumbrances.colAmount'), t('encumbrances.colStatus'),
                                t('encumbrances.colDate'), t('encumbrances.colActions'),
                            ].map(h => (
                                <th key={h} className="px-4 py-3 font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <SkeletonRows cols={8} /> : encumbrances.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center font-public-sans text-body-md text-on-surface-variant">
                                    <span className="material-symbols-outlined text-4xl block mb-2 opacity-40">lock_open</span>
                                    {t('encumbrances.empty')}
                                </td>
                            </tr>
                        ) : encumbrances.map(enc => (
                            <tr key={enc.encumbranceId}
                                className="border-b border-outline-variant hover:bg-surface-container-low transition-colors">
                                <td className="px-4 py-3 font-mono text-body-sm text-on-surface whitespace-nowrap">
                                    {enc.encumbranceId}
                                </td>
                                <td className="px-4 py-3">
                                    <Link to={`/property/${enc.parcelPin}`}
                                          className="font-public-sans text-body-sm text-primary hover:underline whitespace-nowrap">
                                        {enc.parcelPin}
                                    </Link>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <TypeBadge type={enc.type} />
                                </td>
                                <td className="px-4 py-3 font-public-sans text-body-sm text-on-surface max-w-[160px] truncate"
                                    title={enc.holder?.name}>
                                    {enc.holder?.name || '—'}
                                </td>
                                <td className="px-4 py-3 font-public-sans text-body-sm text-on-surface whitespace-nowrap">
                                    {formatAmount(enc.amountLSL)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <StatusBadge status={enc.status} />
                                </td>
                                <td className="px-4 py-3 font-public-sans text-body-sm text-on-surface-variant whitespace-nowrap">
                                    {new Date(enc.startDate || enc.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    {canDischarge(enc) && (
                                        <button title={t('encumbrances.dischargeBtn')}
                                                onClick={() => setDischargeEnc(enc)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-body-sm hover:bg-red-50 transition-colors">
                                            <span className="material-symbols-outlined text-[16px]">lock_open</span>
                                            {t('encumbrances.dischargeBtn')}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Pagination meta={meta} page={page} onPage={setPage} />

            {/* Modals */}
            {showRegister && <RegisterModal onClose={() => setShowRegister(false)} onDone={handleDone} t={t} />}
            {dischargeEnc && <DischargeModal enc={dischargeEnc} onClose={() => setDischargeEnc(null)} onDone={handleDone} t={t} />}

            {/* Toast */}
            {toast && <Toast msg={toast.msg} kind={toast.kind} onDismiss={() => setToast(null)} />}
        </div>
    );
}
