/**
 * Chain indexer — projects on-chain events into MongoDB read models.
 *
 * The blockchain is the single authority for request status and title
 * ownership. This service polls LandRegistry, DisputeRegistry and
 * EncumbranceRegistry logs and updates:
 *   chain_requests  (ChainRequest)  one document per on-chain request
 *   parcels / title_deeds / transfers   status and ownership projections
 *
 * Off-chain records NEVER change ownership on their own; they only change
 * here, in response to RequestExecuted.
 *
 * Idempotent: re-processing a block range produces the same result.
 */

const env = require('../config/env');
const chain = require('./chainService');
const { makeDeedNumber } = require('../utils/ids');
const { nextSequence } = require('../utils/counters');

const BLOCKER = ['NONE', 'OPEN_DISPUTE', 'BLOCKING_ENCUMBRANCE', 'PARTY_NOT_VERIFIED', 'OWNER_CHANGED'];
const DECISION = ['NONE', 'APPROVE', 'REJECT'];
const BATCH_BLOCKS = 2000;

function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''; }

async function partyName(models, address) {
    const u = await models.User.findOne({ address: String(address).toLowerCase() }).lean();
    return (u && u.name) || `Wallet ${shortAddr(address)}`;
}

/**
 * Apply one decoded event. `ev` = { contract, name, args }, `meta` = { txHash, blockNumber }.
 * Exported for unit tests (models can be mocked).
 */
async function applyEvent(models, ev, meta) {
    const { ChainRequest, Parcel, TitleDeed, Transfer } = models;
    const a = ev.args;
    const id = a.requestId !== undefined ? Number(a.requestId) : null;

    if (ev.contract === 'LandRegistry') {
        switch (ev.name) {
        case 'RequestSubmitted':
            await ChainRequest.updateOne(
                { requestId: id },
                {
                    $setOnInsert: { requestId: id },
                    $set: {
                        kind: chain.KIND[Number(a.kind)],
                        status: 'PENDING',
                        parcelKey: a.parcelKey,
                        tokenId: a.tokenId.toString(),
                        submitter: a.submitter.toLowerCase(),
                        from: a.from.toLowerCase(),
                        to: a.to.toLowerCase(),
                        documentHash: a.documentHash,
                        threshold: Number(a.threshold),
                        submittedTx: meta.txHash,
                        submittedBlock: meta.blockNumber,
                    },
                },
                { upsert: true },
            );
            return;
        case 'ParcelReserved':
            await ChainRequest.updateOne({ requestId: id }, { $set: { parcelNumber: a.parcelNumber } });
            return;
        case 'DecisionRecorded': {
            const approver = a.approver.toLowerCase();
            await ChainRequest.updateOne(
                { requestId: id, 'decisions.approver': { $ne: approver } },
                { $push: { decisions: {
                    approver,
                    decision: DECISION[Number(a.decision)],
                    reasonHash: a.reasonHash,
                    viaSignature: a.viaSignature,
                    txHash: meta.txHash,
                    blockNumber: meta.blockNumber,
                } } },
            );
            await ChainRequest.updateOne({ requestId: id }, { $set: { approvals: Number(a.approvals), rejections: Number(a.rejections) } });
            return;
        }
        case 'RequestApproved':
            await ChainRequest.updateOne({ requestId: id }, { $set: { status: 'APPROVED' } });
            await Transfer.updateOne({ chainRequestId: id }, { $set: { status: 'APPROVED' } });
            return;
        case 'ExecutionDeferred':
            await ChainRequest.updateOne({ requestId: id }, { $set: { blocker: BLOCKER[Number(a.reason)] } });
            return;
        case 'RequestExecuted':
            await onExecuted(models, id, a, meta);
            return;
        case 'RequestRejected':
        case 'RequestCancelled': {
            const status = ev.name === 'RequestRejected' ? 'REJECTED' : 'CANCELLED';
            await ChainRequest.updateOne({ requestId: id }, { $set: { status, closedTx: meta.txHash } });
            await Transfer.updateOne({ chainRequestId: id }, { $set: { status } });
            await TitleDeed.updateOne({ chainRequestId: id, status: 'PENDING' }, { $set: { status: 'REJECTED' } });
            await Parcel.updateOne({ chainRequestId: id, status: 'PENDING_APPROVAL' }, { $set: { status: status === 'REJECTED' ? 'REJECTED' : 'DRAFT' } });
            return;
        }
        default:
            return;
        }
    }

    if (ev.contract === 'DisputeRegistry') {
        if (ev.name === 'DisputeOpened') {
            await Parcel.updateOne({ parcelKey: a.parcelKey }, { $set: { status: 'DISPUTED' } });
        } else if (ev.name === 'DisputeClosed') {
            const stillOpen = await chain.contract('DisputeRegistry').hasOpenDispute(a.parcelKey);
            if (!stillOpen) await Parcel.updateOne({ parcelKey: a.parcelKey, status: 'DISPUTED' }, { $set: { status: 'ACTIVE' } });
        }
        return;
    }

    if (ev.contract === 'EncumbranceRegistry') {
        if (ev.name === 'EncumbranceRegistered') {
            await Parcel.updateOne({ parcelKey: a.parcelKey, status: 'ACTIVE' }, { $set: { status: 'ENCUMBERED' } });
        } else if (ev.name === 'EncumbranceDischarged') {
            const blocking = await chain.contract('EncumbranceRegistry').hasBlockingEncumbrance(a.parcelKey);
            if (!blocking) await Parcel.updateOne({ parcelKey: a.parcelKey, status: 'ENCUMBERED' }, { $set: { status: 'ACTIVE' } });
        }
    }

}

async function onExecuted(models, id, a, meta) {
    const { ChainRequest, Parcel, TitleDeed, Transfer, AuditLog } = models;
    const kind = chain.KIND[Number(a.kind)];
    const tokenId = a.tokenId.toString();
    const to = a.to.toLowerCase();

    await ChainRequest.updateOne(
        { requestId: id },
        { $set: { status: 'EXECUTED', executedTx: meta.txHash, executedBlock: meta.blockNumber, blocker: null } },
    );
    const req = await ChainRequest.findOne({ requestId: id }).lean();
    const ownerName = await partyName(models, to);

    if (kind === 'REGISTRATION') {
        const pin = req && req.parcelNumber;
        await Parcel.updateOne(
            { $or: [{ chainRequestId: id }, ...(pin ? [{ pin }] : [])] },
            { $set: { status: 'ACTIVE', tokenId, parcelKey: req && req.parcelKey, blockchainTxId: meta.txHash } },
        );
        const deed = await TitleDeed.findOne({ chainRequestId: id });
        if (deed) {
            deed.status = 'ACTIVE';
            deed.anchored = true;
            deed.tokenId = tokenId;
            deed.blockchainTxId = meta.txHash;
            deed.issuedAt = new Date();
            deed.owners = [{ fullName: ownerName, address: to, percentage: 100 }];
            await deed.save();
        } else if (pin) {
            await TitleDeed.create({
                deedNumber: makeDeedNumber(await nextSequence('deeds')),
                parcelPin: pin,
                tokenId,
                owners: [{ fullName: ownerName, address: to, percentage: 100 }],
                status: 'ACTIVE',
                anchored: true,
                chainRequestId: id,
                blockchainTxId: meta.txHash,
                issuedAt: new Date(),
                issuedBy: 'LandRegistry',
            });
        }
        await AuditLog.create({
            action: 'TITLE_ISSUED', resourceType: 'titles', resourceId: pin || tokenId,
            actorAddress: req && req.submitter, blockchainTxId: meta.txHash,
            responseSummary: { requestId: id, owner: to },
        }).catch(() => {});
        return;
    }

    // TRANSFER: ownership in the read model follows the chain.
    const deed = await TitleDeed.findOne({ tokenId, status: 'ACTIVE' });
    if (deed) {
        deed.history.push({
            version: deed.version,
            changedAt: new Date(),
            changedBy: 'LandRegistry',
            snapshot: { owners: deed.owners, status: deed.status, issuedAt: deed.issuedAt, issuedBy: deed.issuedBy },
        });
        deed.owners = [{ fullName: ownerName, address: to, percentage: 100 }];
        deed.version += 1;
        deed.blockchainTxId = meta.txHash;
        deed.anchored = true;
        deed.markModified('history');
        await deed.save();
    }
    await Transfer.updateOne({ chainRequestId: id }, { $set: { status: 'COMPLETE', blockchainTxId: meta.txHash } });
    await AuditLog.create({
        action: 'TRANSFER_COMPLETED', resourceType: 'transfers', resourceId: deed ? deed.parcelPin : tokenId,
        blockchainTxId: meta.txHash, responseSummary: { requestId: id, from: a.from.toLowerCase(), to },
    }).catch(() => {});
}

// ------------------------------------------------------------------ polling

function indexedContracts() {
    const { deployment, abis } = chain.loadConfig();
    const { ethers } = require('ethers');
    return ['LandRegistry', 'DisputeRegistry', 'EncumbranceRegistry'].map((name) => ({
        name,
        address: deployment.contracts[name].toLowerCase(),
        iface: new ethers.Interface(abis[name]),
    }));
}

async function syncOnce(models) {
    if (!chain.isConfigured()) return { skipped: 'chain not configured' };
    const { ChainCursor } = models;
    const provider = chain.getProvider();
    const contracts = indexedContracts();
    const cursorId = `LMBS:${contracts[0].address}`;
    const { deployment } = chain.loadConfig();

    const cursor = await ChainCursor.findById(cursorId).lean();
    let from = cursor ? cursor.lastBlock + 1 : Math.max(0, Number(deployment.startBlock || 0));
    const head = await provider.getBlockNumber();
    let applied = 0;

    while (from <= head) {
        const to = Math.min(head, from + BATCH_BLOCKS - 1);
        const logs = await provider.getLogs({ address: contracts.map((c) => c.address), fromBlock: from, toBlock: to });
        logs.sort((x, y) => (x.blockNumber - y.blockNumber) || (x.index - y.index));
        for (const log of logs) {
            const c = contracts.find((k) => k.address === log.address.toLowerCase());
            let parsed = null;
            try { parsed = c.iface.parseLog(log); } catch (_) { /* not ours */ }
            if (!parsed) continue;
            await applyEvent(models, { contract: c.name, name: parsed.name, args: parsed.args }, { txHash: log.transactionHash, blockNumber: log.blockNumber });
            applied += 1;
        }
        await ChainCursor.updateOne({ _id: cursorId }, { $set: { lastBlock: to } }, { upsert: true });
        from = to + 1;
    }
    return { head, applied };
}

let timer = null;
let running = false;

function start(models) {
    if (!env.indexerEnabled || timer) return;
    const tick = async () => {
        if (running) return;
        running = true;
        try { await syncOnce(models); } catch (err) {
            // eslint-disable-next-line no-console
            console.warn('[indexer]', err.message);
        } finally { running = false; }
    };
    timer = setInterval(tick, env.indexerIntervalMs);
    tick();
}

function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { applyEvent, syncOnce, start, stop };
