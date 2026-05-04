/**
 * QRCode - renders a scannable QR code for the LMBS certificate.
 *
 * Uses the free api.qrserver.com endpoint so we don't need to ship a QR
 * generator in the bundle. The image content embeds the verification URL
 * (or the certificate proof hash itself), which a phone can scan and open.
 *
 * Set REACT_APP_QR_BASE in .env to point at a self-hosted goqr-mirror in
 * production - data sovereignty matters for a Lesotho government portal.
 */

import React from 'react';

const DEFAULT_BASE = process.env.REACT_APP_QR_BASE || 'https://api.qrserver.com/v1/create-qr-code/';

export default function QRCode({ value, size = 96, label, className, style }) {
    if (!value) return null;
    const params = new URLSearchParams({
        size: size + 'x' + size,
        data: value,
        qzone: '1',
        margin: '0',
        format: 'png',
    });
    const src = DEFAULT_BASE + '?' + params.toString();
    return (
        <img
            src={src}
            alt={label || ('QR code for ' + value)}
            width={size}
            height={size}
            className={className}
            style={{ display: 'block', imageRendering: 'crisp-edges', ...(style || {}) }}
            loading="lazy"
        />
    );
}
