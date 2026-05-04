/**
 * Cross-page action helpers - keep the per-page button handlers tiny.
 */

export function printPage() {
    if (typeof window !== 'undefined' && window.print) window.print();
}

export async function shareOrCopy({ title, text, url }) {
    const target = url || (typeof window !== 'undefined' ? window.location.href : '');
    if (typeof navigator !== 'undefined' && navigator.share) {
        try {
            await navigator.share({ title, text, url: target });
            return 'shared';
        } catch (_) { return 'cancelled'; }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(target);
            return 'copied';
        } catch (_) { /* fallthrough */ }
    }
    return 'unavailable';
}

export function downloadCSV(filename, rows) {
    if (!rows || !rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
        const s = (v == null ? '' : String(v)).replace(/"/g, '""');
        return /[",\n]/.test(s) ? '"' + s + '"' : s;
    };
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
    triggerDownload(filename, 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv));
}

export function downloadJSON(filename, data) {
    triggerDownload(filename, 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2)));
}

function triggerDownload(filename, href) {
    if (typeof document === 'undefined') return;
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/**
 * Returns the internal route for viewing a blockchain transaction.
 *
 * Previously this pointed to the Besu RPC URL (http://127.0.0.1:8560/tx/...)
 * which caused 404 errors because the Besu node doesn't serve an explorer UI.
 *
 * Now routes to the internal /tx/:hash page which queries our own backend
 * (GET /api/network/tx/:txHash) and falls back to MongoDB if the chain is
 * unreachable in dev.
 *
 * @param {string} txHash  - 0x… EVM hash, HLF txid, or IPFS CID
 * @returns {string|null}  - internal React Router path  (e.g. "/tx/0xabc…")
 */
export function explorerUrl(txHash) {
    if (!txHash) return null;
    return '/tx/' + encodeURIComponent(txHash);
}

/**
 * Whether a given txHash looks like a real on-chain hash (0x + 64 hex chars).
 */
export function isEthHash(hash) {
    return typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash);
}
