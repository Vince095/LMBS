/**
 * AdminPanel — system user management (ADMIN role only).
 *
 * Features:
 *  - Live stats strip (users, parcels, pending transfers, open disputes)
 *  - Paginated user table with role, status, search, and filter
 *  - Edit modal (name, email, phone, district, LNID, role)
 *  - Deactivate / Activate toggle
 *  - Guards: cannot deactivate or demote your own account
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminService }    from '../../services/adminService';
import { http }            from '../../services/httpClient';
import { ENDPOINTS }       from '../../config/api';
import { useTranslation }  from '../../i18n';
import { useAuth }         from '../../auth';

const PAGE_LIMIT = 20;

const ALL_ROLES = [
    'CITIZEN', 'REGISTRY_OFFICER', 'SURVEYOR', 'NOTARY',
    'FINANCIAL_INST', 'AUDITOR', 'ADMIN',
];

const ROLE_STYLE = {
    CITIZEN:          { bg:'#f1f5f9', fg:'#475569' },
    REGISTRY_OFFICER: { bg:'#dbeafe', fg:'#1d4ed8' },
    SURVEYOR:         { bg:'#d1fae5', fg:'#065f46' },
    NOTARY:           { bg:'#fef3c7', fg:'#92400e' },
    FINANCIAL_INST:   { bg:'#ede9fe', fg:'#5b21b6' },
    AUDITOR:          { bg:'#fce7f3', fg:'#9d174d' },
    ADMIN:            { bg:'#fee2e2', fg:'#7f1d1d' },
};

function RoleBadge({ role }) {
    const s = ROLE_STYLE[role] || { bg:'#f1f5f9', fg:'#475569' };
    return (
        <span className="inline-block px-2 py-0.5 rounded-full text-label-caps font-semibold"
              style={{ background: s.bg, color: s.fg, fontSize:'10px', letterSpacing:'0.05em' }}>
            {role}
        </span>
    );
}

// ── Stats strip ───────────────────────────────────────────────────────────────
function StatsStrip({ stats, t }) {
    if (!stats) return null;
    const cards = [
        { label: t('adminPanel.statsUsers'),     value: stats.users?.total     ?? '—', icon:'group'        },
        { label: t('adminPanel.statsActive'),    value: stats.users?.active    ?? '—', icon:'person_check'  },
        { label: t('adminPanel.statsParcels'),   value: stats.parcels?.total   ?? '—', icon:'landscape'     },
        { label: t('adminPanel.statsTransfers'), value: stats.transfers?.pending ?? '—', icon:'swap_horiz' },
        { label: t('adminPanel.statsDisputes'),  value: stats.disputes?.open   ?? '—', icon:'gavel'         },
    ];
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map(c => (
                <div key={c.label} className="flex items-center gap-3 p-4 rounded-xl border border-outline-variant bg-surface">
                    <span className="material-symbols-outlined text-[28px] text-on-surface-variant" aria-hidden="true">{c.icon}</span>
                    <div>
                        <div className="font-public-sans text-h3 font-bold text-on-surface tabular-nums">{c.value}</div>
                        <div className="font-public-sans text-label-sm text-on-surface-variant mt-0.5">{c.label}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

// ── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ user: target, selfId, onClose, onSaved, t }) {
    const [form,       setForm]       = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error,      setError]      = useState(null);
    const firstRef = useRef(null);

    useEffect(() => {
        if (target) {
            setForm({
                name:     target.name     || '',
                email:    target.email    || '',
                phone:    target.phone    || '',
                district: target.district || '',
                lnid:     target.lnid     || '',
                role:     target.role     || 'CITIZEN',
            });
            setError(null); setSubmitting(false);
            setTimeout(() => firstRef.current && firstRef.current.focus(), 60);
        }
    }, [target]);

    if (!target) return null;

    const isSelf    = String(target._id) === String(selfId);
    const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }));

    function handleSubmit(e) {
        e.preventDefault();
        setSubmitting(true); setError(null);
        adminService.updateUser(target._id, form)
            .then(res => { setSubmitting(false); onSaved(res.user || res); })
            .catch(err => { setSubmitting(false); setError(err.message || 'Save failed'); });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.4)' }}
             onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-lg rounded-2xl bg-surface border border-outline-variant shadow-2xl overflow-y-auto max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant">
                    <div>
                        <h2 className="font-public-sans text-title-md font-bold text-on-surface">{t('adminPanel.editModal')}</h2>
                        <p className="font-public-sans text-label-sm text-on-surface-variant mt-0.5">{target.name}</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-low">
                        <span className="material-symbols-outlined text-[20px] text-on-surface-variant" aria-hidden="true">close</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
                    {/* Role (disabled for self to prevent lock-out) */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('adminPanel.roleLabel')}</label>
                        <select value={form.role} onChange={set('role')} disabled={isSelf}
                            className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50">
                            {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        {isSelf && <p className="font-public-sans text-label-sm text-on-surface-variant">{t('profilePage.readonlyHint')}</p>}
                    </div>

                    {/* Name */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('adminPanel.nameLabel')}</label>
                        <input ref={firstRef} type="text" value={form.name} onChange={set('name')} required
                            className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                    </div>

                    {/* Email + Phone */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('adminPanel.emailLabel')}</label>
                            <input type="email" value={form.email} onChange={set('email')}
                                className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('adminPanel.phoneLabel')}</label>
                            <input type="text" value={form.phone} onChange={set('phone')}
                                className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                    </div>

                    {/* District + LNID */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('adminPanel.districtLabel')}</label>
                            <input type="text" value={form.district} onChange={set('district')}
                                className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('adminPanel.lnidLabel')}</label>
                            <input type="text" value={form.lnid} onChange={set('lnid')}
                                className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg text-body-sm font-public-sans"
                             style={{ background:'var(--imm-error-container,#fee2e2)', color:'var(--imm-on-error-container,#7f1d1d)' }}>
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
                            style={{ background:'var(--imm-primary-container)' }}>
                            {submitting
                                ? <span className="inline-flex items-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    {t('adminPanel.saving')}
                                  </span>
                                : t('adminPanel.saveBtn')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonRows() {
    return Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-outline-variant">
            {[160,140,180,80,100,70,90,80].map((w,j) => (
                <td key={j} className="px-4 py-3">
                    <div className="h-3 rounded bg-surface-container-high" style={{ width: w }} />
                </td>
            ))}
        </tr>
    ));
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ meta, page, onPage }) {
    if (!meta || meta.pages <= 1) return null;
    const from = (page-1)*meta.limit+1, to = Math.min(page*meta.limit, meta.total);
    return (
        <div className="flex items-center justify-between pt-4">
            <span className="font-public-sans text-body-sm text-on-surface-variant">{from}–{to} / {meta.total}</span>
            <div className="flex gap-2">
                <button disabled={page<=1} onClick={()=>onPage(page-1)}
                    className="px-3 py-1.5 rounded-md border border-outline font-public-sans text-body-sm disabled:opacity-40 hover:bg-surface-container-low">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_left</span>
                </button>
                <button disabled={page>=meta.pages} onClick={()=>onPage(page+1)}
                    className="px-3 py-1.5 rounded-md border border-outline font-public-sans text-body-sm disabled:opacity-40 hover:bg-surface-container-low">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">chevron_right</span>
                </button>
            </div>
        </div>
    );
}

// ── Bulk Import Tab ───────────────────────────────────────────────────────────
const CSV_TEMPLATE_COLS = 'parcelNumber,location,district,areaM2,landUse,ownerName,ownerAddress,tokenId';
const CSV_TEMPLATE_EXAMPLE = [
    CSV_TEMPLATE_COLS,
    'LSO-001,Maseru Central,Maseru,1200,RESIDENTIAL,John Molapo,0xABCDEF1234567890,',
    'LSO-002,Leribe Valley,Leribe,3400,AGRICULTURAL,Mary Tsepo,,',
].join('\n');

function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE_EXAMPLE], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'parcel_import_template.csv'; a.click();
    URL.revokeObjectURL(url);
}

function BulkImportTab({ t, onToast }) {
    const [file,     setFile]     = useState(null);
    const [status,   setStatus]   = useState('idle'); // idle | loading | done | error
    const [result,   setResult]   = useState(null);   // { imported, skipped, errors[] }
    const [errMsg,   setErrMsg]   = useState(null);
    const fileRef = useRef(null);

    function handleFileChange(e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        setFile(f);
        setStatus('idle');
        setResult(null);
        setErrMsg(null);
    }

    async function handleImport() {
        if (!file) return;
        setStatus('loading');
        setResult(null);
        setErrMsg(null);
        try {
            const text = await file.text();
            const res  = await http.post(
                `${ENDPOINTS.titles}/import`,
                text,
                { headers: { 'Content-Type': 'text/csv' } }
            );
            setResult(res);
            setStatus('done');
            onToast(`Import complete: ${res.imported} imported, ${res.skipped} skipped`);
        } catch (err) {
            setStatus('error');
            setErrMsg(err.message || 'Import failed');
        }
    }

    function handleReset() {
        setFile(null); setStatus('idle'); setResult(null); setErrMsg(null);
        if (fileRef.current) fileRef.current.value = '';
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Instructions card */}
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-5 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[22px] text-primary" aria-hidden="true">info</span>
                    <span className="font-public-sans text-body-md font-semibold text-on-surface">
                        {t('adminPanel.bulkImportHow', 'How to use Bulk Import')}
                    </span>
                </div>
                <p className="font-public-sans text-body-sm text-on-surface-variant leading-relaxed">
                    {t('adminPanel.bulkImportInstructions',
                        'Upload a CSV file to register multiple parcels at once. Each row creates a DRAFT parcel for officer review. Only parcelNumber is required; all other columns are optional. Rows with a parcelNumber that already exists in the system are skipped.')}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={downloadTemplate}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline font-public-sans text-body-sm text-on-surface hover:bg-surface-container">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">download</span>
                        {t('adminPanel.bulkDownloadTemplate', 'Download CSV template')}
                    </button>
                    <span className="font-mono text-label-sm text-on-surface-variant bg-surface-container px-3 py-1 rounded-md border border-outline-variant overflow-x-auto max-w-full">
                        {CSV_TEMPLATE_COLS}
                    </span>
                </div>
            </div>

            {/* Upload area */}
            <div className="rounded-xl border-2 border-dashed border-outline-variant bg-surface flex flex-col items-center justify-center gap-4 p-10 text-center">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant" aria-hidden="true">upload_file</span>
                <div>
                    <p className="font-public-sans text-body-md font-semibold text-on-surface">
                        {file ? file.name : t('adminPanel.bulkDropHint', 'Select a CSV file to import')}
                    </p>
                    {file && (
                        <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">
                            {(file.size / 1024).toFixed(1)} KB
                        </p>
                    )}
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFileChange}
                    className="hidden" id="csv-upload" />
                <div className="flex gap-3">
                    <label htmlFor="csv-upload"
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline font-public-sans text-body-sm text-on-surface hover:bg-surface-container-low cursor-pointer select-none">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">folder_open</span>
                        {file ? t('adminPanel.bulkChangeFile', 'Change file') : t('adminPanel.bulkChooseFile', 'Choose file')}
                    </label>
                    {file && (
                        <button onClick={handleImport} disabled={status === 'loading'}
                            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg font-public-sans text-body-sm font-semibold text-white disabled:opacity-60"
                            style={{ background:'var(--imm-primary-container)' }}>
                            {status === 'loading'
                                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />{t('adminPanel.bulkImporting', 'Importing…')}</>
                                : <><span className="material-symbols-outlined text-[16px]" aria-hidden="true">upload</span>{t('adminPanel.bulkImportBtn', 'Import parcels')}</>
                            }
                        </button>
                    )}
                </div>
            </div>

            {/* Error banner */}
            {status === 'error' && errMsg && (
                <div className="flex items-center gap-3 p-4 rounded-lg border"
                     style={{ background:'var(--imm-error-container,#fee2e2)', borderColor:'var(--imm-error,#dc2626)', color:'var(--imm-on-error-container,#7f1d1d)' }}>
                    <span className="material-symbols-outlined" aria-hidden="true">error</span>
                    <span className="font-public-sans text-body-sm">{errMsg}</span>
                    <button onClick={handleReset} className="ml-auto underline font-public-sans text-body-sm">
                        {t('adminPanel.bulkReset', 'Reset')}
                    </button>
                </div>
            )}

            {/* Results */}
            {status === 'done' && result && (
                <div className="flex flex-col gap-4">
                    {/* Summary row */}
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { icon:'check_circle', label: t('adminPanel.bulkImported', 'Imported'), value: result.imported, color:'#166534', bg:'#dcfce7' },
                            { icon:'skip_next',    label: t('adminPanel.bulkSkipped',  'Skipped'),  value: result.skipped,  color:'#92400e', bg:'#fef3c7' },
                            { icon:'cancel',       label: t('adminPanel.bulkErrors',   'Errors'),   value: (result.errors || []).length, color:'#7f1d1d', bg:'#fee2e2' },
                        ].map(card => (
                            <div key={card.label} className="flex items-center gap-3 p-4 rounded-xl border border-outline-variant bg-surface">
                                <span className="material-symbols-outlined text-[24px]" style={{ color: card.color }} aria-hidden="true">{card.icon}</span>
                                <div>
                                    <div className="font-public-sans text-h3 font-bold tabular-nums" style={{ color: card.color }}>{card.value}</div>
                                    <div className="font-public-sans text-label-sm text-on-surface-variant">{card.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Error detail table */}
                    {result.errors && result.errors.length > 0 && (
                        <div className="rounded-xl border border-outline-variant overflow-hidden bg-surface">
                            <div className="px-4 py-3 bg-surface-container-low border-b border-outline-variant">
                                <span className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">
                                    {t('adminPanel.bulkErrorDetail', 'Row errors')}
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-surface-container-low">
                                        <tr>
                                            {['Row', 'Parcel #', 'Error'].map(h => (
                                                <th key={h} className="px-4 py-2 text-left font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.errors.map((e, i) => (
                                            <tr key={i} className="border-t border-outline-variant">
                                                <td className="px-4 py-2 font-mono text-label-sm text-on-surface-variant">{e.row ?? i + 2}</td>
                                                <td className="px-4 py-2 font-mono text-label-sm text-on-surface">{e.parcelNumber || '—'}</td>
                                                <td className="px-4 py-2 font-public-sans text-body-sm text-on-surface-variant">{e.error || e.message || String(e)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end">
                        <button onClick={handleReset}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-outline font-public-sans text-body-sm text-on-surface hover:bg-surface-container-low">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">refresh</span>
                            {t('adminPanel.bulkImportAnother', 'Import another file')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({ active, icon, label, onClick }) {
    return (
        <button onClick={onClick}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-t-lg border-b-2 font-public-sans text-body-sm font-semibold transition-colors"
            style={active
                ? { borderBottomColor:'var(--imm-primary-container)', color:'var(--imm-primary-container)', background:'transparent' }
                : { borderBottomColor:'transparent', color:'var(--imm-on-surface-variant)', background:'transparent' }}>
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>
            {label}
        </button>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminPanel() {
    const { t }    = useTranslation();
    const { user } = useAuth();

    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'import'

    const [users,   setUsers]   = useState([]);
    const [stats,   setStats]   = useState(null);
    const [meta,    setMeta]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);
    const [filters, setFilters] = useState({ role:'', active:'', q:'' });
    const [page,    setPage]    = useState(1);
    const [editTarget, setEditTarget] = useState(null);
    const [toast,      setToast]      = useState(null);

    const loadStats = useCallback(() => {
        adminService.stats().then(setStats).catch(() => {});
    }, []);

    const loadUsers = useCallback(() => {
        setLoading(true); setError(null);
        const params = { limit: PAGE_LIMIT, page };
        if (filters.role)   params.role   = filters.role;
        if (filters.active) params.active = filters.active;
        if (filters.q)      params.q      = filters.q;
        adminService.listUsers(params)
            .then(data => {
                setUsers(data.users || (Array.isArray(data) ? data : []));
                setMeta(data.total != null ? { total:data.total, page:data.page, limit:data.limit, pages:data.pages } : null);
            })
            .catch(err => setError(err.message || t('adminPanel.errorLoad')))
            .finally(() => setLoading(false));
    }, [filters, page, t]);

    useEffect(() => { loadStats(); }, [loadStats]);
    useEffect(() => { if (activeTab === 'users') loadUsers(); }, [loadUsers, activeTab]);

    function showToast(msg) { setToast(msg); setTimeout(()=>setToast(null), 4000); }

    function handleSaved(updated) {
        setEditTarget(null);
        setUsers(prev => prev.map(u => u._id === updated._id ? updated : u));
        showToast(t('adminPanel.successUpdated'));
        loadStats();
    }

    async function toggleActive(target) {
        const isSelf = String(target._id) === String(user && user.id);
        if (isSelf) return;
        try {
            const res = target.isActive
                ? await adminService.deactivateUser(target._id)
                : await adminService.activateUser(target._id);
            const updated = res.user || res;
            setUsers(prev => prev.map(u => u._id === updated._id ? updated : u));
            showToast(target.isActive ? t('adminPanel.successDeactivated') : t('adminPanel.successActivated'));
            loadStats();
        } catch(err) { showToast(err.message || 'Failed'); }
    }

    function fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric' });
    }

    const selfId = user && user.id;

    return (
        <div className="p-6 flex flex-col gap-6">
            {/* Edit modal */}
            <EditUserModal
                user={editTarget}
                selfId={selfId}
                onClose={() => setEditTarget(null)}
                onSaved={handleSaved}
                t={t}
            />

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg font-public-sans text-body-sm text-white"
                     style={{ background:'var(--imm-primary-container)' }}>
                    {toast}
                </div>
            )}

            {/* Header */}
            <div>
                <h1 className="font-public-sans text-title-lg font-bold text-on-surface">{t('adminPanel.heading')}</h1>
                <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">{t('adminPanel.subtitle')}</p>
            </div>

            {/* Stats strip */}
            <StatsStrip stats={stats} t={t} />

            {/* Tab bar */}
            <div className="flex gap-1 border-b border-outline-variant -mb-2">
                <TabBtn
                    active={activeTab === 'users'}
                    icon="group"
                    label={t('adminPanel.tabUsers', 'User Management')}
                    onClick={() => setActiveTab('users')}
                />
                <TabBtn
                    active={activeTab === 'import'}
                    icon="upload_file"
                    label={t('adminPanel.tabBulkImport', 'Bulk Import')}
                    onClick={() => setActiveTab('import')}
                />
            </div>

            {/* ── Bulk Import tab ────────────────────────────────────────── */}
            {activeTab === 'import' && (
                <BulkImportTab t={t} onToast={showToast} />
            )}

            {/* ── Users tab ─────────────────────────────────────────────── */}
            {activeTab === 'users' && (
                <>
                    {/* Filters */}
                    <div className="flex flex-wrap gap-3 items-end">
                        {/* Search */}
                        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
                            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">{t('adminPanel.filterSearch')}</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-on-surface-variant" aria-hidden="true">search</span>
                                <input type="text" value={filters.q}
                                    onChange={e => { setFilters(p=>({...p,q:e.target.value})); setPage(1); }}
                                    placeholder={t('adminPanel.filterSearch')}
                                    className="h-9 pl-9 pr-3 w-full rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                            </div>
                        </div>
                        {/* Role */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">{t('adminPanel.filterRole')}</label>
                            <select value={filters.role} onChange={e=>{ setFilters(p=>({...p,role:e.target.value})); setPage(1); }}
                                className="h-9 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                <option value="">{t('adminPanel.allRoles')}</option>
                                {ALL_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        {/* Active filter */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">{t('adminPanel.filterStatus')}</label>
                            <select value={filters.active} onChange={e=>{ setFilters(p=>({...p,active:e.target.value})); setPage(1); }}
                                className="h-9 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                <option value="">{t('adminPanel.allStatuses')}</option>
                                <option value="true">{t('adminPanel.active')}</option>
                                <option value="false">{t('adminPanel.inactive')}</option>
                            </select>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-3 p-4 rounded-lg border"
                             style={{ background:'var(--imm-error-container,#fee2e2)', borderColor:'var(--imm-error,#dc2626)', color:'var(--imm-on-error-container,#7f1d1d)' }}>
                            <span className="material-symbols-outlined" aria-hidden="true">error</span>
                            <span className="font-public-sans text-body-sm">{error}</span>
                            <button onClick={loadUsers} className="ml-auto underline font-public-sans text-body-sm">Retry</button>
                        </div>
                    )}

                    {/* Table */}
                    <div className="rounded-xl border border-outline-variant overflow-hidden bg-surface">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px]">
                                <thead className="bg-surface-container-low">
                                    <tr>
                                        {[
                                            t('adminPanel.colName'), t('adminPanel.colEmail'),
                                            t('adminPanel.colAddress'), t('adminPanel.colRole'),
                                            t('adminPanel.colLnid'), t('adminPanel.colStatus'),
                                            t('adminPanel.colJoined'), t('adminPanel.colActions'),
                                        ].map(col => (
                                            <th key={col} className="px-4 py-3 text-left font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider whitespace-nowrap">{col}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? <SkeletonRows /> :
                                     users.length === 0 ? (
                                        <tr><td colSpan={8} className="px-4 py-12 text-center">
                                            <div className="flex flex-col items-center gap-3 text-on-surface-variant">
                                                <span className="material-symbols-outlined text-[48px]" aria-hidden="true">group</span>
                                                <span className="font-public-sans text-body-md">{t('adminPanel.noUsers')}</span>
                                            </div>
                                        </td></tr>
                                     ) : users.map(u => {
                                        const isSelf = String(u._id) === String(selfId);
                                        return (
                                            <tr key={u._id} className="border-b border-outline-variant last:border-0 hover:bg-surface-container-lowest transition-colors">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-public-sans text-label-sm font-bold text-white"
                                                             style={{ background:'var(--imm-primary-container)' }}>
                                                            {(u.name||'?')[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-public-sans text-body-sm font-semibold text-on-surface">
                                                                {u.name}
                                                                {isSelf && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                                                                    style={{ background:'#dbeafe', color:'#1d4ed8' }}>{t('adminPanel.selfBadge')}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="font-public-sans text-body-sm text-on-surface-variant">{u.email || '—'}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-label-sm text-on-surface-variant" title={u.address}>
                                                        {u.address ? u.address.slice(0,8)+'…'+u.address.slice(-4) : '—'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                                                <td className="px-4 py-3">
                                                    <span className="font-mono text-label-sm text-on-surface-variant">{u.lnid || '—'}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-caps font-semibold"
                                                          style={u.isActive ? { background:'#dcfce7', color:'#166534' } : { background:'#f3f4f6', color:'#6b7280' }}>
                                                        <span className="material-symbols-outlined text-[11px]" aria-hidden="true">{u.isActive ? 'check_circle' : 'block'}</span>
                                                        {u.isActive ? t('adminPanel.badgeActive') : t('adminPanel.badgeInactive')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className="font-public-sans text-body-sm text-on-surface-variant">{fmtDate(u.createdAt)}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setEditTarget(u)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-outline font-public-sans text-label-sm text-on-surface hover:bg-surface-container-low">
                                                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">edit</span>
                                                            {t('adminPanel.editBtn')}
                                                        </button>
                                                        <button
                                                            disabled={isSelf}
                                                            onClick={() => toggleActive(u)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border font-public-sans text-label-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                                            style={u.isActive
                                                                ? { borderColor:'var(--imm-error,#dc2626)', color:'var(--imm-error,#dc2626)' }
                                                                : { borderColor:'#16a34a', color:'#16a34a' }}>
                                                            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                                                                {u.isActive ? 'person_off' : 'person_check'}
                                                            </span>
                                                            {u.isActive ? t('adminPanel.deactivateBtn') : t('adminPanel.activateBtn')}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                     })}
                                </tbody>
                            </table>
                        </div>
                        {!loading && users.length > 0 && (
                            <div className="px-4 pb-4">
                                <Pagination meta={meta} page={page} onPage={setPage} />
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
