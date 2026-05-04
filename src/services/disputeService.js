/**
 * Dispute REST service — wraps /api/disputes endpoints.
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

function qs(params) {
    const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export const disputeService = {
    list:           (params = {})         => http.get(`${ENDPOINTS.disputes}${qs(params)}`),
    getOne:         (disputeId)           => http.get(`${ENDPOINTS.disputes}/${disputeId}`),
    file:           (payload)             => http.post(`${ENDPOINTS.disputes}/`, payload),
    assign:         (disputeId, body)     => http.post(`${ENDPOINTS.disputes}/${disputeId}/assign`, body),
    submitEvidence: (disputeId, body)     => http.post(`${ENDPOINTS.disputes}/${disputeId}/evidence`, body),
    addNote:        (disputeId, body)     => http.post(`${ENDPOINTS.disputes}/${disputeId}/notes`, body),
    resolve:        (disputeId, body)     => http.post(`${ENDPOINTS.disputes}/${disputeId}/resolve`, body),
    escalate:       (disputeId, to)       => http.post(`${ENDPOINTS.disputes}/${disputeId}/escalate`, { escalatedTo: to }),
    withdraw:       (disputeId, reason)   => http.post(`${ENDPOINTS.disputes}/${disputeId}/withdraw`, { reason }),
    listByParcel:   (parcelPin)           => http.get(`${ENDPOINTS.disputes}/by-parcel/${encodeURIComponent(parcelPin)}`),
};
