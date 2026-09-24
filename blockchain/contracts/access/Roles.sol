// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Roles
 * @notice Single source of truth for every permission used by the LMBS
 *         contracts. All roles are held in ONE RoleAuthority contract; no
 *         other contract keeps its own role table.
 *
 * Institutional mapping (prototype; must follow the Land Act 2010 and the
 * delegations actually issued by the Land Administration Authority):
 *
 *  DEFAULT_ADMIN_ROLE        LAA governance board (production: a multisig).
 *                            Grants/revokes every other role, sets thresholds.
 *  REGISTRAR_ROLE            LAA registry officers. Submit first-registration
 *                            requests on behalf of verified applicants.
 *  APPROVER_ROLE             Named approving institutions (M-of-N). Approve or
 *                            reject registration and transfer requests.
 *  IDENTITY_ISSUER_ROLE      Identity verification desk. Anchors pseudonymous
 *                            identity/credential references (never raw PII).
 *  DISPUTE_OFFICER_ROLE      Land dispute office / court liaison. Records and
 *                            closes disputes affecting a parcel.
 *  ENCUMBRANCE_OFFICER_ROLE  Deeds Registry. Records and discharges mortgages,
 *                            liens and caveats lodged against a title.
 */
library Roles {
    bytes32 internal constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 internal constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");
    bytes32 internal constant APPROVER_ROLE = keccak256("APPROVER_ROLE");
    bytes32 internal constant IDENTITY_ISSUER_ROLE = keccak256("IDENTITY_ISSUER_ROLE");
    bytes32 internal constant DISPUTE_OFFICER_ROLE = keccak256("DISPUTE_OFFICER_ROLE");
    bytes32 internal constant ENCUMBRANCE_OFFICER_ROLE = keccak256("ENCUMBRANCE_OFFICER_ROLE");
}
