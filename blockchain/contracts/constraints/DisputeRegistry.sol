// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {AuthorityGated} from "../access/AuthorityGated.sol";
import {Roles} from "../access/Roles.sol";

/**
 * @title DisputeRegistry
 * @notice Records disputes against a parcel. LandRegistry refuses to accept
 *         or execute any registration or transfer for a parcel with an OPEN
 *         dispute, so the dispute module now governs the main workflow.
 *         Claim and resolution documents stay off-chain; only hashes are kept.
 */
contract DisputeRegistry is AuthorityGated {
    enum Status { NONE, OPEN, RESOLVED, DISMISSED }

    struct Dispute {
        bytes32 parcelKey;
        bytes32 claimHash;
        bytes32 outcomeHash;
        address recordedBy;
        Status status;
        uint64 openedAt;
        uint64 closedAt;
    }

    Dispute[] private _disputes; // id = index + 1
    mapping(bytes32 => uint256) public openDisputeCount;

    event DisputeOpened(uint256 indexed disputeId, bytes32 indexed parcelKey, bytes32 claimHash, address recordedBy);
    event DisputeClosed(uint256 indexed disputeId, bytes32 indexed parcelKey, Status status, bytes32 outcomeHash, address closedBy);

    error InvalidInput();
    error UnknownDispute(uint256 disputeId);
    error DisputeNotOpen(uint256 disputeId);

    constructor(IAccessControl authority_) AuthorityGated(authority_) {}

    function openDispute(bytes32 parcelKey, bytes32 claimHash)
        external
        onlyRole(Roles.DISPUTE_OFFICER_ROLE)
        returns (uint256 disputeId)
    {
        if (parcelKey == bytes32(0) || claimHash == bytes32(0)) revert InvalidInput();
        _disputes.push(Dispute({
            parcelKey: parcelKey,
            claimHash: claimHash,
            outcomeHash: bytes32(0),
            recordedBy: msg.sender,
            status: Status.OPEN,
            openedAt: uint64(block.timestamp),
            closedAt: 0
        }));
        disputeId = _disputes.length;
        openDisputeCount[parcelKey] += 1;
        emit DisputeOpened(disputeId, parcelKey, claimHash, msg.sender);
    }

    /// @param dismissed true = dismissed, false = resolved (lawful resolution recorded)
    function closeDispute(uint256 disputeId, bytes32 outcomeHash, bool dismissed)
        external
        onlyRole(Roles.DISPUTE_OFFICER_ROLE)
    {
        Dispute storage d = _get(disputeId);
        if (d.status != Status.OPEN) revert DisputeNotOpen(disputeId);
        if (outcomeHash == bytes32(0)) revert InvalidInput();
        d.status = dismissed ? Status.DISMISSED : Status.RESOLVED;
        d.outcomeHash = outcomeHash;
        d.closedAt = uint64(block.timestamp);
        openDisputeCount[d.parcelKey] -= 1;
        emit DisputeClosed(disputeId, d.parcelKey, d.status, outcomeHash, msg.sender);
    }

    function hasOpenDispute(bytes32 parcelKey) external view returns (bool) {
        return openDisputeCount[parcelKey] > 0;
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        return _get(disputeId);
    }

    function disputeCount() external view returns (uint256) {
        return _disputes.length;
    }

    function _get(uint256 disputeId) private view returns (Dispute storage) {
        if (disputeId == 0 || disputeId > _disputes.length) revert UnknownDispute(disputeId);
        return _disputes[disputeId - 1];
    }
}
