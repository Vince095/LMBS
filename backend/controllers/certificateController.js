const certificateService = require('../services/certificateService');
const { HttpError } = require('../middleware/error');

async function get(req, res, next) {
    try {
        const cert = await certificateService.getCertificate(req.params.id);
        if (!cert) throw new HttpError(404, 'Certificate not found');
        res.json(cert);
    } catch (err) { next(err); }
}

module.exports = { get };
