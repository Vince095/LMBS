/**
 * Barrel re-export for all Mongoose models.
 *
 * `const { Parcel, Dispute } = require('../models');`
 */

module.exports = {
    User: require('./User'),
    Parcel: require('./Parcel'),
    TitleDeed: require('./TitleDeed'),
    Transfer: require('./Transfer'),
    Dispute: require('./Dispute'),
    Encumbrance: require('./Encumbrance'),
    Notification: require('./Notification'),
    AuditLog: require('./AuditLog'),
    ChainRequest: require('./ChainRequest'),
    ChainCursor: require('./ChainCursor'),
    StoredDocument: require('./StoredDocument'),
};
