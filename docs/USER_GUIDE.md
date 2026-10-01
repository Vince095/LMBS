# User guide: commands, evaluation and testing

Install first: [Windows](GETTING_STARTED_WINDOWS.md) · [macOS / Linux](GETTING_STARTED_MACOS.md).
The commands below work in PowerShell, cmd, bash and zsh. Run them from the folder shown.

## 1. Command reference

### Repository root (`C:\lmbs` or `~/lmbs`)

| Command | What it does |
|---|---|
| `npm run network:setup` | Create a **new** 4-validator Besu network in `network/generated/` (keys, genesis, allowlists, 12 test accounts). This erases the previous one. |
| `npm run network:start` | Start the 4 validators and wait until blocks are produced |
| `npm run network:status` | Block height, peers and process for each node |
| `npm run network:stop` | Stop all validators |
| `npm run network:fault-test` | QBFT fault-tolerance demonstration (4 → 3 → 2 → 4 validators) |
| `node network/lmbs-network.js stop-node 4` / `start-node 4` | Stop or start one validator |
| `npm run network:setup:docker` | Same as setup, for `docker compose` (see the install guides) |
| `npm start` | Web portal on http://localhost:3000 |
| `npm run build` | Production build of the portal |
| `npm run test:ci` | Portal unit tests |
| `npm run archive` | Clean source zip of the last commit, for submission |

### `blockchain/`

| Command | What it does |
|---|---|
| `npm test` | 154 contract tests (`npm run test:offline` if the compiler download is blocked) |
| `npm run coverage` | Solidity coverage report |
| `npm run deploy:besu` | Deploy the contracts, grant roles, anchor the test citizens' identities, export addresses to the backend and portal |
| `npm run demo:besu` | Scripted vertical slice; must end with `Result: PASS` |
| `npm run reliability:besu` | Each core operation 50 times |
| `npm run benchmark:besu` | Throughput and p50/p95/p99 latency (40 requests, 4 workers) |

Results are written as JSON to `blockchain/evidence/`.

### `backend/`

| Command | What it does |
|---|---|
| `npm run gen:secrets` | Create `.env` with random secrets (once) |
| `npm run create-admin -- --email E --password P` | Create or promote the first administrator |
| `npm start` | API on http://localhost:5000 (also starts the chain indexer) |
| `npm test` | 122 API and security tests (no database needed) |
| `npm run lint` | Code style and unused-code check |
| `npm run e2e -- --email E --password P` | 23 full-stack checks against the running API, database and blockchain |

### `e2e/` (browser test)

```
cd e2e
npm ci
npx playwright install chromium
npm test -- --email admin@laa.test --password "your-admin-password"
```

The portal (`npm start`) and backend must be running. A built-in test wallet replaces MetaMask.
The test drives the registration wizard and three approvals in a real browser. Expected:
**6/6 UI checks passed**. For repeated runs, set `AUTH_RATE_LIMIT=1000` in `backend/.env`.

## 2. Roles

| Portal role (backend) | On-chain role (wallet) | Typical person | Can do |
|---|---|---|---|
| CITIZEN | none (identity anchored) | land owner | view own titles, start a transfer of own title, cancel own request |
| REGISTRY_OFFICER | REGISTRAR_ROLE | LAA registry officer | submit first registrations, import draft parcels |
| NOTARY / SURVEYOR | APPROVER_ROLE | approving institution | approve or reject requests on the Approvals page |
| REGISTRY_OFFICER | IDENTITY_ISSUER_ROLE | KYC desk | anchor a user's pseudonymous identity (Blockchain registry page) |
| REGISTRY_OFFICER | DISPUTE_OFFICER_ROLE / ENCUMBRANCE_OFFICER_ROLE | dispute office / Deeds Registry | open and close disputes; register and discharge encumbrances |
| AUDITOR | none | auditor | read-only views, audit log |
| ADMIN | DEFAULT_ADMIN_ROLE (governance account) | system administrator | assign portal roles; on-chain roles via the governance account |

Both checks apply. The **portal role** decides which pages a user sees. The **on-chain role** of
the connected wallet decides what the contracts accept. The deploy script gives the test wallets
in `accounts.json` their on-chain roles.

## 3. Evaluation package (supervisor section 8)

With the network running and the contracts deployed:

```
cd blockchain
npm run reliability:besu
npm run benchmark:besu
cd ..
npm run network:fault-test
```

To show that a full workflow succeeds while one validator is down:

```
node network/lmbs-network.js stop-node 4
cd blockchain
npm run demo:besu
cd ..
node network/lmbs-network.js start-node 4
```

To verify a stored document, call `GET /api/documents/<docId>/verify?onChainHash=<hash>`. The
response reports whether the encrypted file is intact and whether it matches the hash recorded
on-chain.

Copy the JSON files from `blockchain/evidence/` and the fault-test log from `network/generated/`
into `docs/evidence/<date>/` for the dissertation. Results recorded so far are in
[TESTING_AND_EVALUATION.md](TESTING_AND_EVALUATION.md).
