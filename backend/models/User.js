/**
 * users collection - SAD section 5.3.
 *
 * Profile linked to LNID and HLF / EVM identity. Sensitive PII fields use
 * MongoDB CSFLE in production. The passwordHash field stores a bcrypt
 * digest; the raw password never touches Mongo or the JWT payload.
 */

const { Schema, model } = require('mongoose');

const ROLES = [
    'CITIZEN',           // Mosotho land owner
    'REGISTRY_OFFICER',  // LAA / Deeds Registry
    'SURVEYOR',          // Licensed surveyor
    'NOTARY',            // Notary / attorney
    'FINANCIAL_INST',    // Bank registering encumbrances
    'AUDITOR',           // Auditor General read-only
    'ADMIN',             // System administrator
];

const userSchema = new Schema({
    address: { type: String, required: true, unique: true, lowercase: true, index: true },
    lnid: { type: String, index: true, sparse: true },
    role: { type: String, enum: ROLES, default: 'CITIZEN' },
    fabricCertSerialNo: { type: String, sparse: true, index: true },

    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true, sparse: true },
    phone: { type: String, trim: true },
    physicalAddress: { type: String, trim: true },
    dateOfBirth: { type: Number },

    district: { type: String, trim: true },
    preferredLanguage: { type: String, enum: ['ses', 'en'], default: 'ses' },

    profileHash: { type: String },

    // Auth
    passwordHash: { type: String, select: false }, // bcrypt; not serialised by default
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },

    isActive: { type: Boolean, default: true },
    mfaEnabled: { type: Boolean, default: false },
}, {
    timestamps: true,
    collection: 'users',
});

// Hide secrets from any JSON serialisation by default.
userSchema.set('toJSON', {
    transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.failedLoginAttempts;
        delete ret.lockedUntil;
        return ret;
    },
});
userSchema.set('toObject', {
    transform(_doc, ret) {
        delete ret.passwordHash;
        return ret;
    },
});

userSchema.methods.toAuthJSON = function toAuthJSON() {
    const o = this.toObject();
    return {
        id: o._id,
        address: o.address,
        email: o.email,
        name: o.name,
        role: o.role,
        district: o.district,
        preferredLanguage: o.preferredLanguage,
        lnid: o.lnid,
        isActive: o.isActive,
        mfaEnabled: o.mfaEnabled,
    };
};

userSchema.statics.ROLES = ROLES;

module.exports = model('User', userSchema);
module.exports.ROLES = ROLES;
