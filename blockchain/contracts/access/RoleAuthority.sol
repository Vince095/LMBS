// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Roles} from "./Roles.sol";

/**
 * @title RoleAuthority
 * @notice The one AccessControl authority for the whole system. Every other
 *         LMBS contract asks this contract whether an address holds a role,
 *         so an address can never be authorised in one contract and
 *         unauthorised in another.
 *
 * Administration rules
 *  - DEFAULT_ADMIN_ROLE is the admin of every operational role, so only the
 *    governance account can grant or revoke REGISTRAR, APPROVER, etc.
 *  - The default admin itself can only be changed through the two-step,
 *    time-delayed process of AccessControlDefaultAdminRules
 *    (beginDefaultAdminTransfer -> wait `defaultAdminDelay` -> accept).
 *  - Any account may renounce its own role (e.g. on staff departure).
 */
contract RoleAuthority is AccessControlDefaultAdminRules {
    bytes32 public constant REGISTRAR_ROLE = Roles.REGISTRAR_ROLE;
    bytes32 public constant APPROVER_ROLE = Roles.APPROVER_ROLE;
    bytes32 public constant IDENTITY_ISSUER_ROLE = Roles.IDENTITY_ISSUER_ROLE;
    bytes32 public constant DISPUTE_OFFICER_ROLE = Roles.DISPUTE_OFFICER_ROLE;
    bytes32 public constant ENCUMBRANCE_OFFICER_ROLE = Roles.ENCUMBRANCE_OFFICER_ROLE;

    constructor(uint48 adminTransferDelay, address governance)
        AccessControlDefaultAdminRules(adminTransferDelay, governance)
    {}
}
