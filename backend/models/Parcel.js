/**
 * parcels collection - SAD section 5.3.
 *
 * Off-chain projection of a registered land parcel. The on-chain record
 * (LandTitle contract) is the source of truth; this document is rebuilt by
 * the Blockchain Event Listener (SAD section 5.5) and indexed for queries.
 */

const { Schema, model } = require('mongoose');

const LESOTHO_DISTRICTS = [
    'Maseru', 'Berea', 'Leribe', 'Botha-Bothe', 'Mafeteng',
    'Mohale\'s Hoek', 'Quthing', 'Qacha\'s Nek', 'Mokhotlong', 'Thaba-Tseka',
];

// GeoJSON Polygon - kept as a separate sub-schema with no defaults so that
// the 2dsphere index isn't fed a half-built `{ type: 'Polygon' }` document.
// The schema validates that if `location` is set at all, it MUST contain
// the `coordinates` field.
const polygonSchema = new Schema({
    type: { type: String, enum: ['Polygon'], required: true },
    coordinates: { type: [[[Number]]], required: true },
}, { _id: false });

const parcelSchema = new Schema({
    pin: { type: String, required: true, unique: true, index: true }, // SRS FR-LR-005
    tokenId: { type: Number, index: true, sparse: true },             // ERC721 id

    district: { type: String, enum: LESOTHO_DISTRICTS, required: true, index: true },
    location: { type: polygonSchema, default: undefined },            // sparse on purpose
    legacyAddress: { type: String, trim: true },

    areaM2: { type: Number, required: true, min: 0 },
    landUse: {
        type: String,
        enum: ['RESIDENTIAL', 'COMMERCIAL', 'AGRICULTURAL', 'INDUSTRIAL', 'OTHER'],
        default: 'RESIDENTIAL',
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'DISPUTED', 'ENCUMBERED', 'REVOKED', 'DRAFT'],
        default: 'ACTIVE',
        index: true,
    },

    // FR-LR-008: draft parcels auto-expire after 30 days (TTL index below)
    draftExpiresAt: { type: Date, index: true },

    titleDeedRef: { type: String, index: true },
    registeredBy: {
        officerId: String,
        name: String,
        orgId: String,
    },
    blockchainTxId: { type: String, index: true },

    // IPFS / off-chain document references (FR-LR-004)
    // NOTE: encumbrances and disputes are handled by separate contracts and
    //       are NOT stored here (they have their own collections).
    supportingDocs: [{
        type: {
            type: String,
            enum: [
                'SURVEY_PLAN',          // Licensed-surveyor boundary plan
                'ENV_ASSESSMENT',       // Environmental impact assessment
                'DEED_OF_SALE',         // Signed deed of sale for transfer
                'TITLE_DEED',           // Issued digital title deed PDF
                'COURT_ORDER',          // Court order affecting parcel status
                'ID_DOCUMENT',          // Owner identity document copy
                'POWER_OF_ATTORNEY',    // Authorisation for agent to act
                'OTHER',
            ],
            default: 'OTHER',
        },
        name:       { type: String, trim: true },   // original filename
        ipfsCid:    String,                          // IPFS Content Identifier
        sha256:     String,                          // SHA-256 hex of file bytes
        sizeKB:     { type: Number, min: 0 },        // actual file size in KB
        uploadedBy: { type: String, trim: true },    // officer name or wallet address
        uploadedAt: { type: Date, default: Date.now },
    }],
}, {
    timestamps: true,
    collection: 'parcels',
});

// SAD section 5.4 indexes. The geo index is sparse so parcels without a
// polygon don't trip "Can't extract geo keys".
parcelSchema.index({ location: '2dsphere' }, { sparse: true });
parcelSchema.index({ district: 1, status: 1 });
// FR-LR-008: auto-delete DRAFT parcels 30 days after draftExpiresAt (sparse so
// it doesn't fire on ACTIVE parcels that have no draftExpiresAt set).
parcelSchema.index({ draftExpiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

parcelSchema.statics.DISTRICTS = LESOTHO_DISTRICTS;

module.exports = model('Parcel', parcelSchema);
module.exports.DISTRICTS = LESOTHO_DISTRICTS;
