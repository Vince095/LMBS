// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {AuthorityGated} from "../access/AuthorityGated.sol";
import {Roles} from "../access/Roles.sol";

/**
 * @title IdentityRegistry
 * @notice Binds a wallet address to a verified, PSEUDONYMOUS identity.
 *
 * Replaces the former UserProfile contract. No personal data (name, email,
 * telephone, address, date of birth, national ID) is ever written here. The
 * chain holds only:
 *   subjectId       pseudonymous identifier, e.g. keccak256(salt || LNID)
 *                   computed off-chain by the issuer; the salt stays off-chain
 *   credentialHash  hash of the verifiable credential / KYC record held
 *                   off-chain (integrity check only)
 *   issuerRef       issuer or credential-schema reference
 *   status          VERIFIED / SUSPENDED / REVOKED
 *
 * The personal record itself lives in the off-chain database (backend).
 */
contract IdentityRegistry is AuthorityGated {
    enum Status { NONE, VERIFIED, SUSPENDED, REVOKED }

    struct Identity {
        bytes32 subjectId;
        bytes32 credentialHash;
        bytes32 issuerRef;
        Status status;
        uint64 updatedAt;
    }

    mapping(address => Identity) private _identities;
    mapping(bytes32 => address) public accountOfSubject;

    event IdentityRegistered(
        address indexed account, bytes32 indexed subjectId, bytes32 credentialHash, bytes32 issuerRef, address issuer
    );
    event CredentialUpdated(address indexed account, bytes32 credentialHash, bytes32 issuerRef, address issuer);
    event IdentityStatusChanged(address indexed account, Status status, bytes32 reasonHash, address issuer);

    error InvalidInput();
    error AlreadyRegistered(address account);
    error SubjectAlreadyBound(bytes32 subjectId, address account);
    error NotRegistered(address account);

    constructor(IAccessControl authority_) AuthorityGated(authority_) {}

    function register(address account, bytes32 subjectId, bytes32 credentialHash, bytes32 issuerRef)
        external
        onlyRole(Roles.IDENTITY_ISSUER_ROLE)
    {
        if (account == address(0) || subjectId == bytes32(0) || credentialHash == bytes32(0)) revert InvalidInput();
        if (_identities[account].status != Status.NONE) revert AlreadyRegistered(account);
        address bound = accountOfSubject[subjectId];
        if (bound != address(0)) revert SubjectAlreadyBound(subjectId, bound);

        _identities[account] = Identity({
            subjectId: subjectId,
            credentialHash: credentialHash,
            issuerRef: issuerRef,
            status: Status.VERIFIED,
            updatedAt: uint64(block.timestamp)
        });
        accountOfSubject[subjectId] = account;
        emit IdentityRegistered(account, subjectId, credentialHash, issuerRef, msg.sender);
    }

    /// @notice Re-issue a credential (e.g. renewed KYC) without changing the binding.
    function updateCredential(address account, bytes32 credentialHash, bytes32 issuerRef)
        external
        onlyRole(Roles.IDENTITY_ISSUER_ROLE)
    {
        Identity storage id = _identities[account];
        if (id.status == Status.NONE) revert NotRegistered(account);
        if (credentialHash == bytes32(0)) revert InvalidInput();
        id.credentialHash = credentialHash;
        id.issuerRef = issuerRef;
        id.updatedAt = uint64(block.timestamp);
        emit CredentialUpdated(account, credentialHash, issuerRef, msg.sender);
    }

    function setStatus(address account, Status status, bytes32 reasonHash)
        external
        onlyRole(Roles.IDENTITY_ISSUER_ROLE)
    {
        Identity storage id = _identities[account];
        if (id.status == Status.NONE) revert NotRegistered(account);
        if (status == Status.NONE) revert InvalidInput();
        id.status = status;
        id.updatedAt = uint64(block.timestamp);
        emit IdentityStatusChanged(account, status, reasonHash, msg.sender);
    }

    function isVerified(address account) external view returns (bool) {
        return _identities[account].status == Status.VERIFIED;
    }

    function getIdentity(address account) external view returns (Identity memory) {
        return _identities[account];
    }
}
