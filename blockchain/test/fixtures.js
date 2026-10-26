const { ethers } = require('hardhat');
const { deploySystem, grant } = require('../scripts/lib/system');

const APPROVAL_THRESHOLD = 3; // 3-of-4 institutional approvers
const REJECTION_THRESHOLD = 2;

const DECISION = { NONE: 0, APPROVE: 1, REJECT: 2 };
const KIND = { REGISTRATION: 0, TRANSFER: 1 };
const STATUS = { NONE: 0, PENDING: 1, APPROVED: 2, EXECUTED: 3, REJECTED: 4, CANCELLED: 5 };
const PARCEL = { AVAILABLE: 0, RESERVED: 1, REGISTERED: 2 };
const BLOCKER = { NONE: 0, OPEN_DISPUTE: 1, BLOCKING_ENCUMBRANCE: 2, PARTY_NOT_VERIFIED: 3, OWNER_CHANGED: 4 };
const ENC_KIND = { MORTGAGE: 0, LIEN: 1, CAVEAT: 2, SERVITUDE: 3 };

const h = (label) => ethers.keccak256(ethers.toUtf8Bytes(label));

/** Synthetic actors: no real people, keys or personal data. */
async function deployFixture() {
    const [
        governance, registrar, laa, survey, deeds, ministry,
        issuer, disputeOfficer, encOfficer, alice, bob, carol, outsider,
    ] = await ethers.getSigners();

    const sys = await deploySystem(ethers, {
        governance,
        approvalThreshold: APPROVAL_THRESHOLD,
        rejectionThreshold: REJECTION_THRESHOLD,
    });
    const { authority, identities, roles } = sys;

    await grant(authority, governance, roles.REGISTRAR_ROLE, registrar.address);
    for (const a of [laa, survey, deeds, ministry]) await grant(authority, governance, roles.APPROVER_ROLE, a.address);
    await grant(authority, governance, roles.IDENTITY_ISSUER_ROLE, issuer.address);
    await grant(authority, governance, roles.DISPUTE_OFFICER_ROLE, disputeOfficer.address);
    await grant(authority, governance, roles.ENCUMBRANCE_OFFICER_ROLE, encOfficer.address);

    // Pseudonymous identities for the synthetic citizens.
    for (const [i, c] of [alice, bob, carol].entries()) {
        await identities.connect(issuer).register(c.address, h(`subject-${i}`), h(`credential-${i}`), h('issuer:LAA-KYC'));
    }

    return {
        ...sys,
        governance, registrar, approvers: [laa, survey, deeds, ministry],
        laa, survey, deeds, ministry, issuer, disputeOfficer, encOfficer, alice, bob, carol, outsider,
    };
}

/** Submit a registration and push it through `n` approvals. Returns request id + token id. */
async function registerTitle(f, parcelNumber, owner, { approvals = APPROVAL_THRESHOLD } = {}) {
    const { registry, registrar, approvers } = f;
    const tx = await registry.connect(registrar).submitRegistration(parcelNumber, owner.address, h(`survey:${parcelNumber}`), h(`deed:${parcelNumber}`));
    await tx.wait();
    const requestId = await registry.requestCount();
    for (let i = 0; i < approvals; i++) await registry.connect(approvers[i]).approveRequest(requestId);
    const tokenId = BigInt(await registry.parcelKeyOf(parcelNumber));
    return { requestId, tokenId };
}

async function signVote(registry, signer, vote) {
    const net = await ethers.provider.getNetwork();
    const domain = {
        name: 'LMBS LandRegistry',
        version: '1',
        chainId: net.chainId,
        verifyingContract: await registry.getAddress(),
    };
    return signer.signTypedData(domain, VOTE_TYPES, vote);
}

const VOTE_TYPES = {
    ApprovalVote: [
        { name: 'requestId', type: 'uint256' },
        { name: 'parcelKey', type: 'bytes32' },
        { name: 'action', type: 'uint8' },
        { name: 'decision', type: 'uint8' },
        { name: 'documentHash', type: 'bytes32' },
        { name: 'role', type: 'bytes32' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
    ],
};

module.exports = {
    deployFixture, registerTitle, signVote, h, VOTE_TYPES,
    APPROVAL_THRESHOLD, REJECTION_THRESHOLD, DECISION, KIND, STATUS, PARCEL, BLOCKER, ENC_KIND,
};
