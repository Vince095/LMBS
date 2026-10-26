/**
 * /api/chain — read-only chain information for the frontend and dashboards.
 */

const { ethers } = require('ethers');
const env = require('../config/env');
const chain = require('../services/chainService');
const indexer = require('../services/indexerService');
const models = require('../models');
const { HttpError } = require('../middleware/error');

async function config(_req, res, next) {
    try {
        const cfg = chain.publicConfig();
        if (cfg.configured) {
            try {
                const registry = chain.contract('LandRegistry');
                cfg.approvalThreshold = Number(await registry.approvalThreshold());
                cfg.rejectionThreshold = Number(await registry.rejectionThreshold());
                cfg.reachable = true;
            } catch (_) { cfg.reachable = false; }
        }
        res.json(cfg);
    } catch (err) { next(err); }
}

async function listRequests(req, res, next) {
    try {
        const filter = {};
        if (req.query.status) filter.status = String(req.query.status).toUpperCase();
        if (req.query.kind) filter.kind = String(req.query.kind).toUpperCase();
        if (req.query.parcelNumber) filter.parcelNumber = chain.normalizeParcelNumber(req.query.parcelNumber);
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        res.json(await models.ChainRequest.find(filter).sort({ requestId: -1 }).limit(limit).lean());
    } catch (err) { next(err); }
}

async function getRequest(req, res, next) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid request id');
        const indexed = await models.ChainRequest.findOne({ requestId: id }).lean();
        let live = null;
        try { live = await chain.readRequest(id); } catch (_) { /* chain offline or unknown id */ }
        if (!indexed && !live) throw new HttpError(404, 'Request not found');
        res.json({ indexed, live });
    } catch (err) { next(err); }
}

/**
 * Pseudonymous identity anchor for IdentityRegistry.register().
 * Only hashes leave the backend; the salt keeps them from being reversed.
 */
async function identityAnchor(req, res, next) {
    try {
        const user = await models.User.findById(req.params.userId).lean();
        if (!user) throw new HttpError(404, 'User not found');
        if (!user.walletVerified || !user.address) throw new HttpError(409, 'User has not linked a verified wallet yet');
        const salt = env.pseudonymSalt;
        const subjectId = ethers.keccak256(ethers.toUtf8Bytes(`${salt}|lmbs:user|${user._id}`));
        const credential = {
            name: user.name || '', email: user.email || '', lnid: user.lnid || '',
            district: user.district || '', dateOfBirth: user.dateOfBirth || '',
        };
        const credentialHash = ethers.keccak256(ethers.toUtf8Bytes(`${salt}|${JSON.stringify(credential)}`));
        res.json({
            account: user.address,
            subjectId,
            credentialHash,
            issuerRef: ethers.keccak256(ethers.toUtf8Bytes('issuer:LAA-KYC-desk')),
            note: 'Only these hashes go on-chain. Personal data stays in the off-chain database.',
        });
    } catch (err) { next(err); }
}

async function sync(_req, res, next) {
    try {
        res.json(await indexer.syncOnce(models));
    } catch (err) { next(err); }
}

module.exports = { config, listRequests, getRequest, identityAnchor, sync };
