const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { bearer } = require('./helpers');

// Every protected endpoint, one representative per route group and method.
const PROTECTED = [
    ['get', '/api/chain/config'],
    ['get', '/api/chain/requests'],
    ['get', '/api/profiles/me'],
    ['put', '/api/profiles/me'],
    ['get', '/api/profiles/list'],
    ['get', '/api/profiles/0x0000000000000000000000000000000000000001'],
    ['post', '/api/titles'],
    ['post', '/api/titles/draft'],
    ['get', '/api/titles/13283-001'],
    ['post', '/api/titles/import'],
    ['patch', '/api/titles/DEED-1'],
    ['post', '/api/titles/DEED-1/revoke'],
    ['get', '/api/transfers'],
    ['post', '/api/transfers'],
    ['post', '/api/transfers/abc/advance'],
    ['get', '/api/disputes'],
    ['post', '/api/disputes'],
    ['get', '/api/encumbrances'],
    ['post', '/api/encumbrances'],
    ['get', '/api/search/public'],
    ['get', '/api/search/advanced'],
    ['get', '/api/notifications/by-address/0x01'],
    ['post', '/api/notifications'],
    ['get', '/api/audit'],
    ['get', '/api/admin/users'],
    ['get', '/api/dashboard/stats'],
    ['get', '/api/parcels'],
    ['post', '/api/parcels/13283-001/documents'],
    ['get', '/api/certificates/1'],
    ['get', '/api/network/status'],
    ['post', '/api/documents'],
    ['get', '/api/documents/0123456789abcdef0123456789abcdef'],
    ['get', '/api/auth/me'],
    ['post', '/api/auth/wallet/challenge'],
    ['post', '/api/auth/change-password'],
];

describe('Protected routes reject anonymous users', () => {
    test.each(PROTECTED)('%s %s -> 401 without a token', async (method, path) => {
        const res = await request(app)[method](path).send({});
        expect(res.status).toBe(401);
    });

    test('health check is public', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('requireAuth');
    });

    test.each([
        ['wrong signing secret', { Authorization: `Bearer ${jwt.sign({ sub: 'x', role: 'ADMIN' }, 'not-the-server-secret')}` }],
        ['expired token', bearer({ role: 'ADMIN' }, { expiresIn: -10 })],
        ['unsigned (alg=none) token', { Authorization: `Bearer ${jwt.sign({ sub: 'x', role: 'ADMIN' }, null, { algorithm: 'none' })}` }],
        ['malformed header', { Authorization: 'Token abc' }],
    ])('rejects %s', async (_label, headers) => {
        const res = await request(app).get('/api/admin/users').set(headers);
        expect(res.status).toBe(401);
    });
});

describe('Removed insecure endpoints', () => {
    test.each([
        ['post', '/api/signatures/store'],
        ['get', '/api/signatures/abc'],
        ['post', '/api/transacs/log'],
        ['post', '/api/profiles/store'],
    ])('%s %s no longer exists (401 anonymous, 404 authenticated)', async (method, path) => {
        expect((await request(app)[method](path).send({})).status).toBe(401);
        const res = await request(app)[method](path).set(bearer({ role: 'ADMIN' })).send({});
        expect(res.status).toBe(404);
    });

    test('the retired off-chain approval step machine answers 410 Gone', async () => {
        for (const p of ['/api/transfers/abc/advance', '/api/transfers/abc/cancel']) {
            const res = await request(app).post(p).set(bearer({ role: 'REGISTRY_OFFICER' })).send({});
            expect(res.status).toBe(410);
        }
    });
});
