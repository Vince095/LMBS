/**
 * Notification service — SAD §6.4 (stubbed).
 *
 * Persists a notification document and dispatches it via the configured
 * provider. Email (SendGrid) and SMS (Africa's Talking) providers are
 * implemented as stubs that simply mark the message SENT; swap them for the
 * real adapters when those credentials are available.
 *
 * FR-NA-003 SLA: messages are dispatched immediately on the request loop,
 * which keeps in-app and email well under 5 minutes; SMS will need a queue
 * in production.
 */

const { Notification } = require('../models');
const env = require('../config/env');

async function sendInApp({ userId, address, subject, body, language, relatedEntity }) {
    return Notification.create({
        userId, address: address?.toLowerCase(), channel: 'IN_APP',
        subject, body, language, relatedEntity,
        status: 'SENT', sentAt: new Date(),
    });
}

async function sendEmail({ userId, address, subject, body, language, relatedEntity }) {
    const doc = await Notification.create({
        userId, address: address?.toLowerCase(), channel: 'EMAIL',
        subject, body, language, relatedEntity,
        status: 'QUEUED',
    });
    if (env.emailProvider === 'stub') {
        doc.status = 'SENT';
        doc.sentAt = new Date();
        await doc.save();
    }
    // TODO: real SendGrid integration goes here.
    return doc;
}

async function sendSms({ userId, address, body, language, relatedEntity }) {
    const doc = await Notification.create({
        userId, address: address?.toLowerCase(), channel: 'SMS',
        body, language, relatedEntity,
        status: 'QUEUED',
    });
    if (env.smsProvider === 'stub') {
        doc.status = 'SENT';
        doc.sentAt = new Date();
        await doc.save();
    }
    // TODO: real Africa's Talking integration goes here.
    return doc;
}

async function notifyAll(payload) {
    return Promise.all([
        sendInApp(payload),
        payload.email ? sendEmail(payload) : null,
        payload.sms ? sendSms(payload) : null,
    ].filter(Boolean));
}

async function listForUser({ address, since, limit = 50 }) {
    const q = { address: address.toLowerCase() };
    if (since) q.createdAt = { $gte: new Date(since) };
    return Notification.find(q).sort({ createdAt: -1 }).limit(limit);
}

async function markRead(id) {
    return Notification.findByIdAndUpdate(id, {
        $set: { status: 'READ', readAt: new Date() },
    }, { new: true });
}

module.exports = {
    sendInApp,
    sendEmail,
    sendSms,
    notifyAll,
    listForUser,
    markRead,
};
