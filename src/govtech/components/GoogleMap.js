/**
 * GoogleMap - thin wrapper around Google Maps for the LMBS GIS surfaces.
 *
 * Two render strategies:
 *
 *   1. If REACT_APP_GOOGLE_MAPS_KEY is set, uses the Maps Embed API which
 *      gives us a real Maps view with satellite/roadmap toggle and place
 *      labels (https://developers.google.com/maps/documentation/embed).
 *
 *   2. Otherwise falls back to the keyless `https://maps.google.com/maps`
 *      iframe embed - it loses the official "Embed API" features but still
 *      shows a real Google Map of the requested area at no cost. Good
 *      enough for development without standing up an API key.
 *
 * Props:
 *   - center      [lng, lat]  GeoJSON-style coordinate pair
 *   - zoom        number      Default 14
 *   - mapType     'roadmap' | 'satellite' | 'hybrid' | 'terrain' (default: roadmap)
 *   - title       accessible label
 *   - polygon     optional [[lng,lat], ...] for the parcel outline overlay
 *                 (drawn as a translucent emerald wash on top of the iframe)
 *   - className / style  layout overrides
 */

import React from 'react';

const DEFAULT_CENTER = [27.4900, -29.3120]; // Maseru, Lesotho
const KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

function buildSrc({ center, zoom, mapType }) {
    const [lng, lat] = center || DEFAULT_CENTER;
    if (KEY) {
        const params = new URLSearchParams({
            key: KEY,
            q: `${lat},${lng}`,
            zoom: String(zoom || 14),
            maptype: mapType || 'roadmap',
        });
        return 'https://www.google.com/maps/embed/v1/view?' + params.toString();
    }
    // Keyless fallback - public Google Maps embed.
    const z = zoom || 14;
    const t = (mapType === 'satellite' || mapType === 'hybrid') ? 'k' : 'm';
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${z}&t=${t}&output=embed`;
}

/**
 * Project a [lng,lat] polygon into pixel-space relative to the map center,
 * roughly. We use a simple equirectangular projection scaled by the zoom
 * level so the overlay vaguely tracks the underlying tiles.
 */
function projectPolygon(polygon, center, zoom, width, height) {
    if (!polygon || !polygon.length) return '';
    const [cLng, cLat] = center;
    // 1 degree lat ~= 111 km. At zoom Z, world width = 256 * 2^Z px.
    const worldPx = 256 * Math.pow(2, zoom);
    const scale = worldPx / 360; // px per degree of longitude at the equator
    return polygon.map((p, i) => {
        const x = width / 2 + (p[0] - cLng) * scale;
        const y = height / 2 - (p[1] - cLat) * scale * Math.cos((cLat * Math.PI) / 180);
        return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
    }).join(' ') + ' Z';
}

export default function GoogleMap({
    center = DEFAULT_CENTER,
    zoom = 14,
    mapType = 'roadmap',
    title = 'Map view',
    polygon,
    className,
    style,
    width = 600,
    height = 400,
    children,
}) {
    const src = buildSrc({ center, zoom, mapType });
    const path = polygon ? projectPolygon(polygon, center, zoom, width, height) : '';

    return (
        <div
            className={'relative overflow-hidden ' + (className || '')}
            style={{ background: '#e6e8ea', ...(style || {}) }}
        >
            <iframe
                title={title}
                src={src}
                width="100%"
                height="100%"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                style={{ border: 0, display: 'block', width: '100%', height: '100%' }}
            />
            {path && (
                <svg
                    aria-hidden="true"
                    viewBox={`0 0 ${width} ${height}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                >
                    <path d={path} fill="rgba(5,150,105,0.20)" stroke="#059669" strokeWidth="2.5" />
                </svg>
            )}
            {children}
        </div>
    );
}

export { DEFAULT_CENTER };
