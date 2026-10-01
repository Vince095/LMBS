/**
 * Tiny command-line helper so scripts work the same in PowerShell, cmd,
 * bash and zsh:   node scripts/x.js --email a@b.c --password "..."
 * Each option can also come from an environment variable.
 */
function arg(name, envName) {
    const i = process.argv.indexOf(`--${name}`);
    if (i !== -1 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
    return envName ? process.env[envName] : undefined;
}

module.exports = { arg };
