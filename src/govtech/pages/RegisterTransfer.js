/**
 * Registration & Transfer Form - replicates `stitch/registration_transfer_form/screen.png`.
 *
 * Step 3 (Documents) supports multiple file uploads with per-file document-type
 * selection. On final submit the parcel is registered first, then each attached
 * document is posted to POST /api/parcels/:pin/documents so it appears immediately
 * in the Property Details Official Documents panel and Provenance Ledger.
 *
 * Supported document types align with SAD section 5.3 supportingDocs schema:
 *   SURVEY_PLAN | ENV_ASSESSMENT | DEED_OF_SALE | TITLE_DEED |
 *   COURT_ORDER | ID_DOCUMENT | POWER_OF_ATTORNEY | OTHER
 *
 * ON-CHAIN SUBMISSION (supervisor review, Aug 2026)
 *   1. Every attached file is encrypted and stored off-chain (/api/documents);
 *      a manifest of their hashes is stored the same way.
 *   2. The request is submitted to the LandRegistry contract FROM THE USER'S
 *      OWN WALLET: submitRegistration (registrar / applicant) or
 *      submitTransfer (current title holder only). The manifest hash is the
 *      on-chain documentHash; the Survey Plan hash is the cadastral surveyHash.
 *   3. The backend then records the off-chain metadata against the verified
 *      transaction. Nothing becomes ACTIVE until M-of-N approvers approve it
 *      on-chain.
 *
 * All UI strings use useTranslation() (SRS NFR-009).
 */

import React, { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { parcelService, transferService } from '../../services';
import { useTranslation } from '../../i18n';
import { useChain } from '../../chain/ChainContext';
import { parcelKeyOf, submitRegistration, submitTransfer } from '../../chain/registry';
import { uploadDocument, uploadManifest } from '../../chain/documents';
import { decodeChainError } from '../../chain/errors';
import WalletPanel from '../components/WalletPanel';

const inputCls = 'w-full px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm placeholder:text-outline focus:outline-none focus:border-tertiary-fixed-dim';

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({ current, steps }) {
    return (
        <ol className="flex items-center gap-2 sm:gap-6 w-full" aria-label="Workflow progress">
            {steps.map((s, i) => {
                const done   = s.id < current;
                const active = s.id === current;
                return (
                    <li key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
                        <div
                            aria-current={active ? 'step' : undefined}
                            className="w-9 h-9 rounded-full flex items-center justify-center font-public-sans font-semibold"
                            style={{
                                background: active ? '#0F172A' : done ? '#059669' : '#eceef0',
                                color: active || done ? 'white' : '#45464d',
                            }}
                        >
                            {done ? <span className="material-symbols-outlined text-[18px]">check</span> : s.id}
                        </div>
                        <span className={'font-public-sans text-body-sm ' + (active ? 'text-on-surface font-semibold' : 'text-on-surface-variant')}>
                            {s.label}
                        </span>
                        {i < steps.length - 1 && <div className="flex-1 h-px bg-outline-variant ml-1" aria-hidden="true" />}
                    </li>
                );
            })}
        </ol>
    );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({ label, children }) {
    return (
        <label className="flex flex-col gap-1">
            <span className="font-public-sans text-body-sm font-medium text-on-surface">{label}</span>
            {children}
        </label>
    );
}

// ─── Step 1: Applicant Details ────────────────────────────────────────────────

function ApplicantStep({ form, set, onCancel, onNext, isTransfer }) {
    const { t } = useTranslation();
    return (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
            <h2 className="font-public-sans text-h3 font-semibold text-on-surface">{t('regwizard.applicantDetails')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md mt-stack-md">
                <Field label={t('regwizard.fullName')}>
                    <input className={inputCls} value={form.fullName || ''} onChange={(e) => set('fullName', e.target.value)} placeholder="e.g. Thabo Moshoeshoe" />
                </Field>
                <Field label={t('regwizard.nationalId')}>
                    <input className={inputCls} value={form.idNumber || ''} onChange={(e) => set('idNumber', e.target.value)} placeholder="ID-XXXX-YYYY" />
                </Field>
                <div className="md:col-span-2">
                    <Field label={t('regwizard.entity')}>
                        <input className={inputCls} value={form.entity || ''} onChange={(e) => set('entity', e.target.value)} placeholder="Company Name Ltd." />
                    </Field>
                </div>
                <Field label={t('regwizard.contactEmail')}>
                    <input type="email" className={inputCls} value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="thabo@example.co.ls" />
                </Field>
                <Field label={t('regwizard.phoneNumber')}>
                    <input className={inputCls} value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="+266 5X XXX XXX" />
                </Field>
                <div className="md:col-span-2">
                    <Field label={isTransfer ? t('regwizard.buyerWallet', 'Buyer wallet address (must have a verified identity)') : t('regwizard.beneficiaryWallet', 'Beneficiary wallet address (must have a verified identity)')}>
                        <input className={inputCls + ' font-mono'} value={form.wallet || ''} onChange={(e) => set('wallet', e.target.value.trim())} placeholder="0x…" />
                    </Field>
                </div>
            </div>
            <div className="flex justify-end items-center gap-2 mt-stack-lg">
                <button onClick={onCancel} className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors">{t('regwizard.cancel')}</button>
                <button onClick={onNext} className="px-4 py-2 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity">{t('regwizard.nextStep')}</button>
            </div>
        </section>
    );
}

// ─── Step 2: Property Details ─────────────────────────────────────────────────

function PropertyStep({ form, set, onBack, onNext }) {
    const { t } = useTranslation();
    return (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
            <h2 className="font-public-sans text-h3 font-semibold text-on-surface">{t('regwizard.propertyDetails')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md mt-stack-md">
                <Field label={t('regwizard.parcelPin')}>
                    <input className={inputCls} value={form.pin || ''} onChange={(e) => set('pin', e.target.value)} placeholder="LSO-MAS-00001-2026-AB12" />
                </Field>
                <Field label={t('regwizard.district')}>
                    <select className={inputCls} value={form.district || ''} onChange={(e) => set('district', e.target.value)}>
                        <option value="">{t('regwizard.selectDistrict')}</option>
                        {['Maseru','Berea','Leribe','Botha-Bothe','Mafeteng',"Mohale's Hoek",'Quthing',"Qacha's Nek",'Mokhotlong','Thaba-Tseka'].map((d) => (
                            <option key={d} value={d}>{d}</option>
                        ))}
                    </select>
                </Field>
                <Field label={t('regwizard.areaM2')}>
                    <input type="number" min="0" className={inputCls} value={form.areaM2 || ''} onChange={(e) => set('areaM2', e.target.value)} placeholder="e.g. 14250" />
                </Field>
                <Field label={t('regwizard.landUseType')}>
                    <select className={inputCls} value={form.useType || ''} onChange={(e) => set('useType', e.target.value)}>
                        <option value="">{t('regwizard.selectLandUse')}</option>
                        <option value="RESIDENTIAL">{t('regwizard.landUseResidential')}</option>
                        <option value="COMMERCIAL">{t('regwizard.landUseCommercial')}</option>
                        <option value="AGRICULTURAL">{t('regwizard.landUseAgricultural')}</option>
                        <option value="INDUSTRIAL">{t('regwizard.landUseIndustrial')}</option>
                        <option value="OTHER">{t('regwizard.landUseOther')}</option>
                    </select>
                </Field>
                <div className="md:col-span-2">
                    <Field label={t('regwizard.salePrice')}>
                        <input type="number" min="0" className={inputCls} value={form.priceLSL || ''} onChange={(e) => set('priceLSL', e.target.value)} placeholder="0 for gift transfer" />
                    </Field>
                </div>
            </div>
            <div className="flex justify-between items-center gap-2 mt-stack-lg">
                <button onClick={onBack} className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors">{t('regwizard.back')}</button>
                <button onClick={onNext} className="px-4 py-2 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity">{t('regwizard.nextStep')}</button>
            </div>
        </section>
    );
}

// ─── Step 3: Supporting Documents ────────────────────────────────────────────
// Supports multiple file uploads with per-file document-type selection.
// Files are stored in component state as { file, type, name } objects and
// uploaded to the backend on the final Submit step.

function DocumentsStep({ docs, setDocs, onBack, onNext }) {
    const { t }   = useTranslation();
    const fileRef = useRef(null);

    // Build doc types from translations so they switch with language
    const DOC_TYPES = [
        { value: 'SURVEY_PLAN',       label: t('docTypes.SURVEY_PLAN')       },
        { value: 'ENV_ASSESSMENT',    label: t('docTypes.ENV_ASSESSMENT')    },
        { value: 'DEED_OF_SALE',      label: t('docTypes.DEED_OF_SALE')      },
        { value: 'TITLE_DEED',        label: t('docTypes.TITLE_DEED')        },
        { value: 'COURT_ORDER',       label: t('docTypes.COURT_ORDER')       },
        { value: 'ID_DOCUMENT',       label: t('docTypes.ID_DOCUMENT')       },
        { value: 'POWER_OF_ATTORNEY', label: t('docTypes.POWER_OF_ATTORNEY') },
        { value: 'OTHER',             label: t('docTypes.OTHER')             },
    ];

    function handleFilePick(e) {
        const picked = Array.from(e.target.files || []);
        if (!picked.length) return;
        const additions = picked.map((f) => ({
            id:   `${f.name}-${f.size}-${Date.now()}`,
            file: f,
            name: f.name,
            type: guessDocType(f.name),
            sizeKB: Math.round(f.size / 1024),
        }));
        setDocs((prev) => [...prev, ...additions]);
        e.target.value = '';
    }

    function removeDoc(id) {
        setDocs((prev) => prev.filter((d) => d.id !== id));
    }

    function updateType(id, type) {
        setDocs((prev) => prev.map((d) => d.id === id ? { ...d, type } : d));
    }

    function guessDocType(fileName) {
        const n = (fileName || '').toLowerCase();
        if (n.includes('survey'))     return 'SURVEY_PLAN';
        if (n.includes('env') || n.includes('environment')) return 'ENV_ASSESSMENT';
        if (n.includes('deed') && n.includes('sale')) return 'DEED_OF_SALE';
        if (n.includes('title'))      return 'TITLE_DEED';
        if (n.includes('court') || n.includes('order')) return 'COURT_ORDER';
        if (n.includes('id') || n.includes('identity')) return 'ID_DOCUMENT';
        if (n.includes('poa') || n.includes('attorney')) return 'POWER_OF_ATTORNEY';
        return 'OTHER';
    }

    function fmtSize(kb) {
        if (!kb) return '';
        return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
    }

    return (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
            <h2 className="font-public-sans text-h3 font-semibold text-on-surface">{t('regwizard.supportingDocs')}</h2>
            <p className="font-public-sans text-body-sm text-on-surface-variant mt-1">
                {t('regwizard.supportingDocsSubtitle')}
            </p>

            {/* Drop zone */}
            <div
                className="mt-stack-md border-2 border-dashed border-outline-variant rounded-xl p-stack-lg text-center cursor-pointer hover:border-tertiary-fixed-dim hover:bg-surface-container-low transition-colors"
                onClick={() => fileRef.current && fileRef.current.click()}
                onDrop={(e) => { e.preventDefault(); handleFilePick({ target: { files: e.dataTransfer.files }, value: '' }); }}
                onDragOver={(e) => e.preventDefault()}
                role="button"
                tabIndex={0}
                aria-label={t('regwizard.supportingDocs')}
            >
                <span className="material-symbols-outlined text-[40px] text-on-surface-variant" aria-hidden="true">upload_file</span>
                <div className="font-public-sans text-body-md font-semibold text-on-surface mt-2">
                    {t('regwizard.dropFiles')}
                </div>
                <div className="font-public-sans text-body-sm text-on-surface-variant mt-1">
                    {t('regwizard.dropHint')}
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    hidden
                    multiple
                    accept="application/pdf,image/*"
                    onChange={handleFilePick}
                />
            </div>

            {/* Attached files list */}
            {docs.length > 0 && (
                <ul className="mt-stack-md flex flex-col gap-2" aria-label={t('regwizard.supportingDocs')}>
                    {docs.map((d) => (
                        <li key={d.id} className="flex items-center gap-3 p-3 border border-outline-variant rounded-DEFAULT bg-surface-container-low">
                            <span className="material-symbols-outlined text-[22px] text-on-surface-variant flex-shrink-0" aria-hidden="true">description</span>
                            <div className="flex-1 min-w-0">
                                <div className="font-public-sans text-body-sm text-on-surface truncate" title={d.name}>{d.name}</div>
                                <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant mt-0.5">{fmtSize(d.sizeKB)}</div>
                            </div>
                            {/* Per-file document type selector */}
                            <select
                                value={d.type}
                                onChange={(e) => updateType(d.id, e.target.value)}
                                className="px-2 py-1.5 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm focus:outline-none focus:border-tertiary-fixed-dim text-on-surface"
                                aria-label={`${t('property.documentType')} — ${d.name}`}
                            >
                                {DOC_TYPES.map((dt) => (
                                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => removeDoc(d.id)}
                                className="p-1 rounded hover:bg-surface-container transition-colors text-on-surface-variant hover:text-error flex-shrink-0"
                                aria-label={`${t('common.cancel')} — ${d.name}`}
                            >
                                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {docs.length === 0 && (
                <p className="mt-3 font-public-sans text-body-sm text-on-surface-variant text-center">
                    {t('regwizard.noDocsAttached')}
                </p>
            )}

            <div className="flex justify-between items-center gap-2 mt-stack-lg">
                <button onClick={onBack} className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors">{t('regwizard.back')}</button>
                <button onClick={onNext} className="px-4 py-2 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity">{t('regwizard.nextStep')}</button>
            </div>
        </section>
    );
}

// ─── Step 4: Verify and Sign ──────────────────────────────────────────────────

function VerifyStep({ form, docs, onBack, onSubmit, submitting, error }) {
    const { t } = useTranslation();

    const FIELD_LABELS = {
        pin:      t('regwizard.fieldPin'),
        district: t('regwizard.fieldDistrict'),
        areaM2:   t('regwizard.fieldAreaM2'),
        useType:  t('regwizard.fieldUseType'),
        fullName: t('regwizard.fieldFullName'),
        idNumber: t('regwizard.fieldIdNumber'),
        entity:   t('regwizard.fieldEntity'),
        email:    t('regwizard.fieldEmail'),
        phone:    t('regwizard.fieldPhone'),
        priceLSL: t('regwizard.fieldPriceLSL'),
    };

    // Build doc types from translations for the summary
    const DOC_TYPE_LABELS = {
        SURVEY_PLAN:       t('docTypes.SURVEY_PLAN'),
        ENV_ASSESSMENT:    t('docTypes.ENV_ASSESSMENT'),
        DEED_OF_SALE:      t('docTypes.DEED_OF_SALE'),
        TITLE_DEED:        t('docTypes.TITLE_DEED'),
        COURT_ORDER:       t('docTypes.COURT_ORDER'),
        ID_DOCUMENT:       t('docTypes.ID_DOCUMENT'),
        POWER_OF_ATTORNEY: t('docTypes.POWER_OF_ATTORNEY'),
        OTHER:             t('docTypes.OTHER'),
    };

    const displayFields = Object.entries(form).filter(([k]) => FIELD_LABELS[k]);

    return (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
            <h2 className="font-public-sans text-h3 font-semibold text-on-surface">{t('regwizard.verifyAndSign')}</h2>
            <p className="font-public-sans text-body-md text-on-surface-variant mt-2">
                {t('regwizard.verifySubtitle')}
            </p>

            {/* Property & applicant summary */}
            <dl className="mt-stack-md grid grid-cols-1 md:grid-cols-2 gap-3 text-body-sm font-public-sans">
                {displayFields.map(([k, v]) => (
                    <div key={k} className="flex flex-col">
                        <dt className="font-bold uppercase tracking-wider text-label-caps text-on-surface-variant">{FIELD_LABELS[k] || k}</dt>
                        <dd className="text-on-surface mt-0.5">{String(v || '—')}</dd>
                    </div>
                ))}
            </dl>

            {/* Documents summary */}
            {docs.length > 0 && (
                <div className="mt-stack-md">
                    <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant mb-2">
                        {t('regwizard.attachedDocs', { n: docs.length })}
                    </div>
                    <ul className="flex flex-col gap-1">
                        {docs.map((d) => {
                            const typeLabel = DOC_TYPE_LABELS[d.type] || d.type;
                            return (
                                <li key={d.id} className="flex items-center gap-2 font-public-sans text-body-sm text-on-surface">
                                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant" aria-hidden="true">description</span>
                                    <span className="truncate">{d.name}</span>
                                    <span className="text-on-surface-variant flex-shrink-0">— {typeLabel}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {error && (
                <p role="alert" className="mt-3 font-public-sans text-body-sm text-error">{error}</p>
            )}

            <div className="flex justify-between items-center gap-2 mt-stack-lg">
                <button onClick={onBack} disabled={submitting} className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-50">
                    {t('regwizard.back')}
                </button>
                <button onClick={onSubmit} disabled={submitting} className="px-4 py-2 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center gap-2">
                    {submitting && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
                    {submitting ? t('regwizard.submitting') : t('regwizard.signAndSubmit')}
                </button>
            </div>
        </section>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RegisterTransfer() {
    const { pin }    = useParams();
    const location   = useLocation();
    const navigate   = useNavigate();
    const { t }      = useTranslation();
    const isTransfer = location.pathname.startsWith('/transfer');

    const [step,        setStep]        = useState(1);
    const [form,        setForm]        = useState({ pin: pin || '' });
    const [docs,        setDocs]        = useState([]);   // [{ id, file, name, type, sizeKB }]
    const [submitting,  setSubmitting]  = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [draftState,  setDraftState]  = useState(null); // null | 'saving' | 'saved' | 'error'
    const [progress,    setProgress]    = useState(null);
    const chain = useChain();

    const set      = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));
    const onCancel = () => navigate(-1);

    // TC-LR-009 / FR-LR-008: save current wizard state as a DRAFT parcel
    const onSaveDraft = async () => {
        setDraftState('saving');
        try {
            await parcelService.saveDraft({
                parcelNumber: form.pin || null,
                location:     form.district || '',
                area:         Number(form.areaM2) || 0,
                owner:        form.fullName ? { fullName: form.fullName, lnid: form.idNumber || '' } : undefined,
                district:     form.district || 'Maseru',
                areaM2:       Number(form.areaM2) || 0,
                landUse:      form.useType || 'RESIDENTIAL',
            });
            setDraftState('saved');
            setTimeout(() => setDraftState(null), 4000);
        } catch (_err) {
            setDraftState('error');
            setTimeout(() => setDraftState(null), 4000);
        }
    };

    // Step definitions built with translations so they switch language
    const STEPS = [
        { id: 1, label: t('regwizard.stepDetails')   },
        { id: 2, label: t('regwizard.stepProperty')  },
        { id: 3, label: t('regwizard.stepDocuments') },
        { id: 4, label: t('regwizard.stepVerify')    },
    ];

    const onSubmit = async () => {
        setSubmitting(true);
        setSubmitError(null);
        try {
            if (!chain.config || !chain.config.configured) throw new Error('The blockchain network is not configured on the server.');
            if (!chain.signer || !chain.walletMatchesAccount) throw new Error('Connect the wallet that is linked to your account (see the Wallet panel above).');
            const parcelNumber = (form.pin || pin || '').trim();
            if (!parcelNumber) throw new Error(t('regwizard.pinRequired', 'A parcel number is required.'));
            if (!/^0x[0-9a-fA-F]{40}$/.test(form.wallet || '')) throw new Error(t('regwizard.walletRequired', 'Enter a valid wallet address for the beneficiary / buyer.'));
            const survey = docs.find((d) => d.type === 'SURVEY_PLAN');
            if (!isTransfer && !survey) {
                throw new Error(t('regwizard.surveyRequired', 'Attach the licensed surveyor\'s plan (Survey Plan); its hash is anchored as the cadastral reference.'));
            }

            // 1. Encrypt and store every document off-chain; anchor only hashes.
            setProgress(t('regwizard.progressDocs', 'Encrypting and storing documents…'));
            const stored = [];
            for (const d of docs) {
                const r = await uploadDocument(d.file, { type: d.type, parcelPin: parcelNumber });
                stored.push({ type: d.type, name: d.name, docId: r.docId, documentHash: r.documentHash });
            }
            const manifest = await uploadManifest({
                kind: isTransfer ? 'TRANSFER' : 'REGISTRATION', parcelNumber, documents: stored, createdAt: new Date().toISOString(),
            }, parcelNumber);

            // 2. Submit on-chain from the user's own wallet.
            setProgress(t('regwizard.progressWallet', 'Confirm the request in your wallet…'));
            if (isTransfer) {
                const tokenId = BigInt(await parcelKeyOf(chain.config, parcelNumber)).toString();
                const out = await submitTransfer(chain.config, chain.signer, { tokenId, to: form.wallet, documentHash: manifest.documentHash });
                setProgress(t('regwizard.progressRecord', 'Recording details…'));
                const price = Number(form.priceLSL) || 0;
                await transferService.initiate({
                    chainTxHash: out.txHash, considerationLSL: price, isGiftTransfer: price === 0,
                    toOwner: { fullName: form.fullName || '' },
                });
                navigate('/registry');
            } else {
                const surveyHash = stored.find((d) => d.type === 'SURVEY_PLAN').documentHash;
                const out = await submitRegistration(chain.config, chain.signer, {
                    parcelNumber, beneficiary: form.wallet, surveyHash, documentHash: manifest.documentHash,
                });
                setProgress(t('regwizard.progressRecord', 'Recording details…'));
                await parcelService.register({
                    parcelNumber,
                    chainTxHash: out.txHash,
                    location:     form.district || '',
                    district:     form.district || 'Maseru',
                    areaM2:       Number(form.areaM2) || 0,
                    landUse:      form.useType || 'RESIDENTIAL',
                    owner:        { fullName: form.fullName || '' },
                    additionalDetails: { idNumber: form.idNumber, entity: form.entity, email: form.email, phone: form.phone },
                });
                navigate('/property/' + encodeURIComponent(parcelNumber));
            }
        } catch (err) {
            setSubmitError(decodeChainError(err) || t('regwizard.submissionFailed'));
        } finally {
            setSubmitting(false);
            setProgress(null);
        }
    };

    return (
        <div className="p-margin max-w-container-max mx-auto w-full flex flex-col gap-stack-lg">
            <header>
                <h1 className="font-public-sans text-h1 font-bold text-on-surface tracking-tight">
                    {isTransfer ? t('regwizard.headingTransfer') : t('regwizard.headingRegister')}
                </h1>
                <p className="font-public-sans text-body-md text-on-surface-variant mt-2">
                    {isTransfer ? t('regwizard.descTransfer') : t('regwizard.descRegister')}
                </p>
            </header>

            <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
                <Stepper current={step} steps={STEPS} />
            </div>

            {/* TC-LR-009: Save Draft bar — visible on steps 1-3 */}
            {step < 4 && (
                <div className="flex items-center justify-between bg-surface-container border border-outline-variant rounded-xl px-4 py-2.5">
                    <span className="font-public-sans text-body-sm text-on-surface-variant">
                        {t('regwizard.draftHint', 'You can save your progress and resume later within 30 days.')}
                    </span>
                    <button
                        onClick={onSaveDraft}
                        disabled={draftState === 'saving'}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-50"
                    >
                        {draftState === 'saving' && <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>}
                        {draftState === 'saved'  && <span className="material-symbols-outlined text-base text-success">check_circle</span>}
                        {draftState === 'error'  && <span className="material-symbols-outlined text-base text-error">error</span>}
                        {!draftState             && <span className="material-symbols-outlined text-base">save</span>}
                        {draftState === 'saved' ? t('regwizard.draftSaved', 'Draft Saved!') :
                         draftState === 'error' ? t('regwizard.draftError', 'Save Failed') :
                         t('regwizard.saveDraft', 'Save Draft')}
                    </button>
                </div>
            )}

            {step === 1 && <ApplicantStep form={form} set={set} isTransfer={isTransfer} onCancel={onCancel} onNext={() => setStep(2)} />}
            {step === 2 && <PropertyStep  form={form} set={set} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
            {step === 3 && <DocumentsStep docs={docs} setDocs={setDocs} onBack={() => setStep(2)} onNext={() => setStep(4)} />}
            {step === 4 && <WalletPanel />}
            {step === 4 && progress && <p role="status" className="font-public-sans text-body-sm text-on-surface-variant">{progress}</p>}
            {step === 4 && <VerifyStep    form={form} docs={docs} onBack={() => setStep(3)} onSubmit={onSubmit} submitting={submitting} error={submitError} />}

            <aside className="bg-secondary-container border border-outline-variant rounded-xl p-stack-md flex gap-3">
                <span className="material-symbols-outlined text-on-secondary-container mt-0.5" aria-hidden="true">info</span>
                <div className="flex flex-col">
                    <div className="font-public-sans text-h3 font-semibold text-on-secondary-container">{t('regwizard.verificationNotice')}</div>
                    <p className="font-public-sans text-body-sm text-on-secondary-container mt-1">
                        {t('regwizard.verificationText')}
                    </p>
                </div>
            </aside>
        </div>
    );
}
