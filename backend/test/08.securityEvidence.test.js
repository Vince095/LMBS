/**
 * Static security evidence (supervisor item 9.5): the repository contains no
 * seed-phrase / mnemonic handling, no validator-key collection in the UI and
 * no fabricated transaction hashes.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['backend', 'src'];
const SKIP = new Set(['node_modules', 'test', 'build', 'coverage', 'storage', 'generated']);

function files(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) files(p, out);
        else if (/\.(js|jsx|json)$/.test(e.name) && !/package-lock\.json$/.test(e.name)) out.push(p);
    }
    return out;
}

const ALL = SCAN_DIRS.flatMap((d) => files(path.join(ROOT, d))).filter((f) => !/\.test\.js$/.test(f));
const read = (f) => fs.readFileSync(f, 'utf8');
// Code only: comments that document the removal ("never handles mnemonics") are ignored.
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const rel = (f) => path.relative(ROOT, f);

describe('Security evidence (static scan of backend/ and src/)', () => {
    test('scans a meaningful number of files', () => {
        expect(ALL.length).toBeGreaterThan(40);
    });

    test('no mnemonic / seed-phrase handling anywhere', () => {
        const hits = ALL.filter((f) => /mnemonic|seedPhrase|fromPhrase|HDNodeWallet/i.test(code(f))).map(rel);
        expect(hits).toEqual([]);
    });

    test('no code stores signatures or keys in browser storage', () => {
        const hits = ALL.filter((f) => /localStorage\.setItem\([^)]*(signature|mnemonic|privateKey|private_key|seed)/i.test(read(f))).map(rel);
        expect(hits).toEqual([]);
    });

    test('no fabricated (random) transaction hashes', () => {
        const hits = ALL.filter((f) => /randomBytes\(32\)\.toString\('hex'\)/.test(read(f)) && !/generate-env|documentStore/.test(f)).map(rel);
        expect(hits).toEqual([]);
    });

    test('no hard-coded private keys or connection-string credentials', () => {
        const hits = ALL.filter((f) => {
            const t = read(f);
            return /PRIVATE_KEY\s*[=:]\s*['"]?0x[0-9a-fA-F]{64}/.test(t) || /mongodb(\+srv)?:\/\/[^<\s'"]+:[^<\s'"]+@/.test(t);
        }).map(rel);
        expect(hits).toEqual([]);
    });

    test('the signature-storage backend is gone', () => {
        for (const f of ['backend/routes/signatures.js', 'backend/controllers/signatureController.js', 'backend/models/Signature.js', 'src/utils/signatureStorage.js', 'src/utils/qbftConsensus.js']) {
            expect(fs.existsSync(path.join(ROOT, f))).toBe(false);
        }
    });
});
