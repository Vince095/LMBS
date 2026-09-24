/**
 * Hardhat configuration — LMBS permissioned land registry.
 *
 * Networks
 *   hardhat   in-process test chain (unit tests)
 *   localhost `npx hardhat node`
 *   besu      the 4-validator Hyperledger Besu QBFT network in ../network
 *
 * Accounts for the Besu network are read from network/generated/accounts.json,
 * which network/scripts/setup.sh creates on the developer's machine. That file
 * holds SYNTHETIC development keys only and is git-ignored. Nothing secret is
 * committed to this repository.
 */

require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { subtask } = require('hardhat/config');
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require('hardhat/builtin-tasks/task-names');

const SOLC_VERSION = '0.8.28';

// Offline compiler support: if the machine cannot download solc from
// binaries.soliditylang.org, set HARDHAT_LOCAL_SOLC=1 to use the solcjs build
// bundled in node_modules/solc (same version, slower but identical output).
if (process.env.HARDHAT_LOCAL_SOLC === '1') {
    subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, _hre, runSuper) => {
        if (args.solcVersion === SOLC_VERSION) {
            const compilerPath = require.resolve('solc/soljson.js');
            return { compilerPath, isSolcJs: true, version: args.solcVersion, longVersion: require('solc').version() };
        }
        return runSuper();
    });
}

function besuAccounts() {
    const file = path.join(__dirname, '..', 'network', 'generated', 'accounts.json');
    if (!fs.existsSync(file)) return [];
    const accounts = JSON.parse(fs.readFileSync(file, 'utf8'));
    return accounts.map((a) => a.privateKey);
}

module.exports = {
    solidity: {
        version: SOLC_VERSION,
        settings: {
            optimizer: { enabled: true, runs: 200 },
            // OpenZeppelin 5.x uses MCOPY, so the Besu genesis enables the
            // Cancun milestone from block 0 (see network/config/qbftConfigFile.json).
            evmVersion: 'cancun',
        },
    },
    networks: {
        hardhat: { chainId: 31337 },
        localhost: { url: 'http://127.0.0.1:8545' },
        besu: {
            url: process.env.BESU_RPC_URL || 'http://127.0.0.1:8545',
            chainId: Number(process.env.BESU_CHAIN_ID || 2026),
            accounts: besuAccounts(),
            gasPrice: 0,
        },
    },
    mocha: { timeout: 120000 },
    gasReporter: { enabled: process.env.REPORT_GAS === '1' },
};
