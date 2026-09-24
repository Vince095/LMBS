/**
 * Property Details — replicates `stitch/property_details/screen.png`.
 *
 * Live data sources:
 *   GET /api/certificates/:pin         → blockchain certificate
 *   GET /api/parcels/:pin/history      → Provenance Ledger events
 *   GET /api/parcels/:pin/documents    → Official Documents panel
 *   POST /api/parcels/:pin/documents   → inline document upload
 *
 * Provenance Ledger event types follow SAD section 4.4 chaincode events:
 *   PARCEL_REGISTERED | TITLE_ISSUED | TITLE_AMENDED | TITLE_REVOKED
 *   TRANSFER_INITIATED | TRANSFER_APPROVED | TRANSFER_COMPLETED | TRANSFER_CANCELLED
 *   DOCUMENT_ATTACHED | BOUNDARY_UPDATED | LEGACY_DIGITISATION | AUDIT_EVENT
 *
 * NOTE: Encumbrances and disputes are NOT handled in this release and do NOT
 *       appear anywhere on this page.
 *
 * All UI strings use useTranslation() (SRS NFR-009).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import GoogleMap from '../components/GoogleMap';
import { shareOrCopy } from '../components/actions';
import { parcelService, certificateService } from '../../services';
import { disputeService } from '../../services/disputeService';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../auth';

// ─── Event type visual registry ──────────────────────────────────────────────
// Colors / icons mirror provenanceService.js EVENT_META .
// Labels come from t('eventTypes.<key>') so they switch language automatically.
// Encumbrance and dispute types are intentionally absent from this release.
const EVENT_STYLE = {
    PARCEL_REGISTERED:  { color: '#0F172A', bg: '#F1F5F9', icon: 'add_location_alt'  },
    BOUNDARY_UPDATED:   { color: '#059669', bg: '#ECFDF5', icon: 'edit_location_alt' },
    TITLE_ISSUED:       { color: '#0284C7', bg: '#E0F2FE', icon: 'workspace_premium' },
    TITLE_AMENDED:      { color: '#D97706', bg: '#FFFBEB', icon: 'contract_edit'     },
    TITLE_REVOKED:      { color: '#DC2626', bg: '#FEF2F2', icon: 'cancel'            },
    TRANSFER_INITIATED: { color: '#7C3AED', bg: '#F5F3FF', icon: 'swap_horiz'        },
    TRANSFER_APPROVED:  { color: '#0284C7', bg: '#E0F2FE', icon: 'verified'          },
    TRANSFER_COMPLETED: { color: '#059669', bg: '#ECFDF5', icon: 'check_circle'      },
    TRANSFER_CANCELLED: { color: '#475569', bg: '#F8FAFC', icon: 'cancel'            },
    DOCUMENT_ATTACHED:  { color: '#0369A1', bg: '#EFF6FF', icon: 'attach_file'       },
    LEGACY_DIGITISATION:{ color: '#475569', bg: '#F8FAFC', icon: 'history'           },
    AUDIT_EVENT:        { color: '#475569', bg: '#F8FAFC', icon: 'policy'            },
};

function getEventStyle(eventType) {
    return EVENT_STYLE[eventType] || { color: '#475569', bg: '#F8FAFC', icon: 'info' };
}


// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtSize(kb) {
    if (!kb && kb !== 0) return '';
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
}

// ─── EventTypeBadge ───────────────────────────────────────────────────────────
function EventTypeBadge({ eventType }) {
    const { t }   = useTranslation();
    const style   = getEventStyle(eventType);
    const label   = eventType ? t(`eventTypes.${eventType}`) : t('property.colEventType');
    return (
        <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-public-sans font-bold whitespace-nowrap"
            style={{ background: style.bg, color: style.color, fontSize: '10px', letterSpacing: '0.05em' }}
        >
            <span className="material-symbols-outlined" style={{ fontSize: '11px' }} aria-hidden="true">{style.icon}</span>
            {label}
        </span>
    );
}

// ─── UploadDocumentPanel ──────────────────────────────────────────────────────
function UploadDocumentPanel({ pin, onUploaded }) {
    const { t }                    = useTranslation();
    const fileRef                  = useRef(null);
    const [file,   setFile]        = useState(null);
    const [type,   setType]        = useState('OTHER');
    const [busy,   setBusy]        = useState(false);
    const [error,  setError]       = useState('');

    // Document types built from translation keys so labels switch language
    const DOC_TYPES_SELECT = [
        { value: 'SURVEY_PLAN',       label: t('docTypes.SURVEY_PLAN')       },
        { value: 'ENV_ASSESSMENT',    label: t('docTypes.ENV_ASSESSMENT')    },
        { value: 'DEED_OF_SALE',      label: t('docTypes.DEED_OF_SALE')      },
        { value: 'TITLE_DEED',        label: t('docTypes.TITLE_DEED')        },
        { value: 'COURT_ORDER',       label: t('docTypes.COURT_ORDER')       },
        { value: 'ID_DOCUMENT',       label: t('docTypes.ID_DOCUMENT')       },
        { value: 'POWER_OF_ATTORNEY', label: t('docTypes.POWER_OF_ATTORNEY') },
        { value: 'OTHER',             label: t('docTypes.OTHER')             },
    ];

    function handleFile(e) {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        setFile(f);
        setError('');
        // Auto-guess document type from filename
        const n = f.name.toLowerCase();
        if      (n.includes('survey'))                         setType('SURVEY_PLAN');
        else if (n.includes('env') || n.includes('environ'))   setType('ENV_ASSESSMENT');
        else if (n.includes('deed') && n.includes('sale'))     setType('DEED_OF_SALE');
        else if (n.includes('title'))                          setType('TITLE_DEED');
        else if (n.includes('court') || n.includes('order'))   setType('COURT_ORDER');
        else if (n.includes(' id') || n.includes('identity'))  setType('ID_DOCUMENT');
        else if (n.includes('poa')  || n.includes('attorney')) setType('POWER_OF_ATTORNEY');
        else                                                   setType('OTHER');
        e.target.value = '';
    }

    async function handleUpload() {
        if (!file) { setError(t('property.selectFileError')); return; }
        setBusy(true);
        setError('');
        try {
            const result = await parcelService.uploadDocument(pin, {
                type,
                name:   file.name,
                sizeKB: Math.round(file.size / 1024),
                // ipfsCid / sha256 are populated by the backend IPFS anchoring pipeline
            });
            setFile(null);
            setType('OTHER');
            if (onUploaded && result && result.doc) onUploaded(result.doc);
        } catch (err) {
            setError(err.message || t('property.uploadFailed'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="border-t border-outline-variant pt-3 mt-1 flex flex-col gap-2">
            <div className="font-public-sans font-bold uppercase tracking-wider text-on-surface-variant" style={{ fontSize: '10px', letterSpacing: '0.07em' }}>
                {t('property.attachNewDocument')}
            </div>

            {/* File picker */}
            <div
                className="border border-dashed border-outline-variant rounded-DEFAULT p-3 text-center cursor-pointer hover:bg-surface-container-low transition-colors"
                onClick={() => fileRef.current && fileRef.current.click()}
                onDrop={(e) => { e.preventDefault(); handleFile({ target: { files: e.dataTransfer.files }, value: '' }); }}
                onDragOver={(e) => e.preventDefault()}
                role="button"
                tabIndex={0}
                aria-label={t('property.attachNewDocumentBtn')}
            >
                {file ? (
                    <span className="font-public-sans text-body-sm text-on-surface truncate block">{file.name} ({fmtSize(Math.round(file.size / 1024))})</span>
                ) : (
                    <>
                        <span className="material-symbols-outlined text-[28px] text-on-surface-variant" aria-hidden="true">upload_file</span>
                        <div className="font-public-sans text-body-sm text-on-surface-variant mt-1">{t('property.clickToSelect')}</div>
                    </>
                )}
                <input ref={fileRef} type="file" hidden accept="application/pdf,image/*" onChange={handleFile} />
            </div>

            {/* Document type selector */}
            <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm focus:outline-none focus:border-tertiary-fixed-dim text-on-surface"
                aria-label={t('property.documentType')}
            >
                {DOC_TYPES_SELECT.map((dt) => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
            </select>

            {error && <p className="font-public-sans text-body-sm text-error">{error}</p>}

            <button
                onClick={handleUpload}
                disabled={busy || !file}
                className="w-full px-4 py-2 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
                {busy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
                {busy ? t('property.uploading') : t('property.uploadAnchor')}
            </button>
        </div>
    );
}

// ─── File Dispute Modal (inline) ──────────────────────────────────────────────
function FileDisputeModal({ open, pin, onClose, t }) {
    const { user } = useAuth();
    const [form, setForm] = useState({
        description:  '',
        evidence:     '',
        filerLnid:    '',
        filerAddress: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error,      setError]      = useState(null);
    const [success,    setSuccess]    = useState(null);
    const descRef = useRef(null);

    useEffect(() => {
        if (open) {
            setForm({ description: '', evidence: '', filerLnid: '',
                filerAddress: user ? (user.walletAddress || user.address || '') : '' });
            setError(null);
            setSuccess(null);
            setSubmitting(false);
            setTimeout(() => { if (descRef.current) descRef.current.focus(); }, 60);
        }
    }, [open, user]);

    function setField(key) {
        return (e) => setForm((prev) => Object.assign({}, prev, { [key]: e.target.value }));
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!form.description.trim() || !form.filerAddress.trim()) return;
        setSubmitting(true);
        setError(null);
        const payload = {
            parcelPin:    pin,
            description:  form.description.trim(),
            filerAddress: form.filerAddress.trim(),
        };
        if (form.filerLnid.trim()) payload.filerLnid = form.filerLnid.trim();
        if (form.evidence.trim())  payload.evidence  = [{ description: 'User-submitted CID', ipfsCid: form.evidence.trim() }];
        disputeService.file(payload)
            .then((result) => {
                setSubmitting(false);
                const id = (result && (result.disputeId || result._id)) || '';
                setSuccess(t('disputesPage.successMsg').replace('{id}', id));
            })
            .catch((err) => {
                setSubmitting(false);
                setError(err.message || t('disputesPage.errorMsg'));
            });
    }

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
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

                {success ? (
                    <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
                        <span className="material-symbols-outlined text-[48px]" style={{ color: 'var(--imm-success,#16a34a)' }} aria-hidden="true">check_circle</span>
                        <p className="font-public-sans text-body-md text-on-surface">{success}</p>
                        <button onClick={onClose}
                            className="px-5 py-2 rounded-lg border border-outline font-public-sans text-body-sm text-on-surface hover:bg-surface-container-low transition-colors">
                            {t('disputesPage.cancelBtn')}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
                        {/* Parcel PIN (read-only) */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('disputesPage.fieldPin')}</label>
                            <div className="h-10 px-3 flex items-center rounded-md border border-outline bg-surface-container-low text-on-surface-variant font-mono text-body-sm">
                                {pin}
                            </div>
                        </div>
                        {/* Description */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">
                                {t('disputesPage.fieldDesc')} <span className="text-error">*</span>
                            </label>
                            <textarea
                                ref={descRef}
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
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('disputesPage.fieldEvidence')}</label>
                            <input type="text" value={form.evidence} onChange={setField('evidence')}
                                placeholder={t('disputesPage.fieldEvidenceHint')}
                                className="h-10 px-3 
                                rounded-md 
                                border 
                                border-outline 
                                bg-surface 
                                text-on-surface 
                                font-mono 
                                text-body-sm 
                                focus:outline-none 
                                focus:ring-2 
                                focus:ring-primary" />
                        </div>
                        {/* LNID */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">{t('disputesPage.fieldLnid')}</label>
                            <input type="text" value={form.filerLnid} onChange={setField('filerLnid')}
                                className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-public-sans text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        {/* Wallet address */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-sm font-semibold text-on-surface">
                                {t('disputesPage.fieldAddress')} <span className="text-error">*</span>
                            </label>
                            <input type="text" required value={form.filerAddress} onChange={setField('filerAddress')}
                                className="h-10 px-3 rounded-md border border-outline bg-surface text-on-surface font-mono text-body-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        {error && (
                            <div className="flex items-center gap-2 p-3 rounded-lg text-body-sm font-public-sans"
                                 style={{ background: 'var(--imm-error-container)', color: 'var(--imm-on-error-container)' }}>
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">error</span>
                                {error}
                            </div>
                        )}
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={onClose}
                                className="px-4 py-2 rounded-lg border border-outline font-public-sans text-body-sm text-on-surface hover:bg-surface-container-low transition-colors">
                                {t('disputesPage.cancelBtn')}
                            </button>
                            <button type="submit" disabled={submitting}
                                className="px-5 py-2 rounded-lg font-public-sans text-body-sm font-semibold text-white disabled:opacity-60 transition-opacity"
                                style={{ background: 'var(--imm-primary-container)' }}>
                                {submitting ? (
                                    <span className="inline-flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        {t('disputesPage.submitting')}
                                    </span>
                                ) : t('disputesPage.submitBtn')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PropertyDetails() {
    const { pin = '8A-992' } = useParams();
    const navigate            = useNavigate();
    const { t }               = useTranslation();
    const display             = pin.startsWith('Parcel ') ? pin : ('Parcel ' + pin);

    const [cert,            setCert]            = useState(null);
    const [ledger,          setLedger]          = useState([]);
    const [docs,            setDocs]            = useState([]);
    const [showUpload,      setShowUpload]      = useState(false);
    const [showDisputeModal,setShowDisputeModal]= useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.allSettled([
            certificateService.get(pin),
            parcelService.history(pin, { limit: 20 }),
            parcelService.documents(pin),
        ]).then(([c, h, d]) => {
            if (cancelled) return;
            if (c.status === 'fulfilled' && c.value) setCert(c.value);
            if (h.status === 'fulfilled' && h.value?.events?.length) {
                setLedger(h.value.events);
            }
            if (d.status === 'fulfilled' && Array.isArray(d.value) && d.value.length) {
                setDocs(d.value);
            }
        });
        return () => { cancelled = true; };
    }, [pin]);

    function handleDocUploaded(newDoc) {
        setDocs((prev) => [...prev, newDoc]);
        setShowUpload(false);
    }

    return (
        <div className="p-margin max-w-container-max mx-auto w-full flex flex-col gap-stack-lg">

            {/* File Dispute Modal */}
            <FileDisputeModal
                open={showDisputeModal}
                pin={pin}
                onClose={() => setShowDisputeModal(false)}
                t={t}
            />

            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="font-public-sans text-body-sm text-on-surface-variant">
                <Link to="/properties" className="hover:text-on-surface">{t('property.breadcrumbLandTitles')}</Link>
                <span className="mx-2 text-outline">/</span>
                <Link to="/properties" className="hover:text-on-surface">{t('property.breadcrumbParcels')}</Link>
                <span className="mx-2 text-outline">/</span>
                <span className="text-on-surface">{t('property.breadcrumbDetails')}</span>
            </nav>

            {/* Page header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <h1 className="font-public-sans text-h1 font-bold text-on-surface tracking-tight">{display}</h1>
                    <StatusBadge tone={cert && cert.verified === false ? 'pending' : 'verified'} icon="check_circle">
                        {cert && cert.verified === false ? t('property.statusPending') : t('property.statusVerified')}
                    </StatusBadge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={() => shareOrCopy({ title: display, text: 'LMBS parcel ' + pin, url: window.location.href })}
                        className="px-4 py-2 bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-public-sans text-body-sm rounded-DEFAULT hover:bg-surface-container-low transition-colors flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">share</span>
                        {t('property.shareRecord')}
                    </button>
                    <button
                        onClick={() => setShowDisputeModal(true)}
                        className="px-4 py-2 bg-surface-container-lowest border border-outline-variant text-on-surface-variant font-public-sans text-body-sm rounded-DEFAULT hover:bg-surface-container-low transition-colors flex items-center gap-2"
                        style={{ color: 'var(--imm-error,#dc2626)', borderColor: 'var(--imm-error,#dc2626)' }}
                    >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">gavel</span>
                        {t('disputesPage.fileNew')}
                    </button>
                    <button
                        onClick={() => navigate('/transfer/' + encodeURIComponent(pin))}
                        className="px-4 py-2 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">swap_horiz</span>
                        {t('property.initiateTransfer')}
                    </button>
                </div>
            </header>

            {/* Map + Certificate card */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter">
                <div className="xl:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden">
                    <div className="relative h-[360px] bg-surface-container">
                        <GoogleMap
                            title={'Map of parcel ' + display}
                            center={(cert && cert.center) || [27.4900, -29.3120]}
                            zoom={16}
                            mapType="hybrid"
                            polygon={(cert && cert.polygon) || [
                                [27.4900, -29.3120], [27.4920, -29.3120],
                                [27.4920, -29.3140], [27.4900, -29.3140],
                                [27.4900, -29.3120],
                            ]}
                            style={{ position: 'absolute', inset: 0 }}
                        />
                        <div className="absolute left-4 bottom-4 px-3 py-1.5 bg-surface-container-lowest border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm shadow-[var(--imm-shadow-raised)] z-10">
                            <span className="font-bold uppercase tracking-wider text-label-caps text-on-surface-variant mr-2">{t('property.currentBoundaries')}</span>
                            <span className="tabular-nums">29°31′12″S  27°29′24″E</span>
                        </div>
                    </div>
                </div>

                <aside className="xl:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-md">
                    <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{t('property.immutableCertificate')}</div>
                    <h2 className="font-public-sans text-h3 font-semibold text-on-surface mt-1">{t('property.blockchainId')}</h2>
                    <div className="mt-3 p-3 bg-surface-container-low rounded-DEFAULT tabular-nums text-body-sm break-all">
                        {(cert && cert.did) || 'DID:LMBS:8FQ2A:ETC-EXE2-D-5F6-OSCAVCC8923'}
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-4 text-body-sm font-public-sans">
                        <div>
                            <dt className="text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{t('property.totalArea')}</dt>
                            <dd className="text-on-surface mt-1 tabular-nums">
                                {cert?.areaM2 ? `${Number(cert.areaM2).toLocaleString()} sq m` : '14,250 sq m'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{t('property.landUse')}</dt>
                            <dd className="text-on-surface mt-1">{cert?.landUse || cert?.zoningCode || 'Commercial'}</dd>
                        </div>
                        <div className="col-span-2">
                            <dt className="text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{t('property.currentOwner')}</dt>
                            <dd className="text-on-surface mt-1">{cert?.currentOwner || 'Apex Holdings Ltd.'}</dd>
                        </div>
                    </dl>
                    <Link
                        to={'/certificate/' + encodeURIComponent(pin)}
                        className="mt-4 block text-center w-full px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm text-on-tertiary-container hover:bg-surface-container-low transition-colors"
                    >
                        {t('property.viewFullCertificate')}
                    </Link>
                </aside>
            </div>

            {/* Provenance Ledger + Official Documents */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter">

                {/* ── Provenance Ledger ───────────────────────────────────── */}
                <div className="xl:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-xl flex flex-col overflow-hidden">
                    <div className="flex justify-between items-start px-5 py-4 border-b border-outline-variant gap-2">
                        <div>
                            <h2 className="font-public-sans text-h3 font-semibold text-on-surface">{t('property.provenanceLedger')}</h2>
                            <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">
                                {t('property.provenanceSubtitle')}
                            </p>
                        </div>
                        <Link
                            to={'/transactions/' + encodeURIComponent(pin)}
                            className="font-public-sans text-body-sm text-on-surface-variant hover:text-on-surface whitespace-nowrap mt-1"
                        >
                            {t('property.fullAuditTrail')}
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[580px]">
                            <thead>
                                <tr className="border-b border-outline-variant bg-surface-container-low">
                                    <th className="px-5 py-3 font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{t('property.colDate')}</th>
                                    <th className="px-5 py-3 font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{t('property.colEventType')}</th>
                                    <th className="px-5 py-3 font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{t('property.colPrincipal')}</th>
                                    <th className="px-5 py-3 font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{t('property.colTxId')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledger.map((row, i) => (
                                    <tr
                                        key={row.id || i}
                                        className={'border-b border-outline-variant last:border-b-0 ' + (i % 2 ? 'bg-surface-container-low' : '')}
                                    >
                                        <td className="px-5 py-3 tabular-nums text-body-sm whitespace-nowrap text-on-surface-variant">
                                            {fmtDate(row.date)}
                                        </td>
                                        <td className="px-5 py-3">
                                            <EventTypeBadge eventType={row.eventType} />
                                        </td>
                                        <td className="px-5 py-3 font-public-sans text-body-sm">
                                            <div className="text-on-surface">{row.principal}</div>
                                            {row.principalSub && (
                                                <div className="text-on-surface-variant mt-0.5" style={{ fontSize: '11px' }}>{row.principalSub}</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-3 tabular-nums text-body-sm text-on-surface-variant font-mono">
                                            {row.txId || row.hash || '—'}
                                        </td>
                                    </tr>
                                ))}
                                {ledger.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-5 py-6 text-center font-public-sans text-body-sm text-on-surface-variant">
                                            {t('property.noLedgerEvents')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Official Documents ──────────────────────────────────── */}
                <aside className="xl:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-md flex flex-col gap-stack-md">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <h2 className="font-public-sans text-h3 font-semibold text-on-surface">{t('property.officialDocuments')}</h2>
                            <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">
                                {t('property.officialDocsSubtitle')}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowUpload((v) => !v)}
                            title={showUpload ? t('property.closeUploadPanel') : t('property.attachNewDocumentBtn')}
                            aria-expanded={showUpload}
                            className="flex-shrink-0 mt-0.5 p-1.5 rounded-DEFAULT border border-outline-variant hover:bg-surface-container-low transition-colors text-on-surface-variant hover:text-on-surface"
                        >
                            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                                {showUpload ? 'close' : 'attach_file'}
                            </span>
                        </button>
                    </div>

                    {/* Document list */}
                    <ul className="flex flex-col gap-2">
                        {docs.map((d, i) => {
                            const typeLabel = d.typeLabel || (d.type ? t(`docTypes.${d.type}`) : t('docTypes.OTHER'));
                            return (
                                <li
                                    key={d.id || i}
                                    className="flex items-start justify-between gap-2 px-3 py-2.5 border border-outline-variant rounded-DEFAULT hover:bg-surface-container-low transition-colors"
                                >
                                    <div className="flex items-start gap-2 min-w-0">
                                        <span
                                            className="material-symbols-outlined text-on-surface-variant flex-shrink-0 mt-0.5"
                                            style={{ fontSize: '20px' }}
                                            aria-hidden="true"
                                        >
                                            description
                                        </span>
                                        <div className="min-w-0">
                                            <div className="font-public-sans text-body-sm text-on-surface truncate" title={d.name}>
                                                {d.name}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                {/* Document type badge */}
                                                <span
                                                    className="inline-block px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
                                                    style={{ background: '#E0F2FE', color: '#0369A1', fontSize: '9px', letterSpacing: '0.06em' }}
                                                >
                                                    {typeLabel}
                                                </span>
                                                <span className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">
                                                    {fmtDate(d.uploadedAt)}{d.sizeKB ? ' · ' + fmtSize(d.sizeKB) : ''}
                                                </span>
                                            </div>
                                            {/* IPFS CID (if anchored) */}
                                            {d.ipfsCid && (
                                                <div
                                                    className="font-public-sans font-bold uppercase tracking-wider text-on-surface-variant mt-0.5 truncate"
                                                    style={{ fontSize: '9px' }}
                                                    title={d.ipfsCid}
                                                >
                                                    IPFS: {d.ipfsCid.slice(0, 16)}…
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    {/* View / download action */}
                                    <a
                                        href={d.ipfsCid ? `https://ipfs.io/ipfs/${d.ipfsCid}` : '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`View ${d.name}`}
                                        onClick={(e) => {
                                            if (!d.ipfsCid) {
                                                e.preventDefault();
                                                window.alert(t('property.notAnchoredAlert'));
                                            }
                                        }}
                                        className="text-on-surface-variant hover:text-on-surface flex-shrink-0 mt-0.5 transition-colors"
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }} aria-hidden="true">open_in_new</span>
                                    </a>
                                </li>
                            );
                        })}
                        {docs.length === 0 && (
                            <li className="font-public-sans text-body-sm text-on-surface-variant text-center py-4">
                                {t('property.noDocsAnchored')}
                            </li>
                        )}
                    </ul>

                    {/* Inline upload panel — toggled by the attach_file button */}
                    {showUpload && (
                        <UploadDocumentPanel pin={pin} onUploaded={handleDocUploaded} />
                    )}
                </aside>
            </div>
        </div>
    );
}
