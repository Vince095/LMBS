# Testing and evaluation

The recorded run was made on **24 September 2026** in a 2-vCPU / 8 GB Linux container. It used
4 native Besu 25.9.0 validators, and FerretDB 1.24 as a MongoDB-compatible database for the
full-stack run. Raw outputs are in [evidence/2026-09-24-sample-run/](evidence/2026-09-24-sample-run/).
**Repeat these runs on the evaluation machine before reporting results in the dissertation.**
Timings depend on hardware.

## 1. Commands and counts

| Suite | Command | Result |
|---|---|---|
| Contracts (Hardhat) | `cd blockchain && npm test` | **154 passing** |
| Contract coverage | `cd blockchain && npm run coverage` | 100% lines, 100% functions, 99.37% statements, 87.13% branches |
| Backend (Jest + Supertest) | `cd backend && npm test` | **122 passing** (8 suites) |
| Frontend (Jest) | `CI=true npx react-scripts test --watchAll=false` | 3 passing |
| Frontend build | `CI=true npm run build` | compiles, no warnings |
| Vertical slice on Besu | `cd blockchain && npm run demo:besu` | PASS |
| Full-stack E2E | `cd backend && node scripts/e2e-full-stack.js` | **23/23** |
| Browser E2E (Playwright, real portal) | `cd e2e && npm ci && npm test` | **6/6**: wizard → wallet-signed submit → 3 approvals in the Approvals page → executed + indexed |

## 2. Minimum test and evaluation package (supervisor section 8)

| Test area | Scenario | Evidence | Result |
|---|---|---|---|
| Registration success | Valid request, 3-of-4 approvals, one title created | `test/01.Registration.test.js`: one `RequestExecuted` event, `ownerOf`, `titleHistory`; demo step 4 | PASS |
| Duplicate prevention | Same canonical parcel twice, including while the first is PENDING or APPROVED, and after registration; reformatted numbers | `test/02.DuplicatePrevention.test.js`; demo step 2; reliability "duplicate" 50/50 | PASS |
| Owner-only transfer | A non-owner, a validator, the registrar and governance try to initiate | `test/03.OwnerTransfer.test.js` (section 3); demo step 5 | PASS (all rejected) |
| Governed transfer | Owner initiates, approvals reach threshold | `test/03.OwnerTransfer.test.js` (section 4): ownership changes once, history `[1,2]`, a 4th vote is refused | PASS |
| Direct-transfer bypass | `transferFrom`, both `safeTransferFrom`, `approve`, `setApprovalForAll` | `test/04.DirectTransferBypass.test.js`; reliability "bypass" 50/50; the governed transfer still works afterwards | PASS |
| Approval integrity | Duplicate approval, reused signature or nonce, expired signature, unauthorised signer (citizen, registrar, revoked approver), wrong role, forged document hash, wrong chain id or contract, conflict of interest | `test/05.ApprovalIntegrity.test.js` (10 cases) | PASS (all rejected) |
| Role enforcement | 8 actors × 13 restricted actions | `test/06.RoleEnforcement.test.js` (104 cases + shared-authority + admin-transfer tests); backend `03.authorization.test.js` | PASS |
| Dispute and encumbrance | Transfer attempted with an open dispute, mortgage, lien or caveat; servitude; a caveat lodged after approval | `test/07.DisputeEncumbrance.test.js`: blocked until resolved or discharged, deferred execution, `execute()` after discharge | PASS |
| Document integrity | Change one byte of an encrypted off-chain document | backend `05.documents.test.js`; E2E check "one modified byte … detected" | PASS (GCM authentication failure + hash mismatch) |
| Fault tolerance | Stop one validator of four | `network/scripts/fault-tolerance.sh`; full demo with node4 stopped | PASS (see section 4) |
| Reliability | Each core operation 50 times | `npm run reliability:besu` | **200/200 (100%)**, 0 failures |
| Performance | Registration and transfer workloads | `npm run benchmark:besu` | see section 3 |

## 3. Performance (Besu, 4 validators, 2 s block period, 40 requests, concurrency 4)

| Operation | n | p50 | p95 | p99 |
|---|---|---|---|---|
| submitRegistration (send → receipt) | 40 | 2.22 s | 2.35 s | 2.36 s |
| approveRequest | 240 | 2.06 s | 2.24 s | 2.32 s |
| submitTransfer | 40 | 1.94 s | 2.25 s | 2.27 s |
| Registration end-to-end (submit + 3 approvals) | 40 | 7.98 s | 8.16 s | 8.98 s |
| Transfer end-to-end (submit + 3 approvals) | 40 | 8.04 s | 8.26 s | 8.28 s |

* Throughput was 1.99 transactions/s over 320 transactions. That is 0.49 completed registrations
  per second and 0.50 completed transfers per second. The failure rate was **0%**.
* Resource use per validator was about 6–11% CPU and 465–532 MB RSS.
* **How to read these numbers:** latency is bounded by the 2-second QBFT block period. Each
  request needs four transactions from different institutions, applied in sequence. The run used
  only 4 client workers, so this measures the *workflow*, not the capacity of Besu. For the
  dissertation, repeat on the evaluation hardware. Optionally point Hyperledger Caliper at the
  same network for a standardised report.

## 4. Fault tolerance (QBFT, N = 4, f = 1, quorum 3)

From `evidence/2026-09-24-sample-run/fault-tolerance.txt`:

| Validators running | Blocks produced in 16 s |
|---|---|
| 4 of 4 | +8 |
| 3 of 4 (node4 stopped) | +6, network continues |
| 2 of 4 (node3 also stopped) | +0, halts safely (liveness limit reached; no forks) |
| 4 of 4 again (restarted) | production resumed after about 40 s (JVM start-up plus QBFT round-change back-off) |

A complete registration and transfer workflow also passed with node4 stopped
(`demo-vertical-slice-besu-node4-stopped.json`).

## 5. Full-stack E2E checks (23)

These ran against the real API, database, Besu network and indexer. Covered: admin bootstrap, and
self-registration that cannot escalate a role. Wallet linking by signature, with no wallet
hijacking. Identity anchor with no personal data, anchored on-chain. Encrypted documents. The
backend accepting a registration only after verifying the on-chain transaction, and refusing
other users' or fabricated transaction hashes. The indexer activating parcel and deed. The
certificate verified against `ownerOf`. The governed transfer recorded, the retired off-chain
"advance" returning 410, and the transfer completing. The certificate showing the new owner. The
document integrity check and tamper detection. Anonymous and citizen access refused.
