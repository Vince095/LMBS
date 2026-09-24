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
    ['post', '/api/parcels/13283-001/documents', 'REGISTRY_OFFICER, SURVEYOR, NOTARY'],
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
