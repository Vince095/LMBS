/**
 * chainService: parcel-number normalisation mirrors the contract, and
 * client-reported transaction hashes are verified before anything is stored.
 */
const { ethers } = require('ethers');
const chain = require('../services/chainService');

const REGISTRY = require('./fixtures/deployment.test.json').contracts.LandRegistry;
const iface = chain.registryInterface();
const SUBMITTER = '0x00000000000000000000000000000000000000c1';

function receipt({ status = 1, submitter = SUBMITTER, kind = 0, address = REGISTRY, parcel = '13283-001', withEvent = true } = {}) {
    const key = chain.parcelKeyOf(parcel);
    const logs = [];
    if (withEvent) {
        const ev = iface.getEvent('RequestSubmitted');
        const enc = iface.encodeEventLog(ev, [7n, kind, key, BigInt(key), submitter, ethers.ZeroAddress, SUBMITTER, ethers.id('doc'), 3]);
        logs.push({ address, topics: enc.topics, data: enc.data });
    }
    return { status, hash: '0x' + 'ab'.repeat(32), blockNumber: 42, logs };
}

function mockProvider(r) {
    chain._setProvider({ getTransactionReceipt: async () => r });
}

const TX = '0x' + '11'.repeat(32);

afterEach(() => chain._setProvider(null));

describe('Parcel number normalisation (mirror of LandRegistry.normalizeParcelNumber)', () => {
    test.each([
        ['  13283 - 001 ', '13283-001'],
        ['mh/12a-7', 'MH/12A-7'],
        ['13283-001\n', '13283-001'],
    ])('%j -> %s', (input, expected) => {
        expect(chain.normalizeParcelNumber(input)).toBe(expected);
    });

    test.each(['', '   ', '13283_001', '13283.001', 'ab#1', 'x'.repeat(65), 'straße-1'])('rejects %j', (bad) => {
        expect(() => chain.normalizeParcelNumber(bad)).toThrow(/Invalid parcel number/);
    });

    test('equivalent spellings give the same parcel key', () => {
        expect(chain.parcelKeyOf(' 13283 -001')).toBe(chain.parcelKeyOf('13283-001'));
        expect(chain.parcelKeyOf('13283-001')).toBe(ethers.keccak256(ethers.toUtf8Bytes('13283-001')));
    });
});

describe('verifySubmission', () => {
    test('accepts a mined RequestSubmitted from the expected wallet', async () => {
        mockProvider(receipt());
        const out = await chain.verifySubmission(TX, { expectedSubmitter: SUBMITTER, expectedKind: 'REGISTRATION', expectedParcelKey: chain.parcelKeyOf('13283-001') });
        expect(out).toMatchObject({ requestId: 7, kind: 'REGISTRATION', submitter: SUBMITTER, blockNumber: 42 });
    });

    test('rejects a request submitted by a different wallet', async () => {
        mockProvider(receipt({ submitter: '0x00000000000000000000000000000000000000d2' }));
        await expect(chain.verifySubmission(TX, { expectedSubmitter: SUBMITTER })).rejects.toMatchObject({ status: 403 });
    });

    test('rejects a reverted transaction', async () => {
        mockProvider(receipt({ status: 0 }));
        await expect(chain.verifySubmission(TX, {})).rejects.toMatchObject({ status: 422 });
    });

    test('rejects a transaction without a LandRegistry request (e.g. from another contract)', async () => {
        mockProvider(receipt({ address: '0x00000000000000000000000000000000000000bb' }));
        await expect(chain.verifySubmission(TX, {})).rejects.toThrow(/did not submit/);
        mockProvider(receipt({ withEvent: false }));
        await expect(chain.verifySubmission(TX, {})).rejects.toThrow(/did not submit/);
    });

    test('rejects the wrong kind or a different parcel', async () => {
        mockProvider(receipt({ kind: 1 }));
        await expect(chain.verifySubmission(TX, { expectedKind: 'REGISTRATION' })).rejects.toThrow(/Expected a REGISTRATION/);
        mockProvider(receipt());
        await expect(chain.verifySubmission(TX, { expectedParcelKey: chain.parcelKeyOf('99999-999') })).rejects.toThrow(/does not match/);
    });

    test('rejects malformed hashes and unmined transactions', async () => {
        await expect(chain.verifySubmission('0x1234', {})).rejects.toMatchObject({ status: 400 });
        mockProvider(null);
        await expect(chain.verifySubmission(TX, {})).rejects.toMatchObject({ status: 409 });
    });
});
