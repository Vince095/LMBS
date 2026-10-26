#!/usr/bin/env node
/**
 * Builds the clean source archive for submission (supervisor item 9.1).
 * Uses `git archive`, so ONLY committed files are included: no node_modules,
 * .env files, keys (network/generated), deployments, logs, databases or builds.
 *
 *   npm run archive            -> lmbs-source-<commit>.zip in the repository root
 */
const { execFileSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

if (git('status', '--porcelain', '--untracked-files=no')) {
    console.error('Commit your changes first: the archive is built from the last commit (HEAD).');
    process.exit(1);
}
const out = process.argv[2] || `lmbs-source-${git('rev-parse', '--short', 'HEAD')}.zip`;
const files = git('ls-files').split(/\r?\n/);
const suspicious = files.filter((f) => /(^|\/)\.env$|accounts\.json$|(^|\/)key$|node_modules\/|\.log$/.test(f));
if (suspicious.length) {
    console.error(`Refusing to archive: these committed files look sensitive:\n  ${suspicious.join('\n  ')}`);
    process.exit(1);
}
git('archive', '--format=zip', '-o', out, 'HEAD');
console.log(`Wrote ${out} (${files.length} files)`);
