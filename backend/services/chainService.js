/**
 * Blockchain adapter.
 *
 * Translates REST calls into chain reads/writes. Wraps ethers v6 in a thin
 * facade that other services can call without knowing about provider/signer
 * plumbing.
 *
 * (SEC-008: Basotho owners control their own keys). The chain service is
 * therefore READ-ONLY by default; signing is delegated to the wallet on the
 * frontend. The `getSigner()` helper exists for back-end-only operations
 * (e.g. signature anchoring) and reads ADMIN_PRIVATE_KEY from env when set.
 */

const env = require('../config/env');

let ethers;
try { ethers = require('ethers'); } catch { ethers = null; }

let provider = null;
let adminSigner = null;

function getProvider() {
    if (!ethers) throw new Error('ethers not installed in backend');
    if (!provider) {
        provider = new ethers.JsonRpcProvider(env.rpcUrl, {
            chainId: env.chainId,
            name: 'lmbs-besu',
        });
    }
    return provider;
}

function getSigner() {
    if (adminSigner) return adminSigner;
    const pk = process.env.ADMIN_PRIVATE_KEY;
    if (!pk) return null;
    if (!ethers) throw new Error('ethers not installed in backend');
    adminSigner = new ethers.Wallet(pk, getProvider());
    return adminSigner;
}

function loadContract(address, abi, signerOrProvider) {
    if (!ethers) throw new Error('ethers not installed in backend');
    return new ethers.Contract(address, abi, signerOrProvider || getProvider());
}

module.exports = {
    getProvider,
    getSigner,
    loadContract,
};
