/**
 * Centralised API base URL configuration for the LMBS frontend.
 *
 * The default points at the local Express backend. In production this should
 * be set via the CRA env var REACT_APP_API_BASE so the bundle can be built
 * once and deployed against any environment.
 */

export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

export const ENDPOINTS = {
    profiles:      `${API_BASE}/api/profiles`,
    titles:        `${API_BASE}/api/titles`,
    signatures:    `${API_BASE}/api/signatures`,
    transacs:      `${API_BASE}/api/transacs`,
    disputes:      `${API_BASE}/api/disputes`,
    encumbrances:  `${API_BASE}/api/encumbrances`,
    search:        `${API_BASE}/api/search`,
    notifications: `${API_BASE}/api/notifications`,
    audit:         `${API_BASE}/api/audit`,
    health:        `${API_BASE}/api/health`,

    // GovTech UI feeds
    dashboard:     `${API_BASE}/api/dashboard`,
    parcels:       `${API_BASE}/api/parcels`,
    transfers:     `${API_BASE}/api/transfers`,
    admin:         `${API_BASE}/api/admin`,
    certificates:  `${API_BASE}/api/certificates`,
    network:       `${API_BASE}/api/network`,
};
