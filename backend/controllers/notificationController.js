/**
 * Notification controller — in-app notification centre (FR-NA-002).
 */

const notify = require('../services/notificationService');
const { HttpError } = require('../middleware/error');

async function listForUser(req, res, next) {
    try {
        const { address } = req.params;
        if (!address) throw new HttpError(400, 'address is required');
        res.json(await notify.listForUser({ address, since: req.query.since, limit: Number(req.query.limit) || 50 }));
    } catch (err) { next(err); }
}

async function markRead(req, res, next) {
    try {
        const updated = await notify.markRead(req.params.id);
        if (!updated) throw new HttpError(404, 'Notification not found');
        res.json(updated);
    } catch (err) { next(err); }
}

async function send(req, res, next) {
    try {
        const { channel, address, subject, body, language, relatedEntity } = req.body;
        if (!channel || !address || !body) throw new HttpError(400, 'channel, address, body are required');
        let doc;
        switch (channel) {
            case 'EMAIL': doc = await notify.sendEmail({ address, subject, body, language, relatedEntity }); break;
            case 'SMS':   doc = await notify.sendSms({ address, body, language, relatedEntity }); break;
            default:      doc = await notify.sendInApp({ address, subject, body, language, relatedEntity });
        }
        res.status(201).json(doc);
    } catch (err) { next(err); }
}

module.exports = { listForUser, markRead, send };
