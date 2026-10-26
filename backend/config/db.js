/**
 * MongoDB connection (off-chain data and chain read models).
 *
 * One Mongoose connection is used by the whole backend. `getDb()` exposes the
 * underlying driver database for the few helpers that need raw collections
 * (e.g. utils/counters.js).
 *
 * Environment (see config/env.js): MONGODB_URI, MONGODB_DB_NAME
 */

const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
    if (mongoose.connection.readyState === 1) return mongoose.connection;
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName, serverSelectionTimeoutMS: 10000 });
    console.log(`[db] connected: ${env.mongoDbName}`);
    return mongoose.connection;
}

async function closeDB() {
    await mongoose.disconnect();
}

module.exports = {
    connectDB,
    closeDB,
    getDb: () => (mongoose.connection.readyState === 1 ? mongoose.connection.db : null),
};
