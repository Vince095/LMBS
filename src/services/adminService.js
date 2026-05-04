/**
 * Admin REST service — wraps /api/admin endpoints (ADMIN role only).
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

function qs(params) {
    const entries = Object.entries(params).filter(function(e) { return e[1] != null && e[1] !== ''; });
    if (!entries.length) return '';
    return '?' + entries.map(function(e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); }).join('&');
}

const BASE = ENDPOINTS.admin;

export const adminService = {
    stats:          ()                   => http.get(`${BASE}/stats`),
    listUsers:      (params={})          => http.get(`${BASE}/users${qs(params)}`),
    getUser:        (id)                 => http.get(`${BASE}/users/${id}`),
    updateUser:     (id, payload)        => http.put(`${BASE}/users/${id}`, payload),
    deactivateUser: (id)                 => http.post(`${BASE}/users/${id}/deactivate`, {}),
    activateUser:   (id)                 => http.post(`${BASE}/users/${id}/activate`, {}),
};
