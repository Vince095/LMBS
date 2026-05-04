/**
 * Transfer workflow REST service — wraps /api/transfers endpoints.
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

function qs(params) {
    const entries = Object.entries(params).filter(function(e) { return e[1] != null && e[1] !== ''; });
    if (!entries.length) return '';
    return '?' + entries.map(function(e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); }).join('&');
}

const BASE = (ENDPOINTS.transfers || (ENDPOINTS.parcels.replace('/api/parcels', '/api/transfers')));

export const transferService = {
    list:     (params={})       => http.get(`${BASE}${qs(params)}`),
    pending:  ()                => http.get(`${BASE}/pending`),
    initiate: (payload)         => http.post(BASE, payload),
    getOne:   (id)              => http.get(`${BASE}/${id}`),
    advance:  (id, body={})     => http.post(`${BASE}/${id}/advance`, body),
    cancel:   (id, reason='')   => http.post(`${BASE}/${id}/cancel`, { reason }),
};
