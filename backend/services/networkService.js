/**
 * Network service — exposes Besu chain status and TX lookup to the frontend.
 */

const env = require('../config/env');
const { getProvider } = require('./chainService');

async function status() {
    const out = {
        rpcUrl:         env.rpcUrl,
        chainId:        null,
        blockNumber:    null,
        peerCount:      null,
        validatorCount: null,
        synced:         false,
        reachable:      false,
        latencyMs:      null,
    };

    const started = Date.now();
    try {
        const provider = getProvider();
        const network  = await provider.getNetwork();
        out.chainId    = Number(network.chainId);
        out.blockNumber = await provider.getBlockNumber();
        out.reachable  = true;
        out.synced     = out.blockNumber > 0;

        try {
            const peerHex = await provider.send('net_peerCount', []);
            out.peerCount = parseInt(peerHex, 16);
        } catch { /* method unavailable on some chains */ }

        try {
            const validators = await provider.send('qbft_getValidatorsByBlockNumber', ['latest']);
            if (Array.isArray(validators)) out.validatorCount = validators.length;
        } catch { /* IBFT/QBFT not enabled */ }
    } catch (err) {
        out.error = err.message;
    } finally {
        out.latencyMs = Date.now() - started;
    }

    return out;
}

/**
 * Fetch a single transaction by hash.
 *
 * Strategy:
 *  1. Try Besu JSON-RPC via ethers provider.
 *  2. On failure (chain unreachable) fall back to scanning MongoDB for any
 *     document that references the hash as blockchainTxId.
 *
 * Returns a normalised object so the frontend doesn't need ethers types.
 */
async function getTransaction(txHash) {
    // ── Try chain first ──────────────────────────────────────────────────────
    try {
        const provider = getProvider();
        const [tx, receipt] = await Promise.all([
            provider.getTransaction(txHash),
            provider.getTransactionReceipt(txHash).catch(() => null),
        ]);

        if (tx) {
            return {
                source:      'chain',
                hash:        tx.hash,
                blockNumber: tx.blockNumber,
                blockHash:   tx.blockHash,
                from:        tx.from,
                to:          tx.to,
                value:       tx.value?.toString() || '0',
                gasLimit:    tx.gasLimit?.toString(),
                gasPrice:    tx.gasPrice?.toString(),
                nonce:       tx.nonce,
                data:        tx.data,
                status:      receipt ? (receipt.status === 1 ? 'SUCCESS' : 'FAILED') : 'PENDING',
                gasUsed:     receipt?.gasUsed?.toString(),
                timestamp:   null, // populated below if block is available
                confirmations: receipt?.confirmations || 0,
            };
        }
    } catch (chainErr) {
        /* chain unreachable — fall through to MongoDB */
    }

    // ── MongoDB fallback ─────────────────────────────────────────────────────
    const { Parcel, TitleDeed, Transfer, Dispute, Encumbrance } = require('../models');

    // Search all collections that store blockchainTxId
    const [parcel, deed, transfer, dispute, encumbrance] = await Promise.allSettled([
        Parcel.findOne({ blockchainTxId: txHash }).lean(),
        TitleDeed.findOne({ blockchainTxId: txHash }).lean(),
        Transfer.findOne({ $or: [{ blockchainTxId: txHash }, { initTxId: txHash }] }).lean(),
        Dispute.findOne({ blockchainTxId: txHash }).lean(),
        Encumbrance.findOne({ blockchainTxId: txHash }).lean(),
    ]);

    const found = [
        parcel.status === 'fulfilled' && parcel.value   ? { type: 'parcel',      doc: parcel.value }     : null,
        deed.status === 'fulfilled' && deed.value       ? { type: 'titleDeed',   doc: deed.value }       : null,
        transfer.status === 'fulfilled' && transfer.value ? { type: 'transfer',  doc: transfer.value }   : null,
        dispute.status === 'fulfilled' && dispute.value ? { type: 'dispute',     doc: dispute.value }    : null,
        encumbrance.status === 'fulfilled' && encumbrance.value ? { type:'encumbrance', doc: encumbrance.value } : null,
    ].filter(Boolean);

    if (found.length === 0) return null;

    const best = found[0];
    return {
        source:        'mongodb',
        hash:          txHash,
        resourceType:  best.type,
        resourceId:    best.doc.pin || best.doc.deedNumber || best.doc.transferId || best.doc.disputeId || best.doc.encumbranceId,
        status:        'RECORDED',
        timestamp:     best.doc.createdAt || best.doc.issuedAt || null,
        relatedEntities: found.map((f) => ({
            type: f.type,
            id:   f.doc.pin || f.doc.deedNumber || f.doc.transferId || f.doc.disputeId || f.doc.encumbranceId,
        })),
    };
}

module.exports = { status, getTransaction };
