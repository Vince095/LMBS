# Architecture (implemented prototype)

This document describes what is **implemented** in this repository. Planned work is marked
*planned* and is listed in [LIMITATIONS.md](LIMITATIONS.md).

## 1. One permissioned ledger

* **Hyperledger Besu 25.x, QBFT consensus**, chain id 2026, 2-second blocks, zero gas price.
* **Four validators**, one per named institution (`network/config/validators.json`):

  | Node | Institution (prototype assignment) |
  |---|---|
  | node1 | Land Administration Authority (LAA) |
  | node2 | Department of Survey and Physical Planning |
  | node3 | Deeds Registry |
  | node4 | Ministry of Local Government |

* QBFT tolerates `f = floor((N-1)/3) = 1` faulty validator when N = 4. The quorum is 3.
  This is demonstrated by `npm run network:fault-test` (`network/lmbs-network.js`).
* **Permissioning**: a node allowlist (only the four validators may peer) and an account
  allowlist (only enrolled institutional and citizen accounts may send transactions), in
  `network/generated/permissions_config.toml`.
* Keys are generated **on each machine** by `npm run network:setup`. None are committed.

## 2. Separate mechanisms

| Concern | Mechanism | Where |
|---|---|---|
| Network consensus and finality | Besu QBFT | Besu nodes. Solidity does **not** reproduce PRE-PREPARE/PREPARE/COMMIT. |
| Business approval | M-of-N institutional approval (default 3 approvals; 2 rejections close a request) | `LandRegistry` |
| Identity proof | Wallet bound by a signed challenge, plus a pseudonymous identity anchored by an identity issuer | backend `/api/auth/wallet/*`, `IdentityRegistry` |
| Document integrity | keccak256 of the plaintext, anchored in the request; AES-256-GCM encryption off-chain | backend `documentStore`, `LandRegistry.documentHash` |
| Legal title | National law and the authorised registry act | outside the system. The token is an internal digital record. |

## 3. Smart-contract layer (`blockchain/contracts`)

| Contract | Responsibility |
|---|---|
| `access/RoleAuthority.sol` | The **only** role table. OpenZeppelin `AccessControlDefaultAdminRules`. Governance administers every role. Changing the admin itself takes a two-step, time-delayed process. |
| `access/Roles.sol` | Role identifiers and their institutional meaning |
| `identity/IdentityRegistry.sol` | Wallet → {subjectId, credentialHash, issuerRef, status}. No personal data. |
| `constraints/DisputeRegistry.sol` | Open or close disputes per parcel key (hashes of the claim and outcome) |
| `constraints/EncumbranceRegistry.sol` | Mortgage, lien and caveat (all blocking) and servitude (non-blocking) |
| `registry/LandRegistry.sol` | Requests, M-of-N approvals, EIP-712 votes, parcel reservation, governed ERC-721 title records |

### Request life-cycle

```
submitRegistration / submitTransfer
        │  (parcel key RESERVED / title locked immediately)
        ▼
     PENDING ──(rejections ≥ 2)──► REJECTED   (reservation / lock released)
        │  ──(submitter cancels)──► CANCELLED (reservation / lock released)
        │ approvals ≥ M
        ▼
     APPROVED ──(blocker: dispute, encumbrance, unverified party)──► stays APPROVED, execute() later
        │ _execute(): mint or transfer succeeds
        ▼
     EXECUTED   (status is written only after the state change succeeded)
```

### Rules enforced on-chain

* **Owner-only transfer**: only `ownerOf(tokenId)` may call `submitTransfer`.
* **Direct-transfer bypass is closed**: `_update` reverts unless `_execute` is running.
  `approve` and `setApprovalForAll` always revert.
* **Canonical parcel key**: `normalizeParcelNumber` strips whitespace, upper-cases, and allows
  only `A-Z 0-9 - /`. The key is `keccak256(normalised)` and the token id is `uint256(key)`.
  The key is reserved at submission, so two pending requests for the same parcel cannot exist.
  Registration also needs a `surveyHash`: the hash of the licensed surveyor's plan.
* **Separation of duties**: nobody can vote on a request they submitted or are a party to.
* **Approval integrity**: one vote per approver per request. For EIP-712 votes, a nonce can be
  used once per signer, the expiry is enforced, the role must be `APPROVER_ROLE`, the signer must
  hold it, and the signed fields must match the request. The chain id and verifying contract are
  in the domain.
* **Disputes and encumbrances**: checked at submission **and** at execution. There is one
  authoritative path.

## 4. API and workflow services (`backend/`)

* Every route requires a JWT except `/api/health`, `/api/auth/login` and `/api/auth/register`.
  RBAC is always enforced.
* Self-registration always creates a `CITIZEN` account. Roles are changed only by an `ADMIN`.
  The first admin is created with `scripts/create-admin.js`.
* **Wallet linking**: `POST /api/auth/wallet/challenge` returns a one-time message. The user signs
  it in their wallet. `POST /api/auth/wallet/verify` checks the signature and binds the address.
  The JWT carries the address only after this check.
* **No fabricated blockchain data**: `POST /api/titles` and `POST /api/transfers` accept a
  transaction hash that the client's wallet has already sent. The backend verifies the receipt,
  the `RequestSubmitted` event, the submitter and the parcel key before storing metadata.
* **Indexer** (`services/indexerService.js`): polls LandRegistry, DisputeRegistry and
  EncumbranceRegistry events into read models (`chain_requests`, parcels, deeds, transfers).
  Only `RequestExecuted` activates a deed or changes an owner in MongoDB.
* **Encrypted documents** (`/api/documents`): AES-256-GCM using a 256-bit key from
  `ENCRYPTION_KEY`. A tampered file fails authentication and the hash check.
* The server refuses to start if `JWT_SECRET`, `ENCRYPTION_KEY` or `PSEUDONYM_SALT` is missing
  or a placeholder.

## 5. User and institutional applications (`src/`)

| Page | Role | On-chain action (signed in the user's own wallet) |
|---|---|---|
| Register / Transfer wizard | registrar, applicant, title holder | `submitRegistration`, `submitTransfer` (after encrypted document upload) |
| Approvals | approving institutions | `approveRequest`, `rejectRequest`, `execute` |
| Blockchain registry console | everyone. Tools appear by on-chain role. | view titles and requests, `cancel`; identity issuer: `IdentityRegistry.register`; dispute officer: `openDispute`/`closeDispute`; encumbrance officer: `register`/`discharge` |
| Wallet panel | everyone | link wallet (signature only), show on-chain roles and identity status |

The portal never asks for a seed phrase, mnemonic or private key.

## 6. SSI and selective disclosure (planned)

The identity layer is ready for verifiable credentials: `credentialHash` and `issuerRef` can
reference a W3C VC and its issuer or schema. BBS selective disclosure and zero-knowledge proofs are
**planned**. They should follow only after the registration and transfer workflow is stable, as
the supervisor recommends.
