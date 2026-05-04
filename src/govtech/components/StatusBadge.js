/**
 * StatusBadge — Stitch design system spec:
 *   - Verified  → emerald 10% bg + dark green text
 *   - Pending   → amber 10% bg + dark amber text
 *   - Disputed  → crimson 10% bg + dark red text
 *   - Immutable → neutral 5% bg + deep navy text
 *   All badges use `label-caps` typography (uppercase, 12px, 700 weight).
 */

import React from 'react';

const STYLES = {
    verified:  { bg: 'rgba(5, 150, 105, 0.10)',  fg: '#059669' },
    pending:   { bg: 'rgba(245, 158, 11, 0.10)', fg: '#92400E' },
    disputed:  { bg: 'rgba(220, 38, 38, 0.10)',  fg: '#991B1B' },
    immutable: { bg: 'rgba(15, 23, 42, 0.05)',   fg: '#0F172A' },
};

export default function StatusBadge({ tone = 'immutable', children, icon }) {
    const palette = STYLES[tone] || STYLES.immutable;
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-DEFAULT font-public-sans text-label-caps font-bold uppercase tracking-wider"
            style={{ background: palette.bg, color: palette.fg }}
        >
            {icon && (
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                    {icon}
                </span>
            )}
            {children}
        </span>
    );
}
