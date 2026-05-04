/**
 * Atomic counter helper for ID generation.
 *
 * Uses a `counters` collection with one document per counter name, and
 * findOneAndUpdate({ $inc }) to issue monotonically increasing sequence
 * numbers. Safe under concurrent writes.
 */

const { getDb } = require('../config/db');

async function nextSequence(name) {
    const db = getDb();
    if (!db) throw new Error('Database not connected');

    const result = await db.collection('counters').findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
    );

    return (result && result.value ? result.value.seq : result?.seq) || 1;
}

module.exports = { nextSequence };
