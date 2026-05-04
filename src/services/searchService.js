/**
 * Search REST service — wraps /api/search endpoints (FR-SQ-001..002).
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

function buildQuery(params) {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') search.set(k, v);
    });
    const qs = search.toString();
    return qs ? `?${qs}` : '';
}

export const searchService = {
    publicSearch: (params) => http.get(`${ENDPOINTS.search}/public${buildQuery(params)}`),
    advancedSearch: (params) => http.get(`${ENDPOINTS.search}/advanced${buildQuery(params)}`),
};
