/**
 * notifications collection — SAD §5.3.
 *
 * Implements FR-NA-001 (channels: email, SMS, in-app), FR-NA-002 (12-month
 * history), FR-NA-003 (5-min SLA), FR-NA-004 (per-user channel preferences).
 */

const { Schema, model } = require('mongoose');

const CHANNELS = ['EMAIL', 'SMS', 'IN_APP'];
const STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ'];

const notificationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    address: { type: String, lowercase: true, index: true },

    channel: { type: String, enum: CHANNELS, required: true },
    templateId: String,
    subject: String,
    body: { type: String, required: true },
    language: { type: String, enum: ['ses', 'en'], default: 'ses' },

    status: { type: String, enum: STATUSES, default: 'QUEUED', index: true },
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    failureReason: String,

    relatedEntity: {
        type: { type: String }, // 'parcel' | 'transfer' | 'dispute' | 'encumbrance'
        id: String,
    },
}, {
    timestamps: true,
    collection: 'notifications',
});

notificationSchema.statics.CHANNELS = CHANNELS;
notificationSchema.statics.STATUSES = STATUSES;

module.exports = model('Notification', notificationSchema);
module.exports.CHANNELS = CHANNELS;
module.exports.STATUSES = STATUSES;
