// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @title AuthorityGated
 * @notice Base for contracts that delegate every permission check to the
 *         shared RoleAuthority.
 */
abstract contract AuthorityGated {
    IAccessControl public immutable authority;

    error ZeroAddress();
    error Unauthorized(address account, bytes32 role);

    constructor(IAccessControl authority_) {
        if (address(authority_) == address(0)) revert ZeroAddress();
        authority = authority_;
    }

    modifier onlyRole(bytes32 role) {
        _checkRole(role, msg.sender);
        _;
    }

    function _hasRole(bytes32 role, address account) internal view returns (bool) {
        return authority.hasRole(role, account);
    }

    function _checkRole(bytes32 role, address account) internal view {
        if (!authority.hasRole(role, account)) revert Unauthorized(account, role);
    }
}
