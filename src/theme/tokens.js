/**
 * LMBS design tokens — Stitch "Immutable Governance" system.
 *
 * Mirrors `stitch/immutable_governance/DESIGN.md`. Tailwind classes that
 * reference these tokens (e.g. `bg-surface-container-lowest`) are wired in
 * `public/index.html`'s tailwind.config block; this JS module is only for
 * components that need the raw values (e.g. inline SVG fills).
 */

export const colors = {
    // Surfaces
    surface: '#f7f9fb',
    surfaceDim: '#d8dadc',
    surfaceBright: '#f7f9fb',
    surfaceContainerLowest: '#ffffff',
    surfaceContainerLow: '#f2f4f6',
    surfaceContainer: '#eceef0',
    surfaceContainerHigh: '#e6e8ea',
    surfaceContainerHighest: '#e0e3e5',

    // Text
    onSurface: '#191c1e',
    onSurfaceVariant: '#45464d',
    inverseSurface: '#2d3133',
    inverseOnSurface: '#eff1f3',

    // Outlines
    outline: '#76777d',
    outlineVariant: '#c6c6cd',

    // Brand — Deep Navy + Slate (institutional trust)
    primary: '#000000',
    onPrimary: '#ffffff',
    primaryContainer: '#131b2e',
    onPrimaryContainer: '#7c839b',
    primaryFixed: '#dae2fd',
    primaryFixedDim: '#bec6e0',

    secondary: '#515f74',
    onSecondary: '#ffffff',
    secondaryContainer: '#d5e3fc',
    onSecondaryContainer: '#57657a',

    // Tertiary — Emerald Green (land actions / verified status)
    tertiary: '#000000',
    onTertiary: '#ffffff',
    tertiaryContainer: '#002114',
    onTertiaryContainer: '#069669',
    tertiaryFixed: '#85f8c4',
    tertiaryFixedDim: '#68dba9',

    // Status
    error: '#ba1a1a',
    onError: '#ffffff',
    errorContainer: '#ffdad6',
    onErrorContainer: '#93000a',

    // Aliases used by quick references in pages
    deepNavy: '#0F172A',
    slate600: '#475569',
    slate500: '#64748b',
    slate200: '#e2e8f0',
    emerald: '#059669',
    emeraldTint: '#dcfce7',
    amberTint: '#fef3c7',
    crimsonTint: '#fee2e2',
};

// Stitch typography uses "Public Sans" — declared in public/index.html.
export const typography = {
    family: '"Public Sans", ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    h1:        { size: 48, weight: 700, lineHeight: 1.2, letterSpacing: '-0.02em' },
    h2:        { size: 30, weight: 600, lineHeight: 1.3, letterSpacing: '-0.01em' },
    h3:        { size: 24, weight: 600, lineHeight: 1.3 },
    bodyLg:    { size: 18, weight: 400, lineHeight: 1.6 },
    bodyMd:    { size: 16, weight: 400, lineHeight: 1.5 },
    bodySm:    { size: 14, weight: 400, lineHeight: 1.4 },
    labelCaps: { size: 12, weight: 700, lineHeight: 1.2, letterSpacing: '0.05em' },
    dataTab:   { size: 14, weight: 500, lineHeight: 1.0 },
};

export const radii = {
    DEFAULT: '0.125rem',  // 2px
    lg:      '0.25rem',   // 4px — primary UI radius (Soft Level 1)
    xl:      '0.5rem',    // 8px — cards, map panels
    full:    '0.75rem',   // 12px — special containers
    pill:    '9999px',
};

export const spacing = {
    unit: 4, gutter: 24, margin: 32,
    stackSm: 8, stackMd: 16, stackLg: 32,
    containerMax: 1440,
};

export const shadows = {
    none: 'none',
    raised: '0px 4px 20px rgba(15, 23, 42, 0.08)',
};

// Status badge palettes (Verified / Pending / Disputed / Verified-on-chain)
export const badges = {
    verified:  { bg: 'rgba(5, 150, 105, 0.10)',  text: '#059669' },
    pending:   { bg: 'rgba(245, 158, 11, 0.10)', text: '#92400E' },
    disputed:  { bg: 'rgba(220, 38, 38, 0.10)',  text: '#991B1B' },
    immutable: { bg: 'rgba(15, 23, 42, 0.05)',   text: '#0F172A' },
};
