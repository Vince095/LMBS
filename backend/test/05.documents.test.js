/**
 * Encrypted document store: confidentiality (ciphertext differs from the
 * plaintext) and integrity (modifying one byte is detected).
 */
const fs = require('fs');
const { ethers } = require('ethers');
const store = require('../services/documentStore');

function memoryModel() {
    const rows = [];
    return {
        rows,
        create: async (d) => { rows.push(JSON.parse(JSON.stringify(d))); return d; },
        findOne: (q) => ({ lean: async () => rows.find((r) => r.docId === q.docId) || null }),
    };
}

describe('Encrypted off-chain document store', () => {
    const content = Buffer.from('DEED OF SALE\nParcel 13283-001\nSynthetic test document only.\n');

    test('stores ciphertext only and returns the on-chain document hash', async () => {
        const M = memoryModel();
        const doc = await store.put(M, content, { name: 'deed.txt', type: 'DEED_OF_SALE' });
        expect(doc.documentHash).toBe(ethers.keccak256(content));
        const onDisk = fs.readFileSync(store._fileFor(doc.docId));
        expect(onDisk.equals(content)).toBe(false);
        expect(onDisk.includes(Buffer.from('DEED OF SALE'))).toBe(false);
        const { content: back } = await store.get(M, doc.docId);
        expect(back.equals(content)).toBe(true);
    });

    test('detects a single modified byte in the encrypted file', async () => {
        const M = memoryModel();
        const doc = await store.put(M, content, { name: 'deed.txt' });
        const file = store._fileFor(doc.docId);
        const bytes = fs.readFileSync(file);
        bytes[5] ^= 0x01;
        fs.writeFileSync(file, bytes);
        await expect(store.get(M, doc.docId)).rejects.toThrow(store.IntegrityError);
        const v = await store.verify(M, doc.docId);
        expect(v.storageIntact).toBe(false);
    });

    test('detects a hash mismatch with the value anchored on-chain', async () => {
        const M = memoryModel();
        const doc = await store.put(M, content, {});
        expect((await store.verify(M, doc.docId, doc.documentHash)).matchesChain).toBe(true);
        const other = ethers.keccak256(Buffer.from('a different document'));
        expect((await store.verify(M, doc.docId, other)).matchesChain).toBe(false);
    });

    test('detects tampering with the recorded metadata hash', async () => {
        const M = memoryModel();
        const doc = await store.put(M, content, {});
        M.rows[0].sha256 = '0'.repeat(64);
        await expect(store.get(M, doc.docId)).rejects.toThrow(/does not match/);
    });

    test('rejects empty documents and path-traversal ids', async () => {
        await expect(store.put(memoryModel(), Buffer.alloc(0), {})).rejects.toThrow(/Empty/);
        expect(() => store._fileFor('../../etc/passwd')).toThrow(/Invalid document id/);
    });
});
