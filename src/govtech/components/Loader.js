/**
 * Loader - reusable spinner using the Stitch Immutable Governance palette.
 *
 *   <Loader size="lg" label="Authenticating..." />          // inline
 *   <Loader fullscreen label="Loading registry..." />       // overlay
 *   <Loader inline />                                       // 16px chip
 */

import React from 'react';

const SIZE_PX = { xs: 14, sm: 20, md: 32, lg: 48, xl: 64 };

export function Spinner({ size = 'md', stroke = 4 }) {
    const px = SIZE_PX[size] || size;
    return (
        <span
            role="status"
            aria-live="polite"
            aria-label="Loading"
            style={{
                display: 'inline-block',
                width: px,
                height: px,
                borderRadius: '50%',
                border: stroke + 'px solid var(--imm-outline-variant, #e0e3e5)',
                borderTopColor: 'var(--imm-primary, #0F172A)',
                borderRightColor: 'var(--imm-emerald, #059669)',
                animation: 'lmbs-spin 0.9s linear infinite',
            }}
        />
    );
}

export default function Loader({ size = 'md', label, fullscreen, inline, className, style }) {
    if (inline) {
        return (
            <span
                className={'inline-flex items-center gap-2 font-public-sans text-body-sm text-on-surface-variant ' + (className || '')}
                style={style}
            >
                <Spinner size="xs" stroke={2} />
                {label}
            </span>
        );
    }

    const wrapClasses = fullscreen
        ? 'fixed inset-0 flex flex-col items-center justify-center gap-stack-md bg-surface z-50'
        : 'flex flex-col items-center justify-center gap-stack-md py-stack-lg';

    return (
        <div
            className={(className || '') + ' ' + wrapClasses}
            style={style}
            role="status"
            aria-live="polite"
        >
            <Spinner size={size} />
            {label && (
                <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant">
                    {label}
                </div>
            )}
        </div>
    );
}
