/**
 * Encumbrance REST service — wraps /api/encumbrances endpoints.
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

function qs(params) {
    const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export const encumbranceService = {
    list:           (params = {})  => http.get(`${ENDPOINTS.encumbrances}${qs(params)}`),
    getOne:         (id)           => http.get(`${ENDPOINTS.encumbrances}/${id}`),
    register:       (payload)      => http.post(`${ENDPOINTS.encumbrances}/`, payload),
    discharge:      (id, body)     => http.post(`${ENDPOINTS.encumbrances}/${id}/discharge`, body),
    listByParcel:   (pin)          => http.get(`${ENDPOINTS.encumbrances}/by-parcel/${encodeURIComponent(pin)}`),
    isUnencumbered: (pin)          => http.get(`${ENDPOINTS.encumbrances}/by-parcel/${encodeURIComponent(pin)}/unencumbered`),
};
