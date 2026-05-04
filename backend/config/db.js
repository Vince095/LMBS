/**
 * MongoDB connection module — SAD §5.2 (Replica Set / Ops Manager).
 *
 * Single source of truth for the LMBS database connection. Connects via the
 * native driver (used by existing `getCollections()` callers) and via Mongoose
 * (used by new model layer). Both share the same underlying connection pool.
 *
 * Environment:
 *   MONGODB_URI      Connection string (default: local replica set)
 *   MONGODB_DB_NAME  Database name (default: lmbs_db per SAD §5.3)
 */

const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

const DB_NAME = process.env.MONGODB_DB_NAME || 'lmbs_db';
const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/' + DB_NAME;

// Legacy collection names retained for backwards compatibility with the
// existing route handlers that read/write the pre-refactor collections.
const LEGACY_COLLECTION_NAMES = [
    'lmsusers',
    'lmssignatures',
    'lmstitles',
    'lms_trancs',
];

const client = new MongoClient(URI, {
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 10000,
});

let nativeDb = null;
let collections = {};
let mongooseConnected = false;

async function connectDB() {
    if (nativeDb && client.topology && client.topology.isConnected()) {
        return { db: nativeDb, collections };
    }

    await client.connect();
    nativeDb = client.db(DB_NAME);

    LEGACY_COLLECTION_NAMES.forEach((name) => {
        collections[name] = nativeDb.collection(name);
    });

    await nativeDb.command({ ping: 1 });

    if (!mongooseConnected) {
        await mongoose.connect(URI, {
            dbName: DB_NAME,
            // Mongoose 8 ignores most of the legacy options.
        });
        mongooseConnected = true;
    }

    /* eslint-disable no-console */
    console.log(`[db] connected: ${DB_NAME}`);
    console.log(`[db] legacy collections: ${LEGACY_COLLECTION_NAMES.join(', ')}`);
    /* eslint-enable no-console */

    return { db: nativeDb, collections };
}

async function closeDB() {
    if (mongooseConnected) {
        await mongoose.disconnect();
        mongooseConnected = false;
    }
    if (client) {
        await client.close();
        nativeDb = null;
        collections = {};
    }
}

module.exports = {
    connectDB,
    closeDB,
    getDb: () => nativeDb,
    getCollections: () => collections,
    client,
    DB_NAME,
};
