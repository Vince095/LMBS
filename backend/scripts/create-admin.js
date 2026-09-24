/**
 * Creates the first ADMIN account directly in MongoDB (self-registration can
 * only create CITIZEN accounts, so the first administrator is bootstrapped here).
 *
 *   ADMIN_EMAIL=admin@laa.test ADMIN_PASSWORD='a long passphrase' node scripts/create-admin.js
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const env = require('../config/env');
const { User } = require('../models');

async function main() {
    const email = (process.env.ADMIN_EMAIL || '').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    if (!email || password.length < 12) {
        console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).');
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
            name: process.env.ADMIN_NAME || 'System Administrator',
            email,
            role: 'ADMIN',
            passwordHash: await bcrypt.hash(password, 12),
            passwordChangedAt: new Date(),
        });
        console.log(`ADMIN ${email} created.`);
    }
    await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
