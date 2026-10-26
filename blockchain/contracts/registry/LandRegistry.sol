// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {AuthorityGated} from "../access/AuthorityGated.sol";
import {Roles} from "../access/Roles.sol";
import {IdentityRegistry} from "../identity/IdentityRegistry.sol";
import {DisputeRegistry} from "../constraints/DisputeRegistry.sol";
import {EncumbranceRegistry} from "../constraints/EncumbranceRegistry.sol";

/**
 * @title LandRegistry
 * @notice Permissioned land-title registry with M-of-N institutional approval.
 *
 * DESIGN RULES (supervisor review, 9 Aug 2026)
 *  1. Network consensus and block finality are handled by Hyperledger Besu
 *     QBFT. This contract does NOT simulate PRE-PREPARE / PREPARE / COMMIT.
 *     It only implements the land-governance approval threshold.
 *  2. Request life-cycle:  PENDING -> APPROVED -> EXECUTED
 *                                  \-> REJECTED        (rejection threshold)
 *                                  \-> CANCELLED       (submitter withdraws)
 *     EXECUTED is written only AFTER the mint / transfer has succeeded.
 *  3. One authoritative state-change path: every mint and every ownership
 *     change goes through _execute(). Direct ERC-721 transfers and approvals
 *     are disabled; _update() only allows state changes while _execute() is
 *     running.
 *  4. Parcel numbers are normalised and the canonical parcel key is RESERVED
 *     when a registration request is accepted, so two pending requests can
 *     never target the same parcel. Rejection or cancellation releases it.
 *  5. Open disputes and blocking encumbrances (mortgage, lien, caveat) stop a
 *     request from being submitted and from being executed.
 *  6. Approvals are either direct transactions from an APPROVER_ROLE account
 *     or EIP-712 typed signatures verified here (nonce, expiry, chain id and
 *     verifying contract are all bound into the signed data).
 *  7. No personal data on-chain: parties are wallet addresses whose identity
 *     is anchored pseudonymously in IdentityRegistry.
 *
 * LEGAL NOTE: a token minted here is the registry's internal digital record
 * of a title. It does not by itself create or transfer legal ownership; that
 * follows from the Land Act 2010 and the authorised registry act.
 */
contract LandRegistry is ERC721, EIP712, AuthorityGated {
    // ------------------------------------------------------------------ types

    enum RequestKind { REGISTRATION, TRANSFER }
    enum RequestStatus { NONE, PENDING, APPROVED, EXECUTED, REJECTED, CANCELLED }
    enum Decision { NONE, APPROVE, REJECT }
    enum ParcelState { AVAILABLE, RESERVED, REGISTERED }

    /// Reasons an APPROVED request cannot execute yet.
    enum Blocker { NONE, OPEN_DISPUTE, BLOCKING_ENCUMBRANCE, PARTY_NOT_VERIFIED, OWNER_CHANGED }

    struct Request {
        RequestKind kind;
        RequestStatus status;
        uint16 threshold;   // approvals required (snapshot at submission)
        uint16 approvals;
        uint16 rejections;
        uint64 createdAt;
        uint64 closedAt;
        bytes32 parcelKey;
        bytes32 documentHash;
        bytes32 surveyHash;  // registration only: survey-backed cadastral record
        address submitter;
        address from;        // zero for registration
        address to;          // beneficiary / transferee
    }

    struct ParcelRecord {
        ParcelState state;
        uint256 requestId; // reserving request while RESERVED; registering request once REGISTERED
    }

    /// EIP-712 typed approval / rejection vote. `role` must be APPROVER_ROLE.
    struct ApprovalVote {
        uint256 requestId;
        bytes32 parcelKey;
        uint8 action;       // RequestKind
        uint8 decision;     // Decision.APPROVE or Decision.REJECT
        bytes32 documentHash;
        bytes32 role;
        uint256 nonce;
        uint256 deadline;   // unix seconds
    }

    bytes32 public constant APPROVAL_TYPEHASH = keccak256(
        "ApprovalVote(uint256 requestId,bytes32 parcelKey,uint8 action,uint8 decision,bytes32 documentHash,bytes32 role,uint256 nonce,uint256 deadline)"
    );

    uint256 public constant MAX_PARCEL_NUMBER_LENGTH = 64;

    // ------------------------------------------------------------------ state

    IdentityRegistry public immutable identities;
    DisputeRegistry public immutable disputes;
    EncumbranceRegistry public immutable encumbrances;

    uint16 public approvalThreshold;
    uint16 public rejectionThreshold;

    uint256 public requestCount; // request ids start at 1
    mapping(uint256 => Request) private _requests;
    mapping(uint256 => mapping(address => Decision)) public decisionOf;

    mapping(bytes32 => ParcelRecord) private _parcels;
    mapping(bytes32 => string) public canonicalParcelNumber;

    mapping(uint256 => uint256) public activeTransferRequest; // tokenId => requestId
    mapping(uint256 => bytes32) public titleDocumentHash;     // tokenId => latest registered instrument
    mapping(uint256 => bytes32) public titleSurveyHash;       // tokenId => survey record
    mapping(uint256 => uint256[]) private _titleHistory;      // tokenId => executed request ids

    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    bool private _executing;

    // ----------------------------------------------------------------- events

    event RequestSubmitted(
        uint256 indexed requestId,
        RequestKind kind,
        bytes32 indexed parcelKey,
        uint256 indexed tokenId,
        address submitter,
        address from,
        address to,
        bytes32 documentHash,
        uint16 threshold
    );
    event ParcelReserved(bytes32 indexed parcelKey, uint256 indexed requestId, string parcelNumber);
    event ParcelReleased(bytes32 indexed parcelKey, uint256 indexed requestId);
    event DecisionRecorded(
        uint256 indexed requestId,
        address indexed approver,
        Decision decision,
        bytes32 reasonHash,
        bool viaSignature,
        uint16 approvals,
        uint16 rejections
    );
    event RequestApproved(uint256 indexed requestId);
    event ExecutionDeferred(uint256 indexed requestId, Blocker reason);
    event RequestExecuted(uint256 indexed requestId, RequestKind kind, uint256 indexed tokenId, address from, address to);
    event RequestRejected(uint256 indexed requestId);
    event RequestCancelled(uint256 indexed requestId, address by);
    event ThresholdsUpdated(uint16 approvalThreshold, uint16 rejectionThreshold);

    // ----------------------------------------------------------------- errors

    error InvalidParcelNumber();
    error InvalidInput();
    error InvalidThreshold();
    error ParcelUnavailable(bytes32 parcelKey, ParcelState state);
    error PartyNotVerified(address account);
    error NotTitleHolder(address caller, uint256 tokenId);
    error TransferAlreadyPending(uint256 tokenId, uint256 requestId);
    error ParcelHasOpenDispute(bytes32 parcelKey);
    error ParcelEncumbered(bytes32 parcelKey);
    error UnknownRequest(uint256 requestId);
    error RequestNotPending(uint256 requestId, RequestStatus status);
    error RequestNotApproved(uint256 requestId, RequestStatus status);
    error RequestClosed(uint256 requestId, RequestStatus status);
    error AlreadyDecided(uint256 requestId, address approver);
    error ConflictOfInterest(uint256 requestId, address approver);
    error ExecutionBlocked(uint256 requestId, Blocker reason);
    error NotSubmitter(uint256 requestId, address caller);
    error ApprovalExpired(uint256 deadline);
    error NonceAlreadyUsed(address signer, uint256 nonce);
    error InvalidApprovalRole(bytes32 role);
    error InvalidDecision();
    error ApprovalMismatch(uint256 requestId);
    error DirectTransferDisabled();

    // ------------------------------------------------------------ constructor

    constructor(
        IAccessControl authority_,
        IdentityRegistry identities_,
        DisputeRegistry disputes_,
        EncumbranceRegistry encumbrances_,
        uint16 approvalThreshold_,
        uint16 rejectionThreshold_
    )
        ERC721("Lesotho Land Title Record", "LTR")
        EIP712("LMBS LandRegistry", "1")
        AuthorityGated(authority_)
    {
        if (
            address(identities_) == address(0) || address(disputes_) == address(0)
                || address(encumbrances_) == address(0)
        ) revert ZeroAddress();
        identities = identities_;
        disputes = disputes_;
        encumbrances = encumbrances_;
        _setThresholds(approvalThreshold_, rejectionThreshold_);
    }

    // ============================================================ governance

    function setThresholds(uint16 approvalThreshold_, uint16 rejectionThreshold_)
        external
        onlyRole(Roles.DEFAULT_ADMIN_ROLE)
    {
        _setThresholds(approvalThreshold_, rejectionThreshold_);
    }

    function _setThresholds(uint16 a, uint16 r) private {
        if (a == 0 || r == 0) revert InvalidThreshold();
        approvalThreshold = a;
        rejectionThreshold = r;
        emit ThresholdsUpdated(a, r);
    }

    // ======================================================= parcel identity

    /**
     * @notice Canonical form of a parcel / lease number: whitespace removed,
     *         letters upper-cased; only A-Z, 0-9, '-' and '/' are allowed.
     *         "  13283 - 001 " and "13283-001" give the same key.
     */
    function normalizeParcelNumber(string memory parcelNumber) public pure returns (string memory) {
        bytes memory raw = bytes(parcelNumber);
        bytes memory out = new bytes(raw.length);
        uint256 n;
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 c = raw[i];
            if (c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0d) continue; // whitespace
            if (c >= 0x61 && c <= 0x7a) c = bytes1(uint8(c) - 32); // a-z -> A-Z
            bool ok = (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || c == 0x2d || c == 0x2f;
            if (!ok) revert InvalidParcelNumber();
            out[n++] = c;
        }
        if (n == 0 || n > MAX_PARCEL_NUMBER_LENGTH) revert InvalidParcelNumber();
        assembly {
            mstore(out, n)
        }
        return string(out);
    }

    function parcelKeyOf(string memory parcelNumber) public pure returns (bytes32) {
        return keccak256(bytes(normalizeParcelNumber(parcelNumber)));
    }

    /// @notice Title token id is derived from the parcel key: one token per parcel, ever.
    function tokenIdOf(bytes32 parcelKey) public pure returns (uint256) {
        return uint256(parcelKey);
    }

    // ============================================================ submission

    /**
     * @notice Submit a first-registration request. Callable by a registry
     *         officer on behalf of a verified applicant, or by a verified
     *         applicant for themselves. The parcel key is reserved at once.
     */
    function submitRegistration(
        string calldata parcelNumber,
        address beneficiary,
        bytes32 surveyHash,
        bytes32 documentHash
    ) external returns (uint256 requestId) {
        if (beneficiary == address(0) || surveyHash == bytes32(0) || documentHash == bytes32(0)) {
            revert InvalidInput();
        }
        if (!_hasRole(Roles.REGISTRAR_ROLE, msg.sender) && msg.sender != beneficiary) {
            revert Unauthorized(msg.sender, Roles.REGISTRAR_ROLE);
        }
        if (!identities.isVerified(beneficiary)) revert PartyNotVerified(beneficiary);

        string memory canonical = normalizeParcelNumber(parcelNumber);
        bytes32 key = keccak256(bytes(canonical));

        ParcelRecord storage p = _parcels[key];
        if (p.state != ParcelState.AVAILABLE) revert ParcelUnavailable(key, p.state);
        if (disputes.hasOpenDispute(key)) revert ParcelHasOpenDispute(key);

        requestId = _newRequest(RequestKind.REGISTRATION, key, documentHash, surveyHash, address(0), beneficiary);

        p.state = ParcelState.RESERVED;
        p.requestId = requestId;
        if (bytes(canonicalParcelNumber[key]).length == 0) canonicalParcelNumber[key] = canonical;
        emit ParcelReserved(key, requestId, canonical);
    }

    /**
     * @notice Submit a transfer request. Only the current title holder can
     *         initiate a transfer of their own title.
     */
    function submitTransfer(uint256 tokenId, address to, bytes32 documentHash) external returns (uint256 requestId) {
        address owner = _requireOwned(tokenId);
        if (msg.sender != owner) revert NotTitleHolder(msg.sender, tokenId);
        if (to == address(0) || to == owner || documentHash == bytes32(0)) revert InvalidInput();
        if (!identities.isVerified(to)) revert PartyNotVerified(to);

        uint256 pending = activeTransferRequest[tokenId];
        if (pending != 0) revert TransferAlreadyPending(tokenId, pending);

        bytes32 key = bytes32(tokenId);
        if (disputes.hasOpenDispute(key)) revert ParcelHasOpenDispute(key);
        if (encumbrances.hasBlockingEncumbrance(key)) revert ParcelEncumbered(key);

        requestId = _newRequest(RequestKind.TRANSFER, key, documentHash, bytes32(0), owner, to);
        activeTransferRequest[tokenId] = requestId;
    }

    function _newRequest(
        RequestKind kind,
        bytes32 key,
        bytes32 documentHash,
        bytes32 surveyHash,
        address from,
        address to
    ) private returns (uint256 requestId) {
        requestId = ++requestCount;
        _requests[requestId] = Request({
            kind: kind,
            status: RequestStatus.PENDING,
            threshold: approvalThreshold,
            approvals: 0,
            rejections: 0,
            createdAt: uint64(block.timestamp),
            closedAt: 0,
            parcelKey: key,
            documentHash: documentHash,
            surveyHash: surveyHash,
            submitter: msg.sender,
            from: from,
            to: to
        });
        emit RequestSubmitted(requestId, kind, key, tokenIdOf(key), msg.sender, from, to, documentHash, approvalThreshold);
    }

    // ============================================================= approvals

    /// @notice Approve directly from an authorised institutional account.
    function approveRequest(uint256 requestId) external onlyRole(Roles.APPROVER_ROLE) {
        _recordDecision(requestId, msg.sender, Decision.APPROVE, bytes32(0), false);
    }

    /// @notice Reject directly from an authorised institutional account.
    function rejectRequest(uint256 requestId, bytes32 reasonHash) external onlyRole(Roles.APPROVER_ROLE) {
        _recordDecision(requestId, msg.sender, Decision.REJECT, reasonHash, false);
    }

    /**
     * @notice Record an approval or rejection signed off-line with EIP-712.
     *         Anyone may relay the signature; authority comes from the signer.
     */
    function submitSignedDecision(ApprovalVote calldata a, bytes calldata signature) external {
        if (block.timestamp > a.deadline) revert ApprovalExpired(a.deadline);
        if (a.role != Roles.APPROVER_ROLE) revert InvalidApprovalRole(a.role);
        if (a.decision != uint8(Decision.APPROVE) && a.decision != uint8(Decision.REJECT)) revert InvalidDecision();

        address signer = ECDSA.recover(hashApproval(a), signature);
        _checkRole(Roles.APPROVER_ROLE, signer);

        if (nonceUsed[signer][a.nonce]) revert NonceAlreadyUsed(signer, a.nonce);
        nonceUsed[signer][a.nonce] = true;

        Request storage r = _get(a.requestId);
        if (r.parcelKey != a.parcelKey || uint8(r.kind) != a.action || r.documentHash != a.documentHash) {
            revert ApprovalMismatch(a.requestId);
        }
        _recordDecision(a.requestId, signer, Decision(a.decision), bytes32(0), true);
    }

    function hashApproval(ApprovalVote calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    APPROVAL_TYPEHASH,
                    a.requestId,
                    a.parcelKey,
                    a.action,
                    a.decision,
                    a.documentHash,
                    a.role,
                    a.nonce,
                    a.deadline
                )
            )
        );
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _recordDecision(uint256 requestId, address approver, Decision decision, bytes32 reasonHash, bool viaSig)
        private
    {
        Request storage r = _get(requestId);
        if (r.status != RequestStatus.PENDING) revert RequestNotPending(requestId, r.status);
        if (decisionOf[requestId][approver] != Decision.NONE) revert AlreadyDecided(requestId, approver);
        // Separation of duties: nobody approves a request they submitted or are a party to.
        if (approver == r.submitter || approver == r.from || approver == r.to) {
            revert ConflictOfInterest(requestId, approver);
        }

        decisionOf[requestId][approver] = decision;
        if (decision == Decision.APPROVE) r.approvals += 1;
        else r.rejections += 1;

        emit DecisionRecorded(requestId, approver, decision, reasonHash, viaSig, r.approvals, r.rejections);

        if (r.rejections >= rejectionThreshold) {
            _close(requestId, r, RequestStatus.REJECTED);
            emit RequestRejected(requestId);
        } else if (r.approvals >= r.threshold) {
            r.status = RequestStatus.APPROVED;
            emit RequestApproved(requestId);
            Blocker b = executionBlocker(requestId);
            if (b == Blocker.NONE) _execute(requestId, r);
            else emit ExecutionDeferred(requestId, b);
        }
    }

    // ============================================================= execution

    /**
     * @notice Execute an APPROVED request whose execution was deferred (for
     *         example a caveat was lodged after approval and has since been
     *         discharged). Anyone may call; all checks are re-run.
     */
    function execute(uint256 requestId) external {
        Request storage r = _get(requestId);
        if (r.status != RequestStatus.APPROVED) revert RequestNotApproved(requestId, r.status);
        Blocker b = executionBlocker(requestId);
        if (b != Blocker.NONE) revert ExecutionBlocked(requestId, b);
        _execute(requestId, r);
    }

    function executionBlocker(uint256 requestId) public view returns (Blocker) {
        Request storage r = _get(requestId);
        if (disputes.hasOpenDispute(r.parcelKey)) return Blocker.OPEN_DISPUTE;
        if (!identities.isVerified(r.to)) return Blocker.PARTY_NOT_VERIFIED;
        if (r.kind == RequestKind.TRANSFER) {
            if (encumbrances.hasBlockingEncumbrance(r.parcelKey)) return Blocker.BLOCKING_ENCUMBRANCE;
            if (_ownerOf(tokenIdOf(r.parcelKey)) != r.from) return Blocker.OWNER_CHANGED;
        }
        return Blocker.NONE;
    }

    /// The ONLY place where titles are minted or change hands.
    function _execute(uint256 requestId, Request storage r) private {
        uint256 tokenId = tokenIdOf(r.parcelKey);

        _executing = true;
        if (r.kind == RequestKind.REGISTRATION) {
            _mint(r.to, tokenId);
            ParcelRecord storage p = _parcels[r.parcelKey];
            p.state = ParcelState.REGISTERED;
            p.requestId = requestId;
            titleSurveyHash[tokenId] = r.surveyHash;
        } else {
            _transfer(r.from, r.to, tokenId);
            delete activeTransferRequest[tokenId];
        }
        _executing = false;

        titleDocumentHash[tokenId] = r.documentHash;
        _titleHistory[tokenId].push(requestId);

        // Terminal status only after the state change above has succeeded.
        r.status = RequestStatus.EXECUTED;
        r.closedAt = uint64(block.timestamp);
        emit RequestExecuted(requestId, r.kind, tokenId, r.from, r.to);
    }

    // ========================================================== cancellation

    /// @notice The submitter may withdraw a request that has not executed.
    function cancel(uint256 requestId) external {
        Request storage r = _get(requestId);
        if (r.status != RequestStatus.PENDING && r.status != RequestStatus.APPROVED) {
            revert RequestClosed(requestId, r.status);
        }
        if (msg.sender != r.submitter) revert NotSubmitter(requestId, msg.sender);
        _close(requestId, r, RequestStatus.CANCELLED);
        emit RequestCancelled(requestId, msg.sender);
    }

    function _close(uint256 requestId, Request storage r, RequestStatus status) private {
        r.status = status;
        r.closedAt = uint64(block.timestamp);
        if (r.kind == RequestKind.REGISTRATION) {
            ParcelRecord storage p = _parcels[r.parcelKey];
            if (p.state == ParcelState.RESERVED && p.requestId == requestId) {
                p.state = ParcelState.AVAILABLE;
                p.requestId = 0;
                emit ParcelReleased(r.parcelKey, requestId);
            }
        } else {
            uint256 tokenId = tokenIdOf(r.parcelKey);
            if (activeTransferRequest[tokenId] == requestId) delete activeTransferRequest[tokenId];
        }
    }

    // ================================================================= views

    function getRequest(uint256 requestId) external view returns (Request memory) {
        return _get(requestId);
    }

    function parcelRecord(bytes32 parcelKey) external view returns (ParcelRecord memory) {
        return _parcels[parcelKey];
    }

    function titleHistory(uint256 tokenId) external view returns (uint256[] memory) {
        return _titleHistory[tokenId];
    }

    /// @notice Page through requests (ids `from`..`from+count-1`) for dashboards.
    function getRequests(uint256 from, uint256 count) external view returns (Request[] memory out) {
        if (from == 0) from = 1;
        if (from > requestCount) return new Request[](0);
        uint256 end = from + count - 1;
        if (end > requestCount) end = requestCount;
        out = new Request[](end - from + 1);
        for (uint256 i = from; i <= end; i++) out[i - from] = _requests[i];
    }

    function _get(uint256 requestId) private view returns (Request storage r) {
        r = _requests[requestId];
        if (r.status == RequestStatus.NONE) revert UnknownRequest(requestId);
    }

    // ============================================ ERC-721 governed transfers

    /// All ownership changes must come from _execute(); direct transfers revert.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (!_executing) revert DirectTransferDisabled();
        return super._update(to, tokenId, auth);
    }

    /// Operator approvals are meaningless when transfers are governed.
    function approve(address, uint256) public pure override {
        revert DirectTransferDisabled();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert DirectTransferDisabled();
    }
}
