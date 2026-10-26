# LMBS: Blockchain Land Registration for Lesotho (Prototype)

> **Status: research prototype.** This code is a *partial implementation*, built to evaluate one
> governed registration and transfer workflow. It is not production-ready. See
> [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for what it does not cover.

MSc project: *Utilizing Blockchain for Land Allocation in Lesotho*. This revision responds to the
supervisor's comments on the revised prototype (9 August 2026). The mapping from each finding to
its fix and evidence is in [docs/TRACEABILITY.md](docs/TRACEABILITY.md).

## Architecture statement

| Concern | Choice in this prototype |
|---|---|
| Ledger | **One permissioned EVM network: Hyperledger Besu with QBFT consensus.** Four validator nodes, one per named institution: LAA, Survey and Physical Planning, Deeds Registry, and the Ministry of Local Government. Node and account allowlists are enforced. Fabric, Quorum, Ganache and public networks are **not** used. |
| Consensus vs. approval | Besu QBFT orders blocks and gives finality. The contracts do **not** simulate QBFT phases. Business approval is a separate **M-of-N institutional threshold** (3 of 4 by default). |
| Contract roles | One `RoleAuthority` (OpenZeppelin AccessControl) is shared by every contract. The roles are governance admin, registrar, approver, identity issuer, dispute officer and encumbrance officer. |
| State-change path | `LandRegistry._execute()` is the **only** place a title is minted or changes owner. Direct ERC-721 transfers and approvals are disabled. Open disputes and mortgages, liens or caveats block both submission and execution. |
| Approvals | Either a direct transaction from an approver's wallet, or an **EIP-712** signature checked by the contract. The signature covers request, parcel, action, decision, document hash, role, nonce, expiry, chain id and contract address. **No mnemonics or seed phrases anywhere.** |
| Identity | `IdentityRegistry` stores only a pseudonymous subject id, a salted credential hash, the issuer reference and a status. **No personal data on-chain.** Personal data stays in MongoDB. A wallet is linked to an account only by signing a challenge. |
| Off-chain storage | Documents are encrypted with AES-256-GCM in the backend document store. Only their keccak256 hash goes on-chain. MongoDB holds user accounts, workflow metadata, and *read models* built from chain events by an indexer. |
| Legal status | A title token is the registry's internal digital record. It does not by itself create legal ownership. |

Full description: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting started

* **Windows:** [docs/GETTING_STARTED_WINDOWS.md](docs/GETTING_STARTED_WINDOWS.md), a step-by-step guide for new users
* **macOS / Linux:** [docs/GETTING_STARTED_MACOS.md](docs/GETTING_STARTED_MACOS.md)
* Commands, roles and evaluation runs: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

Requirements: Node.js 22, Java 21 + Hyperledger Besu 25.9.0 (or Docker Desktop), MongoDB 7+, and
MetaMask. Once they are installed, the same commands work on every platform:

```
cd blockchain && npm ci && npm test && cd ..
cd backend && npm ci && npm test && cd ..
npm ci
npm run network:setup
npm run network:start
cd blockchain && npm run deploy:besu && npm run demo:besu && cd ..
cd backend && npm run gen:secrets && npm run create-admin -- --email admin@laa.test --password "choose-a-long-passphrase" && npm start
npm start
```

(The last two commands run in separate terminals.)

## Repository layout

```
blockchain/   Solidity contracts, Hardhat tests (154), deploy/demo/reliability/benchmark scripts
network/      lmbs-network.js (cross-platform Besu network tool), genesis template, docker-compose.yml
backend/      Express API: auth + RBAC, wallet linking, encrypted documents, chain indexer; Jest tests (122)
src/          React portal with wallet-signed on-chain actions
e2e/          Playwright browser test of the portal
scripts/      make-clean-archive.js (submission zip)
docs/         Install guides, user guide, architecture, testing, security evidence, traceability, limitations
```

## Test results (last full run, 24 Sep 2026)

| Suite | Result |
|---|---|
| Hardhat contract tests | **154 passing**; coverage 100% lines/functions, 99.4% statements, 87.1% branches |
| Backend (Jest + Supertest) | **122 passing** |
| Frontend (Jest) + production build | 3 passing; `CI=true npm run build` compiles with no warnings |
| Vertical slice on Besu (4 validators) | PASS; also PASS with one validator stopped |
| Reliability, 50 runs × 4 operations on Besu | **100%** success (200/200) |
| Fault tolerance | 3 of 4 validators: blocks continue. 2 of 4: halts safely. Recovers when quorum returns. |
| Full-stack E2E (API + DB + Besu + indexer) | **23/23** checks |
| Browser E2E (Playwright drives the portal with a wallet) | **6/6** checks |

Details and how to reproduce them: [docs/TESTING_AND_EVALUATION.md](docs/TESTING_AND_EVALUATION.md).
Raw outputs: [docs/evidence/2026-09-24-sample-run/](docs/evidence/2026-09-24-sample-run/).
