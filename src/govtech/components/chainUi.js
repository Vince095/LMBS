/**
 * Small shared UI pieces for the on-chain pages (same design tokens as the
 * rest of the GovTech portal).
 */
import React from 'react';
import { Link } from 'react-router-dom';

export const inputCls = 'w-full px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm placeholder:text-outline focus:outline-none focus:border-tertiary-fixed-dim';

export const short = (a, n = 6) => (a ? `${a.slice(0, n)}…${a.slice(-4)}` : '—');

export function Card({ title, icon, children, actions }) {
    return (
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg flex flex-col gap-stack-md">
            {(title || actions) && (
                <div className="flex items-center justify-between gap-2">
                    <h2 className="font-public-sans text-h3 font-semibold text-on-surface flex items-center gap-2">
                        {icon && <span className="material-symbols-outlined" aria-hidden="true">{icon}</span>}
                        {title}
                    </h2>
                    {actions}
                </div>
            )}
            {children}
        </section>
    );
}

export function Button({ children, onClick, disabled, busy, variant = 'primary', type = 'button', title }) {
    const cls = variant === 'primary'
        ? 'bg-primary-container text-white hover:opacity-90'
        : variant === 'danger'
            ? 'bg-error text-white hover:opacity-90'
            : 'border border-outline-variant hover:bg-surface-container-low text-on-surface';
    return (
        <button type={type} onClick={onClick} disabled={disabled || busy} title={title}
            className={`px-3 py-1.5 rounded-DEFAULT font-public-sans text-body-sm font-semibold transition-opacity disabled:opacity-50 flex items-center gap-2 ${cls}`}>
            {busy && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />}
            {children}
        </button>
    );
}

const TONES = {
    PENDING: ['#fef9c3', '#713f12'],
    APPROVED: ['#dbeafe', '#1e3a5f'],
    EXECUTED: ['#dcfce7', '#166534'],
    REJECTED: ['#fee2e2', '#7f1d1d'],
    CANCELLED: ['#e5e7eb', '#374151'],
    YES: ['#dcfce7', '#166534'],
    NO: ['#fee2e2', '#7f1d1d'],
    INFO: ['#e0f2fe', '#0369a1'],
};

export function Badge({ tone = 'INFO', children }) {
    const [bg, fg] = TONES[tone] || TONES.INFO;
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-caps font-semibold whitespace-nowrap" style={{ background: bg, color: fg }}>
            {children}
        </span>
    );
}

export function TxLink({ hash }) {
    if (!hash) return null;
    return <Link className="font-mono text-body-sm text-primary underline" to={`/tx/${hash}`}>{short(hash, 10)}</Link>;
}

export function Notice({ tone = 'info', children }) {
    const map = { info: 'bg-secondary-container text-on-secondary-container', error: 'bg-error-container text-on-error-container', success: 'bg-surface-container text-on-surface' };
    return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg px-4 py-3 font-public-sans text-body-sm ${map[tone] || map.info}`}>{children}</div>;
}
