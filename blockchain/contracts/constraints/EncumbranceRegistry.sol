// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {AuthorityGated} from "../access/AuthorityGated.sol";
import {Roles} from "../access/Roles.sol";

/**
 * @title EncumbranceRegistry
 * @notice Records mortgages, liens, caveats and servitudes against a title.
 *         MORTGAGE, LIEN and CAVEAT block transfer until discharged.
 *         SERVITUDE runs with the land and does not block transfer.
 */
contract EncumbranceRegistry is AuthorityGated {
    enum Kind { MORTGAGE, LIEN, CAVEAT, SERVITUDE }
    enum Status { NONE, ACTIVE, DISCHARGED }

    struct Encumbrance {
        bytes32 parcelKey;
        bytes32 holderRef;     // pseudonymous reference to bank / claimant
        bytes32 instrumentHash; // hash of the registered instrument (off-chain)
        bytes32 dischargeHash;
        Kind kind;
        Status status;
        address recordedBy;
        uint64 registeredAt;
        uint64 dischargedAt;
    }

    Encumbrance[] private _items; // id = index + 1
    mapping(bytes32 => uint256) public blockingCount;

    event EncumbranceRegistered(
        uint256 indexed encumbranceId, bytes32 indexed parcelKey, Kind kind, bytes32 holderRef, bytes32 instrumentHash, address recordedBy
    );
    event EncumbranceDischarged(uint256 indexed encumbranceId, bytes32 indexed parcelKey, bytes32 dischargeHash, address dischargedBy);

    error InvalidInput();
    error UnknownEncumbrance(uint256 encumbranceId);
    error NotActive(uint256 encumbranceId);

    constructor(IAccessControl authority_) AuthorityGated(authority_) {}

    function register(bytes32 parcelKey, Kind kind, bytes32 holderRef, bytes32 instrumentHash)
        external
        onlyRole(Roles.ENCUMBRANCE_OFFICER_ROLE)
        returns (uint256 id)
    {
        if (parcelKey == bytes32(0) || instrumentHash == bytes32(0)) revert InvalidInput();
        _items.push(Encumbrance({
            parcelKey: parcelKey,
            holderRef: holderRef,
            instrumentHash: instrumentHash,
            dischargeHash: bytes32(0),
            kind: kind,
            status: Status.ACTIVE,
            recordedBy: msg.sender,
            registeredAt: uint64(block.timestamp),
            dischargedAt: 0
        }));
        id = _items.length;
        if (isBlockingKind(kind)) blockingCount[parcelKey] += 1;
        emit EncumbranceRegistered(id, parcelKey, kind, holderRef, instrumentHash, msg.sender);
    }

    function discharge(uint256 id, bytes32 dischargeHash) external onlyRole(Roles.ENCUMBRANCE_OFFICER_ROLE) {
        Encumbrance storage e = _get(id);
        if (e.status != Status.ACTIVE) revert NotActive(id);
        if (dischargeHash == bytes32(0)) revert InvalidInput();
        e.status = Status.DISCHARGED;
        e.dischargeHash = dischargeHash;
        e.dischargedAt = uint64(block.timestamp);
        if (isBlockingKind(e.kind)) blockingCount[e.parcelKey] -= 1;
        emit EncumbranceDischarged(id, e.parcelKey, dischargeHash, msg.sender);
    }

    function isBlockingKind(Kind kind) public pure returns (bool) {
        return kind == Kind.MORTGAGE || kind == Kind.LIEN || kind == Kind.CAVEAT;
    }

    function hasBlockingEncumbrance(bytes32 parcelKey) external view returns (bool) {
        return blockingCount[parcelKey] > 0;
    }

    function getEncumbrance(uint256 id) external view returns (Encumbrance memory) {
        return _get(id);
    }

    function encumbranceCount() external view returns (uint256) {
        return _items.length;
    }

    function _get(uint256 id) private view returns (Encumbrance storage) {
        if (id == 0 || id > _items.length) revert UnknownEncumbrance(id);
        return _items[id - 1];
    }
}
