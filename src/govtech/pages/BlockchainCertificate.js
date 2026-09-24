/**
 * Blockchain Certificate - replicates `stitch/blockchain_certificate/screen.png`.
 * Live data via /api/certificates/:id with graceful fallback. Print, Share,
 * Download PDF, and View-on-Ledger buttons are all wired. The footer carries
 * a real scannable QR code generated server-side via api.qrserver.com.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import StatusBadge from '../components/StatusBadge';
import QRCode from '../components/QRCode';
import { printPage, shareOrCopy, explorerUrl } from '../components/actions';
import { certificateService } from '../../services';

function fmtDate(d) {
    if (!d) return '-';
    try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (_) { return '-'; }
}

export default function BlockchainCertificate() {
    const { id = '' } = useParams();

    const [cert, setCert] = useState(null);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);
    const navigate        = useNavigate();

    useEffect(() => {
        let cancelled = false;
        certificateService.get(id)
            .then((c) => { if (!cancelled) setCert(c); })
            .catch((e) => { if (!cancelled) setError(e.message); });
        return () => { cancelled = true; };
    }, [id]);

    const display = {
        pin:      (cert && (cert.parcelPin || cert.deedNumber)) || id,
        owner:    (cert && cert.currentOwner) || '—',
        issued:   cert && cert.issueDate ? fmtDate(cert.issueDate) : '—',
        expiry:   (cert && cert.expiry) || '—',
        legal:    (cert && cert.legalDescription) || '—',
        // Real execution transaction only; never a placeholder.
        proof:    (cert && cert.proofHash) || 'Not anchored on-chain',
        signer:   (cert && cert.signedBy) || '—',
        verified: !!(cert && cert.verified),
    };

    // Encode the verification URL into the QR. Anyone scanning the printed
    // certificate is taken straight to /certificate/:id where the on-chain
    // hash is re-fetched and re-verified.
    const verifyUrl = (typeof window !== 'undefined' ? window.location.origin : 'https://lmbs.gov.ls') +
        '/certificate/' + encodeURIComponent(display.pin);

    const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
    const onPrint = () => printPage();
    const onShare = async () => {
        const result = await shareOrCopy({
            title: 'LMBS Certificate ' + display.pin,
            text: 'Verify on chain: ' + display.proof,
            url: verifyUrl,
        });
        if (result === 'copied') flash('Link copied to clipboard');
        else if (result === 'unavailable') flash('Sharing not supported in this browser');
    };
    const onDownload = () => printPage();        // Browser's "Save as PDF"
    const onViewOnLedger = () => {
        const url = explorerUrl(display.proof);
        if (url) navigate(url);
    };

    return (
        <div className="p-margin max-w-[1080px] mx-auto w-full flex flex-col gap-stack-lg">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="font-public-sans text-h1 font-bold text-on-surface tracking-tight">Certificate Verification</h1>
                    <p className="font-public-sans text-body-md text-on-surface-variant mt-2">Immutable record of land ownership secured on the LMBS network.</p>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                    <button onClick={onPrint} className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">print</span>
                        Print
                    </button>
                    <button onClick={onShare} className="px-4 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-low transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">share</span>
                        Share
                    </button>
                    <button onClick={onDownload} className="px-4 py-2 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">download</span>
                        Download PDF
                    </button>
                </div>
            </header>

            {toast && (
                <div role="status" className="font-public-sans text-body-sm text-on-tertiary-container">
                    {toast}
                </div>
            )}

            <article className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg flex flex-col gap-stack-md relative overflow-hidden">
                <div className="absolute right-[-80px] bottom-[-80px] w-[260px] h-[260px] rounded-full border-[3px] border-tertiary-fixed-dim opacity-10" aria-hidden="true" />

                <header className="flex justify-between items-start gap-4 pb-stack-md border-b border-outline-variant">
                    <div>
                        <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">IMMUTABLE LAND CERTIFICATE</div>
                        <h2 className="font-public-sans text-h2 font-semibold text-on-surface mt-1">Land Management Blockchain System (LMBS)</h2>
                    </div>
                    <StatusBadge tone={display.verified ? 'verified' : 'pending'} icon="verified">
                        {display.verified ? 'Verified on Chain' : 'Pending Verification'}
                    </StatusBadge>
                </header>

                {error && <p role="status" className="font-public-sans text-body-sm text-on-surface-variant">{error} - showing fallback data.</p>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
                    <Field label="PARCEL IDENTIFICATION NUMBER (PIN)" mono>{display.pin}</Field>
                    <Field label="CURRENT REGISTERED OWNER">{display.owner}</Field>
                    <Field label="DATE OF ISSUE">{display.issued}</Field>
                    <Field label="EXPIRY DATE">{display.expiry}</Field>
                </div>

                <div>
                    <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">LEGAL DESCRIPTION</div>
                    <p className="font-public-sans text-body-md text-on-surface mt-2 leading-relaxed">{display.legal}</p>
                </div>

                <div className="bg-surface-container-low border border-outline-variant rounded-DEFAULT p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">BLOCKCHAIN PROOF SIGNATURE</div>
                        <div className="tabular-nums text-body-sm text-on-surface mt-1 break-all">{display.proof}</div>
                    </div>
                    <button onClick={onViewOnLedger} className="shrink-0 px-3 py-2 border border-outline-variant rounded-DEFAULT font-public-sans text-body-sm hover:bg-surface-container-lowest transition-colors flex items-center gap-2 bg-surface-container-lowest print:hidden">
                        View on Ledger
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">open_in_new</span>
                    </button>
                </div>

                <footer className="flex items-end justify-between gap-4 pt-stack-md border-t border-outline-variant">
                    <div className="flex items-center gap-3">
                        <QRCode value={verifyUrl} size={96} label={'Scan to verify ' + display.pin} />
                        <div className="font-public-sans text-body-sm text-on-surface-variant max-w-[200px]">
                            Scan with any phone camera to verify this certificate against the live ledger.
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">CRYPTOGRAPHICALLY SIGNED BY</div>
                        <div className="font-public-sans text-body-md font-semibold text-on-surface mt-1">{display.signer}</div>
                    </div>
                </footer>
            </article>
        </div>
    );
}

function Field({ label, children, mono }) {
    return (
        <div>
            <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">{label}</div>
            <div className={'font-public-sans text-body-md text-on-surface mt-1 ' + (mono ? 'tabular-nums break-all' : '')}>{children}</div>
        </div>
    );
}
