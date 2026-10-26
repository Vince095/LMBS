const request = require('supertest');
const app = require('../server');
const { bearer } = require('./helpers');

const CITIZEN = { role: 'CITIZEN', address: '0x00000000000000000000000000000000000000c1' };

// [method, path, roles that may pass the guard]
const RESTRICTED = [
    ['get', '/api/profiles/list', 'REGISTRY_OFFICER, AUDITOR'],
    ['get', '/api/profiles/0x00000000000000000000000000000000000000ff', 'self, REGISTRY_OFFICER, NOTARY, AUDITOR'],
    ['post', '/api/notifications', 'REGISTRY_OFFICER'],
    ['get', '/api/notifications/by-address/0x00000000000000000000000000000000000000ff', 'self, REGISTRY_OFFICER, AUDITOR'],
    ['post', '/api/titles/import', 'REGISTRY_OFFICER'],
    ['post', '/api/titles/DEED-1/revoke', 'REGISTRY_OFFICER'],
    ['patch', '/api/titles/DEED-1', 'REGISTRY_OFFICER'],
    ['get', '/api/transfers/pending', 'REGISTRY_OFFICER, NOTARY, AUDITOR'],
    ['get', '/api/audit', 'AUDITOR'],
    ['get', '/api/admin/stats', 'ADMIN'],
    ['get', '/api/admin/users', 'ADMIN'],
    ['put', '/api/admin/users/64b000000000000000000001', 'ADMIN'],
    ['get', '/api/search/advanced', 'REGISTRY_OFFICER, AUDITOR, NOTARY, SURVEYOR'],
    ['post', '/api/encumbrances', 'FINANCIAL_INST, REGISTRY_OFFICER'],
    ['post', '/api/disputes/DSP-1/resolve', 'REGISTRY_OFFICER'],
    ['get', '/api/chain/identity-anchor/64b000000000000000000001', 'REGISTRY_OFFICER'],
    ['post', '/api/chain/sync', 'ADMIN'],
];

describe('RBAC is enforced (no permissive mode)', () => {
    test.each(RESTRICTED)('CITIZEN %s %s -> 403 (allowed: %s)', async (method, path) => {
        const res = await request(app)[method](path).set(bearer(CITIZEN)).send({});
        expect(res.status).toBe(403);
    });

    test('an AUDITOR cannot use the admin or officer write endpoints', async () => {
        const auditor = bearer({ role: 'AUDITOR' });
        for (const [m, p] of [['get', '/api/admin/users'], ['post', '/api/titles/import'], ['post', '/api/notifications']]) {
            expect((await request(app)[m](p).set(auditor).send({})).status).toBe(403);
        }
    });
});

describe('Documents enter only through the encrypted store', () => {
    test('the old metadata-only upload route (IPFS placeholder) is gone', async () => {
        const res = await request(app).post('/api/parcels/13283-001/documents').set(bearer({ role: 'REGISTRY_OFFICER' })).send({ name: 'x.pdf' });
        expect(res.status).toBe(404);
    });
});

describe('Attaching a document to a parcel record', () => {
    const models = require('../models');
    const { mayAttach } = require('../controllers/documentController');
    const HOLDER = '0x00000000000000000000000000000000000000a1';
    const lean = (v) => ({ select() { return this; }, sort() { return this; }, lean: async () => v });

    afterEach(() => jest.restoreAllMocks());
    function titled(status = 'ACTIVE') {
        jest.spyOn(models.Parcel, 'findOne').mockReturnValue(lean({ pin: 'MSU-1', status, parcelKey: '0xkey' }));
        jest.spyOn(models.ChainRequest, 'findOne').mockReturnValue(lean({ requestId: 4, status: 'EXECUTED', to: HOLDER }));
    }

    test('a citizen cannot attach to a parcel whose title someone else holds', async () => {
        titled();
        const res = await request(app).post('/api/documents').set(bearer(CITIZEN))
            .send({ contentBase64: Buffer.from('fake deed').toString('base64'), name: 'deed.pdf', type: 'TITLE_DEED', parcelPin: 'MSU-1' });
        expect(res.status).toBe(403);
    });

    test('officers may attach to any parcel; the holder may attach to their own title', async () => {
        titled();
        for (const role of ['REGISTRY_OFFICER', 'SURVEYOR', 'NOTARY']) expect(await mayAttach({ role }, 'MSU-1')).toBe(true);
        expect(await mayAttach({ role: 'CITIZEN', address: HOLDER }, 'MSU-1')).toBe(true);
        expect(await mayAttach({ role: 'CITIZEN', address: CITIZEN.address }, 'MSU-1')).toBe(false);
        expect(await mayAttach({ role: 'CITIZEN' }, 'MSU-1')).toBe(false);
    });

    test('an applicant may attach to a parcel with no issued title (their own registration)', async () => {
        jest.spyOn(models.Parcel, 'findOne').mockReturnValue(lean(null));
        expect(await mayAttach({ role: 'CITIZEN', address: CITIZEN.address }, 'NEW-1')).toBe(true);
        titled('DRAFT');
        expect(await mayAttach({ role: 'CITIZEN', address: CITIZEN.address }, 'MSU-1')).toBe(true);
    });
});

describe('On-chain actions require a verified wallet', () => {
    test.each([
        ['post', '/api/titles'],
        ['post', '/api/transfers'],
    ])('%s %s -> 403 when the account has no verified wallet', async (method, path) => {
        const res = await request(app)[method](path).set(bearer({ role: 'REGISTRY_OFFICER' })).send({});
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/verified wallet/i);
    });

    test('an unverified address claim inside the token is ignored', async () => {
        const res = await request(app).post('/api/transfers')
            .set(bearer({ role: 'CITIZEN', address: '0x00000000000000000000000000000000000000c1', walletVerified: false }))
            .send({});
        expect(res.status).toBe(403);
    });

    test('a verified wallet must still supply the on-chain transaction hash', async () => {
        const res = await request(app).post('/api/transfers').set(bearer(CITIZEN)).send({ considerationLSL: 1 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/chainTxHash/);
    });
});
