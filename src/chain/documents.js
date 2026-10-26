/**
 * Upload a file to the backend's ENCRYPTED document store and get back the
 * keccak256 `documentHash` that will be anchored on-chain.
 */
import { http } from '../services/httpClient';
import { API_BASE } from '../config/api';

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return window.btoa(bin);
}

export async function uploadDocument(file, { type = 'OTHER', parcelPin } = {}) {
    const buf = await file.arrayBuffer();
    return http.post(`${API_BASE}/api/documents`, {
        contentBase64: toBase64(buf), name: file.name, mimeType: file.type || 'application/octet-stream', type, parcelPin,
    });
}

/** A manifest ties several documents to the single documentHash a request carries. */
export async function uploadManifest(manifest, parcelPin) {
    const json = JSON.stringify(manifest, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const file = new File([blob], `manifest-${Date.now()}.json`, { type: 'application/json' });
    return uploadDocument(file, { type: 'OTHER', parcelPin });
}
