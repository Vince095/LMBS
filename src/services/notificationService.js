/**
 * Notification REST service — in-app notification centre (FR-NA-002).
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

export const notificationService = {
    listForAddress: (address, params = {}) => {
        const search = new URLSearchParams(params).toString();
        const qs = search ? `?${search}` : '';
        return http.get(`${ENDPOINTS.notifications}/by-address/${encodeURIComponent(address)}${qs}`);
    },
    markRead: (id) => http.post(`${ENDPOINTS.notifications}/${id}/read`, {}),
    send: (payload) => http.post(`${ENDPOINTS.notifications}/`, payload),
};
