/** Last block processed by the chain indexer (one document per contract). */
const { Schema, model } = require('mongoose');

module.exports = model('ChainCursor', new Schema({
    _id: String,              // e.g. "LandRegistry:0xabc..."
    lastBlock: { type: Number, default: -1 },
}, { collection: 'chain_cursors' }));
