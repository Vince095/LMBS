# Traceability: supervisor findings → changes → evidence

This table follows the supervisor's comments on the revised prototype (Dr C. Kombe, 9 Aug 2026).

## P0: before the next submission

| # | Finding | Change | Evidence |
|---|---|---|---|
| P0-1 | Finalisation always reverts (FINALIZED set before the finaliser runs) | New `LandRegistry` life-cycle PENDING → APPROVED → EXECUTED, or REJECTED / CANCELLED. `_execute()` performs the mint or transfer first and writes EXECUTED only afterwards. Every transition is tested. | `01.Registration.test.js` "EXECUTED is set only after the mint succeeded"; `02`, `03`, `07` transitions; demo steps 4 and 6 |
| P0-2 | ERC-721 hook calls `ownerOf` before mint and blocks the governed transfer | `_update` has no `ownerOf` call. It permits a state change only while `_execute` runs (`_executing` flag), and otherwise reverts `DirectTransferDisabled`. `approve` and `setApprovalForAll` are disabled. | `04.DirectTransferBypass.test.js` (3 tests, including "does not block the authorised internal transfer") |
| P0-3 | Approval workflow stalls; in-contract QBFT phases | The QBFT phase simulation is removed from the contract and frontend (`qbftConsensus.js` deleted). There is one M-of-N threshold, and execution is automatic when it is reached. `ApprovalsQueue` lists every PENDING request and every APPROVED-but-blocked request, with approval progress. | `05.ApprovalIntegrity.test.js`; `src/govtech/pages/ApprovalsQueue.js`; `src/chain/abi.test.js` |
| P0-4 | Mnemonic phrases collected, stored and recoverable | Feature deleted end-to-end (UI, localStorage, backend route, controller, model, CBC key). Approvals are wallet transactions or EIP-712 signatures checked on-chain. | `SECURITY_EVIDENCE.md` §1; `08.securityEvidence.test.js`; `/api/signatures/*` returns 404 |
| P0-5 | Secrets and private keys in the archive | No secrets in this repository or its history. Secrets are generated locally (`gen:secrets`, `network:setup`), the server refuses to start with missing or placeholder secrets, and `.gitignore` is hardened. **Rotation of the credentials exposed in the old archive must be done by the student** (checklist in SECURITY_EVIDENCE §2). | `01.config.test.js`; `08.securityEvidence.test.js` |
| P0 (plan) | Remove raw personal data from contract state | `UserProfile` replaced by `IdentityRegistry` (pseudonymous, hashes only). | `08.IdentityPrivacy.test.js` |
| P0 (plan) | Require backend authentication and RBAC | Global auth guard; RBAC always enforced (see P1-3). | `02`, `03` backend tests |
| P0 (plan) | Real Hardhat tests | 154 contract tests replace the default `Lock` test. | `blockchain/test/*` |

## P1: before formal evaluation

| # | Finding | Change | Evidence |
|---|---|---|---|
| P1-1 | Raw personal data on-chain; two contradictory identity models | A single `IdentityRegistry`: subjectId, credentialHash, issuerRef and status only. Personal data lives in MongoDB. The anchor endpoint returns salted hashes. | `08.IdentityPrivacy.test.js`; E2E check 7 |
| P1-2 | Pending duplicate parcel requests; input not normalised | On-chain `normalizeParcelNumber`, with the canonical key reserved at submission and released on rejection or cancellation. `surveyHash` (the surveyor's plan) is required. The backend mirrors normalisation and has a test for it. | `02.DuplicatePrevention.test.js` (5); backend `06.chainService.test.js`; reliability duplicate 50/50 |
| P1-3 | Permissive backend authorisation; signature routes unprotected | Authentication required by default. RBAC has no "would-deny" mode. Self-registration is CITIZEN-only. Wallet bound by signed challenge. Legacy unauthenticated routes removed (`/profiles/store`, `/transacs`, `/signatures`). | `02`, `03`, `04` backend tests |
| P1-4 | Dispute and encumbrance modules do not govern transfers | `LandRegistry` checks `DisputeRegistry` and `EncumbranceRegistry` at submission **and** execution. APPROVED requests with a blocker defer, and `execute()` runs once the blocker is cleared. | `07.DisputeEncumbrance.test.js` (9) |
| P1-5 | Fragmented role management | One `RoleAuthority` (AccessControl with a delayed two-step admin), shared by every contract. Institutional role map in `Roles.sol`. | `06.RoleEnforcement.test.js` ("one role authority shared", "revoking … removes the permission everywhere", admin transfer) |
| P1-6 | Inconsistent architecture (Besu / Fabric / Quorum / Ganache / IPFS) | Single Besu QBFT network with 4 validators, a working scaffold, permissioning and a fault-tolerance script. No other frameworks remain. | `ARCHITECTURE.md`; `network/`; fault-tolerance log |
| P1-7 | Tests and reproducibility missing | Hardhat (154), backend (122), frontend (3), full-stack E2E (23), browser E2E (6), reliability, benchmark, and a clean setup guide. | `TESTING_AND_EVALUATION.md`; `GETTING_STARTED_WINDOWS.md`; `USER_GUIDE.md` |
| P1 (plan) | Real encrypted document storage | AES-256-GCM document store. Only the keccak256 hash goes on-chain. Tampering is detected. | `05.documents.test.js`; E2E checks 20–21 |

## P2: before dissertation submission

| # | Finding | Change | Evidence |
|---|---|---|---|
| P2-1 | Parallel and legacy paths | Deleted: legacy dApp (`App.js`, `ValidatorDashboard`, `RegistrationModal`, `constants/*` ABI, `utils/mongo.js`, the `/legacy/admin` route) and legacy routes. Fake transaction hashes in title revoke and amend are removed; ownership cannot be amended off-chain. CSV import creates drafts only. | `git diff`; `08.securityEvidence.test.js` |
| P2-2 | Documentation overstates completion | The README and docs label the work *prototype* / *partial implementation*. Limitations are listed. UI "demo data" fallbacks and fake certificate data are removed; certificates are verified against `ownerOf`. | `README.md`; `LIMITATIONS.md` |
| P2-3 | Repository hygiene | No logs, network data, database files, node_modules or keys are committed. Create the clean archive with `npm run archive` (`git archive` of tracked files only, with a check for stray secrets). | `.gitignore`; `SECURITY_EVIDENCE.md` §2 |
| P2 (plan) | Traceability matrix | This document. | — |

## Section 9: next prototype submission

| # | Deliverable | Where |
|---|---|---|
| 1 | Clean source archive | `npm run archive` (scripts/make-clean-archive.js) |
| 2 | Single architecture statement | `README.md` (table) and `docs/ARCHITECTURE.md` |
| 3 | Working vertical slice | `npm run demo:besu`; `evidence/…/demo-vertical-slice-besu.json` |
| 4 | Automated tests with commands, counts, results | `docs/TESTING_AND_EVALUATION.md` §1 |
| 5 | Security evidence | `docs/SECURITY_EVIDENCE.md` |
| 6 | Four-validator demonstration | `network/`; `npm run network:fault-test`; `evidence/…/fault-tolerance.txt` |
| 7 | Demonstration guide | `docs/GETTING_STARTED_WINDOWS.md`, `docs/GETTING_STARTED_MACOS.md`, `docs/USER_GUIDE.md` |
