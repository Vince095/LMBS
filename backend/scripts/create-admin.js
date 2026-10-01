/**
 * Creates the first ADMIN account directly in MongoDB (self-registration can
 * only create CITIZEN accounts, so the first administrator is bootstrapped here).
 *
 *   npm run create-admin -- --email admin@laa.test --password "a long passphrase"
 *   (or set ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME)
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const env = require('../config/env');
const { User } = require('../models');
const { arg } = require('./args');

async function main() {
    const email = (arg('email', 'ADMIN_EMAIL') || '').toLowerCase();
    const password = arg('password', 'ADMIN_PASSWORD') || '';
    if (!email || password.length < 12) {
        console.error('Usage: npm run create-admin -- --email admin@laa.test --password "at least 12 characters"');
        process.exit(1);
    }
    await mongoose.connect(env.mongoUri, { dbName: env.mongoDbName });
    const existing = await User.findOne({ email });
    if (existing) {
        existing.role = 'ADMIN';
        await existing.save();
        console.log(`Existing user ${email} promoted to ADMIN.`);
    } else {
        await User.create({
            name: arg('name', 'ADMIN_NAME') || 'System Administrator',
            email,
            role: 'ADMIN',
            passwordHash: await bcrypt.hash(password, 12),
            passwordChangedAt: new Date(),
        });
        console.log(`ADMIN ${email} created.`);
    }
    await mongoose.disconnect();
}

main().catch((e) => {
    if (e.name === 'MongooseServerSelectionError') {
        console.error(`Cannot reach MongoDB at ${env.mongoUri}. Is the MongoDB service running?`);
    } else {
        console.error(e.message || e);
    }
    process.exit(1);
});
