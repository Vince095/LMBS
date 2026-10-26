/**
 * Parcel REST service — list, provenance, documents, GIS history, and the
 * /api/titles endpoint that records metadata for an on-chain registration.
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';
import { uploadDocument } from '../chain/documents';

function qs(params) {
    const entries = Object.entries(params).filter(function(e) { return e[1] != null && e[1] !== ''; });
    if (!entries.length) return '';
    return '?' + entries.map(function(e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); }).join('&');
}

export const parcelService = {
    /**
     * GET /api/parcels — paginated parcel list with optional filters.
     * @param {{ district?, status?, landUse?, limit?, page? }} params
     * @returns {{ parcels, total, page, limit, pages }}
     */
    list:           (params={})    => http.get(`${ENDPOINTS.parcels}${qs(params)}`),

    /**
     * GET /api/parcels/documents — cross-parcel document index.
     * @param {{ type?, district?, limit?, page? }} params
     * @returns {{ documents, total, page, limit, pages }}
     */
    listDocuments:  (params={})    => http.get(`${ENDPOINTS.parcels}/documents${qs(params)}`),

    getByPin:       (pin)          => http.get(`${ENDPOINTS.titles}/${encodeURIComponent(pin)}`),
    history:        (pin, q={})    => http.get(`${ENDPOINTS.parcels}/${encodeURIComponent(pin)}/history${qs(q)}`),
    documents:      (pin)          => http.get(`${ENDPOINTS.parcels}/${encodeURIComponent(pin)}/documents`),
    gisHistory:     (pin)          => http.get(`${ENDPOINTS.parcels}/${encodeURIComponent(pin)}/gis-history`),

    /**
     * Upload a supporting document for a parcel into the ENCRYPTED store
     * (POST /api/documents). The file is AES-256-GCM encrypted server-side;
     * the response carries `documentHash` (keccak256 of the plaintext), the
     * value that is anchored on-chain by submitRegistration / submitTransfer.
     * @param {string} pin
     * @param {File} file
     * @param {string} type  document type (SURVEY_PLAN, DEED_OF_SALE, …)
     */
    uploadDocument: (pin, file, type) => uploadDocument(file, { type: type || 'OTHER', parcelPin: pin }),

    /** Download and decrypt a stored document (authorised), then open it. */
    openDocument: async (docId, name) => {
        const blob = await http.get(`${ENDPOINTS.documents}/${encodeURIComponent(docId)}`, { responseType: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        if (name) a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    },

    /** Re-hash the stored ciphertext's plaintext and compare with the on-chain hash. */
    verifyDocument: (docId, onChainHash) =>
        http.get(`${ENDPOINTS.documents}/${encodeURIComponent(docId)}/verify${qs({ onChainHash })}`),

    // Used by the Registration / Transfer wizard final step.
    register:  (payload) => http.post(ENDPOINTS.titles, payload),

    // TC-LR-009 / FR-LR-008: Save a partial wizard state as a DRAFT (30-day TTL).
    saveDraft: (payload) => http.post(`${ENDPOINTS.titles}/draft`, payload),

    // List DRAFT parcels for the calling officer (resume workflow).
    listDrafts: ()       => http.get(`${ENDPOINTS.titles}/drafts`),
};

// Additions — quick text search and full parcel detail
Object.assign(parcelService, {
    search:    (q)   => http.get(`${ENDPOINTS.parcels}/search?q=${encodeURIComponent(q)}`),
    getDetail: (pin) => http.get(`${ENDPOINTS.parcels}/${encodeURIComponent(pin)}`),
});
