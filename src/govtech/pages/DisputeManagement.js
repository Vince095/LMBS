/**
 * DisputeManagement — officer-facing dispute resolution queue.
 *
 * Roles: REGISTRY_OFFICER, ADMIN
 *
 * Features:
 *  - Paginated dispute list with status / parcelPin / assignment filters
 *  - Assign dispute to a registry officer (with optional note)
 *  - Add case notes
 *  - Resolve (UPHELD / DISMISSED / WITHDRAWN / ESCALATED) with notes + court ref
 *  - Escalate to higher authority
 *  - SEC-DISPUTE-01/02/03 enforced both client-side and server-side
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link }                from 'react-router-dom';
import { disputeService }      from '../../services/disputeService';
import { adminService }        from '../../services/adminService';
import { useTranslation }      from '../../i18n';
import { useAuth }             from '../../auth';

const PAGE_LIMIT = 20;

/* ── Status config ───────────────────────────────────────────────────────────── */
const STATUS_META = {
    OPEN:         { bg:'#fef3c7', fg:'#92400e', icon:'pending'        },
    UNDER_REVIEW: { bg:'#dbeafe', fg:'#1d4ed8', icon:'rate_review'    },
    ESCALATED:    { bg:'#fee2e2', fg:'#991b1b', icon:'arrow_upward'   },
    RESOLVED:     { bg:'#dcfce7', fg:'#166534', icon:'check_circle'   },
    WITHDRAWN:    { bg:'#f1f5f9', fg:'#475569', icon:'undo'           },
};
const DECISION_OPTIONS = ['UPHELD','DISMISSED','WITHDRAWN','ESCALATED'];

function StatusBadge({ status }) {
    const m = STATUS_META[status] || STATUS_META['OPEN'];
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap"
              style={{ background: m.bg, color: m.fg, fontSize:'11px' }}>
            <span className="material-symbols-outlined" style={{ fontSize:'12px' }}>{m.icon}</span>
            {status.replace('_',' ')}
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

/* ── Skeleton rows ────────────────────────────────────────────────────────────── */
function SkeletonRows({ cols = 7 }) {
    return Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="animate-pulse border-b border-outline-variant">
            {Array.from({ length: cols }).map((_, j) => (
                <td key={j} className="px-4 py-3">
                    <div className="h-3 rounded bg-slate-200" style={{ width: [120,80,180,90,100,130,80][j] || 80 }} />
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

/* ── Assign Modal ─────────────────────────────────────────────────────────────── */
function AssignModal({ dispute, officers, currentUser, onClose, onDone, t }) {
    const [officerAddr, setOfficerAddr] = useState('');
    const [notes, setNotes]             = useState('');
    const [busy, setBusy]               = useState(false);
    const [err, setErr]                 = useState('');

    const eligibleOfficers = officers.filter(o =>
        o.address?.toLowerCase() !== dispute.filerAddress?.toLowerCase()
    );

    async function handleSubmit(e) {
        e.preventDefault();
        if (!officerAddr) { setErr(t('disputeMgmt.assignSelectOfficer')); return; }
        setBusy(true);
        setErr('');
        try {
            const chosen = eligibleOfficers.find(o => o.address?.toLowerCase() === officerAddr);
            await disputeService.assign(dispute.disputeId, {
                officerAddress: officerAddr,
                officerName: chosen?.name || officerAddr,
                notes,
            });
            onDone(t('disputeMgmt.assignSuccess'));
        } catch (ex) {
            setErr(ex.message || t('disputeMgmt.assignError'));
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-public-sans text-title-md font-bold text-on-surface">
                        {t('disputeMgmt.assignTitle')}
                    </h2>
                    <button onClick={onClose}>
                        <span className="material-symbols-outlined text-on-surface-variant">close</span>
                    </button>
                </div>

                <p className="font-public-sans text-body-sm text-on-surface-variant mb-4">
                    {t('disputeMgmt.assigningDispute')}: <span className="font-semibold text-on-surface">{dispute.disputeId}</span>
                    {' '}— Parcel <Link to={`/property/${dispute.parcelPin}`} className="text-primary underline">{dispute.parcelPin}</Link>
                </p>

                {err && (
                    <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-body-sm flex gap-2">
                        <span className="material-symbols-outlined text-[16px] mt-0.5">error</span>{err}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider">
                            {t('disputeMgmt.assignOfficerLabel')} *
                        </label>
                        <select value={officerAddr} onChange={e => setOfficerAddr(e.target.value)} disabled={busy}
                                className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none">
                            <option value="">— {t('disputeMgmt.selectOfficer')} —</option>
                            {eligibleOfficers.map(o => (
                                <option key={o._id} value={o.address?.toLowerCase()}>
                                    {o.name || o.email || o.address} ({o.role})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider">
                            {t('disputeMgmt.assignNoteLabel')}
                        </label>
                        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} disabled={busy}
                                  placeholder={t('disputeMgmt.assignNotePlaceholder')}
                                  className="border border-outline-variant rounded-md px-3 py-2 text-body-sm resize-none focus:ring-2 focus:ring-primary focus:outline-none" />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} disabled={busy}
                                className="px-4 py-2 rounded-lg border border-outline text-body-sm hover:bg-surface-container disabled:opacity-50">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={busy}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-body-sm font-semibold hover:opacity-90 disabled:opacity-50">
                            {busy && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                            {t('disputeMgmt.assignBtn')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ── Resolve Modal ────────────────────────────────────────────────────────────── */
function ResolveModal({ dispute, onClose, onDone, t }) {
    const [decision, setDecision] = useState('DISMISSED');
    const [notes, setNotes]       = useState('');
    const [courtRef, setCourtRef] = useState('');
    const [busy, setBusy]         = useState(false);
    const [err, setErr]           = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        if (!notes.trim() && decision !== 'WITHDRAWN') {
            setErr(t('disputeMgmt.resolveNotesRequired'));
            return;
        }
        setBusy(true);
        setErr('');
        try {
            await disputeService.resolve(dispute.disputeId, { decision, notes, courtOrderRef: courtRef });
            onDone(t('disputeMgmt.resolveSuccess'));
        } catch (ex) {
            setErr(ex.message || t('disputeMgmt.resolveError'));
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-public-sans text-title-md font-bold text-on-surface">
                        {t('disputeMgmt.resolveTitle')}
                    </h2>
                    <button onClick={onClose}>
                        <span className="material-symbols-outlined text-on-surface-variant">close</span>
                    </button>
                </div>

                <p className="font-public-sans text-body-sm text-on-surface-variant mb-4">
                    {dispute.disputeId} — <span className="font-medium text-on-surface">{dispute.description?.slice(0,80)}…</span>
                </p>

                {err && (
                    <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-body-sm flex gap-2">
                        <span className="material-symbols-outlined text-[16px] mt-0.5">error</span>{err}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {/* Decision */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider">
                            {t('disputeMgmt.decisionLabel')} *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {DECISION_OPTIONS.map(d => (
                                <button key={d} type="button" disabled={busy}
                                        onClick={() => setDecision(d)}
                                        className={`px-3 py-2 rounded-lg border text-body-sm font-semibold transition-colors ${
                                            decision === d
                                                ? 'bg-primary text-white border-primary'
                                                : 'border-outline-variant text-on-surface hover:bg-surface-container-low'
                                        }`}>
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider">
                            {t('disputeMgmt.resolveNotes')} {decision !== 'WITHDRAWN' ? '*' : ''}
                        </label>
                        <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} disabled={busy}
                                  placeholder={t('disputeMgmt.resolveNotesPlaceholder')}
                                  className="border border-outline-variant rounded-md px-3 py-2 text-body-sm resize-none focus:ring-2 focus:ring-primary focus:outline-none" />
                    </div>

                    {/* Court order ref (optional) */}
                    <div className="flex flex-col gap-1">
                        <label className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider">
                            {t('disputeMgmt.courtRefLabel')}
                        </label>
                        <input type="text" value={courtRef} onChange={e => setCourtRef(e.target.value)} disabled={busy}
                               placeholder="e.g. HCC/2024/001"
                               className="border border-outline-variant rounded-md px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none" />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} disabled={busy}
                                className="px-4 py-2 rounded-lg border border-outline text-body-sm hover:bg-surface-container disabled:opacity-50">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={busy}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-body-sm font-semibold hover:opacity-90 disabled:opacity-50">
                            {busy && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                            {t('disputeMgmt.resolveBtn')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ── Add Note Modal ───────────────────────────────────────────────────────────── */
function NoteModal({ dispute, onClose, onDone, t }) {
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        if (!note.trim()) { setErr(t('disputeMgmt.noteRequired')); return; }
        setBusy(true);
        try {
            await disputeService.addNote(dispute.disputeId, { note });
            onDone(t('disputeMgmt.noteSuccess'));
        } catch (ex) {
            setErr(ex.message || t('disputeMgmt.noteError'));
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-public-sans text-title-md font-bold text-on-surface">{t('disputeMgmt.noteTitle')}</h2>
                    <button onClick={onClose}><span className="material-symbols-outlined text-on-surface-variant">close</span></button>
                </div>
                <p className="font-public-sans text-body-sm text-on-surface-variant mb-4">{dispute.disputeId}</p>
                {err && (
                    <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-body-sm">{err}</div>
                )}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <textarea rows={4} value={note} onChange={e => setNote(e.target.value)} disabled={busy}
                              placeholder={t('disputeMgmt.notePlaceholder')}
                              className="border border-outline-variant rounded-md px-3 py-2 text-body-sm resize-none focus:ring-2 focus:ring-primary focus:outline-none" />
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={busy}
                                className="px-4 py-2 rounded-lg border border-outline text-body-sm hover:bg-surface-container disabled:opacity-50">
                            {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={busy}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-body-sm font-semibold hover:opacity-90 disabled:opacity-50">
                            {busy && <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>}
                            {t('disputeMgmt.noteBtn')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ── Detail panel ─────────────────────────────────────────────────────────────── */
function DetailPanel({ dispute, onClose, t }) {
    if (!dispute) return null;
    return (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
            <div className="bg-surface w-full max-w-xl h-full overflow-y-auto shadow-2xl border-l border-outline-variant p-6"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="font-public-sans text-title-md font-bold text-on-surface">{dispute.disputeId}</h2>
                        <Link to={`/property/${dispute.parcelPin}`} className="font-public-sans text-body-sm text-primary hover:underline">
                            {t('disputeMgmt.viewParcel')}: {dispute.parcelPin}
                        </Link>
                    </div>
                    <button onClick={onClose}><span className="material-symbols-outlined text-on-surface-variant text-2xl">close</span></button>
                </div>

                <div className="flex flex-wrap gap-2 mb-5">
                    <StatusBadge status={dispute.status} />
                    {dispute.assignedOfficer && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                            <span className="material-symbols-outlined text-[12px]">person</span>
                            {t('disputeMgmt.assignedTo')}: {dispute.assignedOfficer}
                        </span>
                    )}
                </div>

                {/* Description */}
                <div className="mb-4 p-4 rounded-xl bg-surface-container-low border border-outline-variant">
                    <p className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider mb-1">{t('disputeMgmt.description')}</p>
                    <p className="font-public-sans text-body-sm text-on-surface">{dispute.description}</p>
                </div>

                {/* Filer */}
                <div className="mb-4 grid grid-cols-2 gap-3">
                    <div>
                        <p className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider mb-0.5">{t('disputeMgmt.filer')}</p>
                        <p className="font-mono text-xs text-on-surface break-all">{dispute.filerAddress}</p>
                    </div>
                    <div>
                        <p className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider mb-0.5">{t('disputeMgmt.filed')}</p>
                        <p className="font-public-sans text-body-sm text-on-surface">{new Date(dispute.createdAt).toLocaleDateString()}</p>
                    </div>
                </div>

                {/* Resolution */}
                {dispute.resolution?.decision && (
                    <div className="mb-4 p-4 rounded-xl bg-green-50 border border-green-200">
                        <p className="font-public-sans text-label-caps text-green-700 text-xs uppercase tracking-wider mb-1">{t('disputeMgmt.resolution')}</p>
                        <p className="font-semibold text-green-800">{dispute.resolution.decision}</p>
                        {dispute.resolution.notes && <p className="text-sm text-green-700 mt-1">{dispute.resolution.notes}</p>}
                        {dispute.resolution.courtOrderRef && (
                            <p className="text-xs text-green-600 mt-1">{t('disputeMgmt.courtRef')}: {dispute.resolution.courtOrderRef}</p>
                        )}
                    </div>
                )}

                {/* Evidence */}
                {dispute.evidence?.length > 0 && (
                    <div className="mb-4">
                        <p className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider mb-2">{t('disputeMgmt.evidence')} ({dispute.evidence.length})</p>
                        <div className="flex flex-col gap-2">
                            {dispute.evidence.map((ev, i) => (
                                <div key={i} className="p-3 rounded-lg bg-surface-container-low border border-outline-variant text-xs">
                                    <p className="font-semibold text-on-surface">{ev.description || 'Evidence ' + (i+1)}</p>
                                    {ev.ipfsCid && <p className="font-mono text-on-surface-variant mt-0.5 break-all">{ev.ipfsCid}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Notes */}
                {dispute.notes?.length > 0 && (
                    <div>
                        <p className="font-public-sans text-label-caps text-on-surface-variant text-xs uppercase tracking-wider mb-2">{t('disputeMgmt.notes')} ({dispute.notes.length})</p>
                        <div className="flex flex-col gap-2">
                            {dispute.notes.map((n, i) => (
                                <div key={i} className="p-3 rounded-lg bg-surface-container-low border border-outline-variant">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-mono text-xs text-on-surface-variant">{n.author}</span>
                                        <span className="text-xs text-on-surface-variant">{new Date(n.addedAt).toLocaleDateString()}</span>
                                    </div>
                                    <p className="font-public-sans text-body-sm text-on-surface">{n.note}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════════════════ */
export default function DisputeManagement() {
    const { t }         = useTranslation();
    const { user }      = useAuth();

    const [disputes,  setDisputes]  = useState([]);
    const [meta,      setMeta]      = useState(null);
    const [page,      setPage]      = useState(1);
    const [loading,   setLoading]   = useState(true);
    const [officers,  setOfficers]  = useState([]);

    const [filterStatus, setFilterStatus] = useState('');
    const [filterPin,    setFilterPin]    = useState('');
    const [filterMine,   setFilterMine]   = useState(false);

    const [modal,   setModal]   = useState(null);  // { type: 'assign'|'resolve'|'note', dispute }
    const [detail,  setDetail]  = useState(null);  // dispute shown in side panel
    const [toast,   setToast]   = useState(null);

    const searchRef = useRef(null);

    /* load disputes */
    const load = useCallback(async (p = page) => {
        setLoading(true);
        try {
            const params = { page: p, limit: PAGE_LIMIT };
            if (filterStatus) params.status    = filterStatus;
            if (filterPin)    params.parcelPin = filterPin.trim();
            if (filterMine)   params.mine      = 'true';
            const data = await disputeService.list(params);
            setDisputes(data.disputes || []);
            setMeta({ total: data.total, pages: data.pages, limit: data.limit });
        } catch {
            setDisputes([]);
        } finally {
            setLoading(false);
        }
    }, [page, filterStatus, filterPin, filterMine]);

    /* load officers list for assignment dropdown */
    const loadOfficers = useCallback(async () => {
        try {
            const data = await adminService.listUsers({ role: 'REGISTRY_OFFICER', active: 'true', limit: 200 });
            setOfficers(data.users || []);
        } catch { /* non-critical */ }
    }, []);

    useEffect(() => { load(1); setPage(1); }, [filterStatus, filterPin, filterMine]);
    useEffect(() => { load(page); }, [page]);
    useEffect(() => { loadOfficers(); }, []);

    function handleAction(type, dispute) {
        setModal({ type, dispute });
    }

    function handleDone(msg) {
        setModal(null);
        setDetail(null);
        setToast({ msg, kind: 'success' });
        load(page);
    }

    const TERMINAL = ['RESOLVED', 'WITHDRAWN'];
    const isTerminal = (d) => TERMINAL.includes(d.status);

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

            {/* Header */}
            <div>
                <h1 className="font-public-sans text-display-sm font-bold text-on-surface">{t('disputeMgmt.heading')}</h1>
                <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">{t('disputeMgmt.subheading')}</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        className="border border-outline-variant rounded-lg px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none bg-surface-container-lowest min-w-[160px]">
                    <option value="">{t('disputeMgmt.allStatuses')}</option>
                    {Object.keys(STATUS_META).map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                </select>

                <input ref={searchRef} type="text" placeholder={t('disputeMgmt.filterByPin')}
                       value={filterPin} onChange={e => setFilterPin(e.target.value)}
                       className="border border-outline-variant rounded-lg px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary focus:outline-none bg-surface-container-lowest" />

                <label className="flex items-center gap-2 font-public-sans text-body-sm text-on-surface cursor-pointer select-none">
                    <input type="checkbox" checked={filterMine} onChange={e => setFilterMine(e.target.checked)} className="w-4 h-4 accent-primary" />
                    {t('disputeMgmt.myDisputes')}
                </label>

                {(filterStatus || filterPin || filterMine) && (
                    <button onClick={() => { setFilterStatus(''); setFilterPin(''); setFilterMine(false); }}
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
                                t('disputeMgmt.colId'), t('disputeMgmt.colParcel'),
                                t('disputeMgmt.colDescription'), t('disputeMgmt.colStatus'),
                                t('disputeMgmt.colAssigned'), t('disputeMgmt.colFiled'),
                                t('disputeMgmt.colActions'),
                            ].map(h => (
                                <th key={h} className="px-4 py-3 font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <SkeletonRows /> : disputes.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-12 text-center font-public-sans text-body-md text-on-surface-variant">
                                    <span className="material-symbols-outlined text-4xl block mb-2 opacity-40">gavel</span>
                                    {t('disputeMgmt.empty')}
                                </td>
                            </tr>
                        ) : disputes.map(d => (
                            <tr key={d.disputeId}
                                className="border-b border-outline-variant hover:bg-surface-container-low transition-colors cursor-pointer"
                                onClick={() => setDetail(d)}>
                                <td className="px-4 py-3 font-mono text-body-sm text-on-surface whitespace-nowrap">
                                    {d.disputeId}
                                </td>
                                <td className="px-4 py-3">
                                    <Link to={`/property/${d.parcelPin}`}
                                          onClick={e => e.stopPropagation()}
                                          className="font-public-sans text-body-sm text-primary hover:underline whitespace-nowrap">
                                        {d.parcelPin}
                                    </Link>
                                </td>
                                <td className="px-4 py-3 font-public-sans text-body-sm text-on-surface max-w-xs truncate">
                                    {d.description}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                    <StatusBadge status={d.status} />
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-on-surface-variant truncate max-w-[120px]">
                                    {d.assignedOfficer
                                        ? <span title={d.assignedOfficer}>{d.assignedOfficer.slice(0,10)}…</span>
                                        : <span className="text-on-surface-variant italic">{t('disputeMgmt.unassigned')}</span>}
                                </td>
                                <td className="px-4 py-3 font-public-sans text-body-sm text-on-surface-variant whitespace-nowrap">
                                    {new Date(d.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center gap-1">
                                        {/* Assign */}
                                        {!isTerminal(d) && (
                                            <button title={t('disputeMgmt.assignBtn')}
                                                    onClick={() => handleAction('assign', d)}
                                                    className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors">
                                                <span className="material-symbols-outlined text-[18px]">person_add</span>
                                            </button>
                                        )}
                                        {/* Note */}
                                        {!isTerminal(d) && (
                                            <button title={t('disputeMgmt.noteBtn')}
                                                    onClick={() => handleAction('note', d)}
                                                    className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-700 transition-colors">
                                                <span className="material-symbols-outlined text-[18px]">note_add</span>
                                            </button>
                                        )}
                                        {/* Resolve */}
                                        {!isTerminal(d) && (
                                            <button title={t('disputeMgmt.resolveBtn')}
                                                    onClick={() => handleAction('resolve', d)}
                                                    className="p-1.5 rounded-lg hover:bg-green-50 text-green-700 transition-colors">
                                                <span className="material-symbols-outlined text-[18px]">task_alt</span>
                                            </button>
                                        )}
                                        {/* View detail */}
                                        <button title={t('common.view')}
                                                onClick={() => setDetail(d)}
                                                className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors">
                                            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Pagination meta={meta} page={page} onPage={setPage} />

            {/* Modals */}
            {modal?.type === 'assign' && (
                <AssignModal dispute={modal.dispute} officers={officers} currentUser={user}
                             onClose={() => setModal(null)} onDone={handleDone} t={t} />
            )}
            {modal?.type === 'resolve' && (
                <ResolveModal dispute={modal.dispute} onClose={() => setModal(null)} onDone={handleDone} t={t} />
            )}
            {modal?.type === 'note' && (
                <NoteModal dispute={modal.dispute} onClose={() => setModal(null)} onDone={handleDone} t={t} />
            )}

            {/* Detail side panel */}
            {detail && <DetailPanel dispute={detail} onClose={() => setDetail(null)} t={t} />}

            {/* Toast */}
            {toast && <Toast msg={toast.msg} kind={toast.kind} onDismiss={() => setToast(null)} />}
        </div>
    );
}
