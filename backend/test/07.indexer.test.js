/**
 * The indexer is the ONLY place where off-chain ownership changes, and only
 * in response to the on-chain RequestExecuted event.
 */
jest.mock('../utils/counters', () => ({ nextSequence: jest.fn(async () => 1) }));
const { applyEvent } = require('../services/indexerService');

function models({ deed = null, request = {} } = {}) {
    const m = {
        ChainRequest: { updateOne: jest.fn(async () => ({})), findOne: jest.fn(() => ({ lean: async () => request })) },
        Parcel: { updateOne: jest.fn(async () => ({})) },
        TitleDeed: { updateOne: jest.fn(async () => ({})), findOne: jest.fn(async () => deed), create: jest.fn(async () => ({})) },
        Transfer: { updateOne: jest.fn(async () => ({})) },
        AuditLog: { create: jest.fn(async () => ({})) },
        User: { findOne: jest.fn(() => ({ lean: async () => ({ name: 'Synthetic Buyer' }) })) },
    };
    return m;
}

const META = { txHash: '0x' + 'cd'.repeat(32), blockNumber: 99 };
const A = '0x00000000000000000000000000000000000000a1';
const B = '0x00000000000000000000000000000000000000b2';

describe('Chain indexer projections', () => {
    test('RequestSubmitted creates a PENDING read-model entry only', async () => {
        const m = models();
        await applyEvent(m, { contract: 'LandRegistry', name: 'RequestSubmitted', args: {
            requestId: 5n, kind: 1n, parcelKey: '0x' + '01'.repeat(32), tokenId: 1n, submitter: A, from: A, to: B, documentHash: '0x' + '02'.repeat(32), threshold: 3n,
        } }, META);
        expect(m.ChainRequest.updateOne).toHaveBeenCalledWith({ requestId: 5 }, expect.objectContaining({ $set: expect.objectContaining({ status: 'PENDING', kind: 'TRANSFER' }) }), { upsert: true });
        expect(m.TitleDeed.findOne).not.toHaveBeenCalled();
        expect(m.Transfer.updateOne).not.toHaveBeenCalled();
    });

    test('approvals alone never change ownership', async () => {
        const m = models();
        await applyEvent(m, { contract: 'LandRegistry', name: 'DecisionRecorded', args: { requestId: 5n, approver: A, decision: 1n, reasonHash: '0x' + '00'.repeat(32), viaSignature: false, approvals: 2n, rejections: 0n } }, META);
        await applyEvent(m, { contract: 'LandRegistry', name: 'RequestApproved', args: { requestId: 5n } }, META);
        expect(m.TitleDeed.findOne).not.toHaveBeenCalled();
        expect(m.Transfer.updateOne).toHaveBeenCalledWith({ chainRequestId: 5 }, { $set: { status: 'APPROVED' } });
    });

    test('RequestExecuted (transfer) moves ownership in the read model and completes the transfer', async () => {
        const deed = { parcelPin: '13283-001', owners: [{ fullName: 'Seller', address: A, percentage: 100 }], history: [], version: 1, status: 'ACTIVE', save: jest.fn(async () => ({})), markModified: jest.fn() };
        const m = models({ deed, request: { requestId: 5, kind: 'TRANSFER' } });
        await applyEvent(m, { contract: 'LandRegistry', name: 'RequestExecuted', args: { requestId: 5n, kind: 1n, tokenId: 123n, from: A, to: B } }, META);
        expect(deed.owners).toEqual([{ fullName: 'Synthetic Buyer', address: B, percentage: 100 }]);
        expect(deed.version).toBe(2);
        expect(deed.history).toHaveLength(1);
        expect(deed.blockchainTxId).toBe(META.txHash);
        expect(m.Transfer.updateOne).toHaveBeenCalledWith({ chainRequestId: 5 }, { $set: { status: 'COMPLETE', blockchainTxId: META.txHash } });
    });

    test('RequestExecuted (registration) activates the pending parcel and deed', async () => {
        const deed = { status: 'PENDING', save: jest.fn(async () => ({})) };
        const m = models({ deed, request: { requestId: 3, parcelNumber: '13283-001', parcelKey: '0x' + '01'.repeat(32) } });
        await applyEvent(m, { contract: 'LandRegistry', name: 'RequestExecuted', args: { requestId: 3n, kind: 0n, tokenId: 1n, from: '0x0000000000000000000000000000000000000000', to: B } }, META);
        expect(deed.status).toBe('ACTIVE');
        expect(deed.anchored).toBe(true);
        expect(m.Parcel.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: expect.objectContaining({ status: 'ACTIVE', blockchainTxId: META.txHash }) });
    });

    test('RequestRejected marks the pending records rejected', async () => {
        const m = models();
        await applyEvent(m, { contract: 'LandRegistry', name: 'RequestRejected', args: { requestId: 9n } }, META);
        expect(m.ChainRequest.updateOne).toHaveBeenCalledWith({ requestId: 9 }, { $set: { status: 'REJECTED', closedTx: META.txHash } });
        expect(m.TitleDeed.updateOne).toHaveBeenCalledWith({ chainRequestId: 9, status: 'PENDING' }, { $set: { status: 'REJECTED' } });
    });
});
