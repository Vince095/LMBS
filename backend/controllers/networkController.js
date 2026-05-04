const networkService = require('../services/networkService');
const { HttpError } = require('../middleware/error');

async function status(_req, res, next) {
    try {
        res.json(await networkService.status());
    } catch (err) { next(err); }
}

async function getTransaction(req, res, next) {
    try {
        const { txHash } = req.params;
        if (!txHash || txHash.length < 10) throw new HttpError(400, 'Invalid txHash');
        const tx = await networkService.getTransaction(txHash);
        if (!tx) throw new HttpError(404, `Transaction ${txHash} not found`);
        res.json(tx);
    } catch (err) { next(err); }
}

module.exports = { status, getTransaction };
