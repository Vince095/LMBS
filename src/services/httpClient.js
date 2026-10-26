/**
 * Tiny fetch-based HTTP client with consistent error handling.
 *
 * Auto-attaches the JWT from localStorage (key: lmbs.token) to every request
 * unless caller already supplied an Authorization header. On 401 it dispatches
 * a 'lmbs:auth:expired' window event so AuthContext can clear local state.
 * Pass `{ responseType: 'blob' }` to receive a successful body as a Blob.
 */

const TOKEN_KEY = 'lmbs.token';

function getToken() {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null; }
    catch (_) { return null; }
}

async function request(url, options) {
    const opts = options || {};
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };

    const token = getToken();
    if (token && !headers.Authorization && !headers.authorization) {
        headers.Authorization = 'Bearer ' + token;
    }

    const init = {
        method: opts.method || 'GET',
        headers,
        body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
    };

    let response;
    try {
        response = await fetch(url, init);
    } catch (networkErr) {
        const err = new Error('Network error contacting ' + url + ': ' + networkErr.message);
        err.cause = networkErr;
        throw err;
    }

    if (response.ok && opts.responseType === 'blob') return response.blob();

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text();

    if (!response.ok) {
        const message = (payload && payload.error) || ('HTTP ' + response.status);
        const err = new Error(message);
        err.status = response.status;
        err.payload = payload;
        if (response.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('lmbs:auth:expired'));
        }
        throw err;
    }

    return payload;
}

export const http = {
    get:  (url, opts)       => request(url, { ...opts, method: 'GET' }),
    post: (url, body, opts) => request(url, { ...opts, method: 'POST', body }),
    put:  (url, body, opts) => request(url, { ...opts, method: 'PUT',  body }),
    del:  (url, opts)       => request(url, { ...opts, method: 'DELETE' }),
};

export const TOKEN_STORAGE_KEY = TOKEN_KEY;
