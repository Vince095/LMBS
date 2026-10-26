/**
 * Provenance is built only from chain read models (chain_requests, disputes,
 * encumbrances) and the encrypted document store: no Fabric/IPFS remnants,
 * no invented hashes.
 */
const provenance = require('../services/provenanceService');

function q(result) {
    const chain = { sort: () => chain, select: () => chain, skip: () => chain, limit: () => chain, lean: async () => result };
    return chain;
}
function model(rows, one) {
    return { find: () => q(rows), findOne: () => q(one === undefined ? rows[0] || null : one), countDocuments: async () => rows.length };
}

const A = '0x' + 'a'.repeat(40);
const B = '0x' + 'b'.repeat(40);
const APPROVER = '0x' + 'c'.repeat(40);
const DOC_HASH = '0x' + '11'.repeat(32);

function deps(overrides = {}) {
    const requests = [
        {
            requestId: 1, kind: 'REGISTRATION', status: 'EXECUTED', parcelNumber: 'MSU-1', tokenId: '77',
            submitter: A, from: '0x' + '0'.repeat(40), to: A, documentHash: DOC_HASH, threshold: 3, approvals: 3, rejections: 0,
            submittedTx: '0xsub1', submittedBlock: 10, executedTx: '0xexe1', executedBlock: 14,
            decisions: [{ approver: APPROVER, decision: 'APPROVE', viaSignature: true, txHash: '0xvote', blockNumber: 12 }],
            createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
        },
        {
            requestId: 2, kind: 'TRANSFER', status: 'APPROVED', blocker: 'OPEN_DISPUTE', tokenId: '77',
            submitter: A, from: A, to: B, documentHash: '0x' + '22'.repeat(32), threshold: 3, approvals: 3, rejections: 0,
            submittedTx: '0xsub2', submittedBlock: 20, decisions: [],
            createdAt: new Date('2026-02-01'), updatedAt: new Date('2026-02-03'),
        },
    ];
    const m = {
        Parcel: model([{ pin: 'MSU-1', status: 'DISPUTED', tokenId: '77', parcelKey: '0xkey', district: 'Maseru' }]),
        TitleDeed: model([{ deedNumber: 'D-1', tokenId: '77' }]),
        ChainRequest: model(requests),
        Dispute: model([{ disputeId: 'DSP-1', filerAddress: B, createdAt: new Date('2026-02-02'), blockchainTxId: '0xdisp' }]),
        Encumbrance: model([]),
        StoredDocument: model([{ docId: 'doc-1', parcelPin: 'MSU-1', type: 'SURVEY_PLAN', name: 'plan.pdf', sha256: 'ab', documentHash: DOC_HASH, sizeBytes: 2048, createdAt: new Date('2025-12-31') }]),
        User: model([{ address: A, name: 'Applicant One' }]),
        ...overrides,
    };
    return { models: m, chain: { isConfigured: () => false } };
}

describe('provenanceService', () => {
    test('history is derived from chain read models', async () => {
        const out = await provenance.history('MSU-1', {}, deps());
        const types = out.events.map((e) => e.eventType);
        expect(types).toEqual(expect.arrayContaining([
            'REGISTRATION_SUBMITTED', 'APPROVAL_RECORDED', 'TITLE_ISSUED',
            'TRANSFER_INITIATED', 'EXECUTION_DEFERRED', 'DISPUTE_OPENED', 'DOCUMENT_ATTACHED',
        ]));
        const issued = out.events.find((e) => e.eventType === 'TITLE_ISSUED');
        expect(issued.txId).toBe('0xexe1');
        expect(issued.principal).toBe('Applicant One');
        const vote = out.events.find((e) => e.eventType === 'APPROVAL_RECORDED');
        expect(vote.principalSub).toMatch(/EIP-712/);
        const blocked = out.events.find((e) => e.eventType === 'EXECUTION_DEFERRED');
        expect(blocked.blocker).toBe('OPEN_DISPUTE');
        expect(blocked.txId).toBeNull();
    });

    test('no Fabric chaincode or IPFS fields are produced', async () => {
        const out = await provenance.history('MSU-1', {}, deps());
        const json = JSON.stringify(out.events);
        expect(json).not.toMatch(/ipfs|chaincode|LandParcelCC|AuditCC/i);
    });

    test('documents come from the encrypted store and report on-chain anchoring', async () => {
        const docs = await provenance.documents('MSU-1', deps());
        expect(docs).toHaveLength(1);
        expect(docs[0]).toMatchObject({ docId: 'doc-1', documentHash: DOC_HASH, anchoredOnChain: true, requestId: 1, encryption: 'aes-256-gcm' });
        expect(docs[0]).not.toHaveProperty('ipfsCid');
    });

    test('a document whose hash was never submitted on-chain is not reported as anchored', async () => {
        const d = deps({ ChainRequest: model([]) });
        const docs = await provenance.documents('MSU-1', d);
        expect(docs[0].anchoredOnChain).toBe(false);
    });

    test('documents listed in an anchored manifest count as anchored', async () => {
        const PLAN = '0x' + '33'.repeat(32);
        const MANIFEST = '0x' + '44'.repeat(32);
        const rows = [
            { docId: 'plan', parcelPin: 'MSU-1', type: 'SURVEY_PLAN', documentHash: PLAN, createdAt: new Date('2026-01-01') },
            { docId: 'manifest', parcelPin: 'MSU-1', type: 'OTHER', documentHash: MANIFEST, members: [PLAN], createdAt: new Date('2026-01-01') },
        ];
        const d = deps({
            StoredDocument: model(rows),
            ChainRequest: model([{ requestId: 9, kind: 'REGISTRATION', status: 'PENDING', documentHash: MANIFEST, submitter: A, from: A, to: A, decisions: [] }]),
        });
        const docs = await provenance.documents('MSU-1', d);
        expect(docs.find((x) => x.docId === 'plan')).toMatchObject({ anchoredOnChain: true, requestId: 9 });
        const out = await provenance.history('MSU-1', {}, d);
        const attached = out.events.filter((e) => e.eventType === 'DOCUMENT_ATTACHED');
        expect(attached.every((e) => e.status === 'verified')).toBe(true);
    });

    test('dispute filers are resolved to user names like request parties', async () => {
        const d = deps({ User: model([{ address: A, name: 'Applicant One' }, { address: B, name: 'Buyer Two' }]) });
        const out = await provenance.history('MSU-1', {}, d);
        expect(out.events.find((e) => e.eventType === 'DISPUTE_OPENED').principal).toBe('Buyer Two');
    });

    test('stored block times are used without querying the chain', async () => {
        const getBlock = jest.fn();
        const d = deps();
        d.models.ChainRequest = model([{ requestId: 5, kind: 'REGISTRATION', status: 'PENDING',
            submitter: A, from: A, to: A, submittedBlock: 10, submittedAt: new Date('2026-03-03T10:00:00Z'), decisions: [] }]);
        d.chain = { isConfigured: () => true, getProvider: () => ({ getBlock }) };
        const out = await provenance.history('MSU-1', {}, d);
        const sub = out.events.find((e) => e.eventType === 'REGISTRATION_SUBMITTED');
        expect(new Date(sub.date).toISOString()).toBe('2026-03-03T10:00:00.000Z');
        expect(getBlock).not.toHaveBeenCalled();
    });

    test('draft parcels have no history', async () => {
        const d = deps({ Parcel: model([{ pin: 'X', status: 'DRAFT' }]) });
        const out = await provenance.history('X', {}, d);
        expect(out.events).toEqual([]);
    });
});
