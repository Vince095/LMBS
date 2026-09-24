# Demonstration guide

Exact setup commands, required versions, test accounts and a scripted demonstration sequence.
**All data and keys are synthetic.**

## 1. Required versions

| Tool | Version used for the recorded run | Notes |
|---|---|---|
| Node.js | 22.x (18+ should work) | |
| Java | 21 | required by Besu 25.x |
| Hyperledger Besu | 25.9.0 | macOS: `brew tap hyperledger/besu && brew install hyperledger/besu/besu`. Or use Docker (see 3b). |
| MongoDB | 7.x | local `mongod`, or Docker `mongo:7` |
| MetaMask | any current version | for the portal |

Solidity 0.8.28 (EVM target *cancun*), Hardhat 2.29, OpenZeppelin Contracts 5.6 and ethers 6 are
installed by `npm ci`. If your machine cannot download the Solidity compiler, prefix Hardhat
commands with `HARDHAT_LOCAL_SOLC=1` to use the bundled solcjs.

## 2. Contracts and unit tests

```bash
cd blockchain
npm ci
npm test            # 154 passing
npm run coverage    # optional
```

## 3a. Start the 4-validator Besu network (native)

```bash
network/scripts/setup.sh     # new keys, genesis, allowlists, synthetic accounts -> network/generated/
network/scripts/start.sh     # node1 RPC http://127.0.0.1:8545 (8546-8548 for node2-4)
```

## 3b. Or with Docker

```bash
cd network
MODE=docker scripts/setup.sh
docker compose up -d
```

## 4. Deploy and run the scripted vertical slice

```bash
cd blockchain
npm run deploy:besu   # deploys, grants roles, anchors demo identities, exports ABI + addresses to backend/ and src/
npm run demo:besu     # prints each step and "Result: PASS"; evidence JSON in blockchain/evidence/
```

The demo runs these steps in order:

1. The registrar submits a first registration, and the parcel key is reserved.
2. The same parcel number is submitted again, once as-is and once reformatted. Both are **rejected** (`ParcelUnavailable`).
3. The LAA and Survey approve with direct transactions. The Deeds Registry signs an **EIP-712** approval off-line and the registrar relays it, which reaches the threshold.
4. The title is **minted** to Alice. Replaying the signature is rejected (`NonceAlreadyUsed`).
5. Bob and a validator both try to start a transfer of Alice's title and are **rejected** (`NotTitleHolder`). A direct `transferFrom` is **rejected** (`DirectTransferDisabled`). Alice then submits the transfer.
6. Three approvers approve. Ownership moves to Bob **once**, and the title history is `1, 2`.

## 5. Evaluation scripts (Besu running)

```bash
cd blockchain
RUNS=50 npm run reliability:besu                  # 50 × {registration, duplicate, transfer, bypass}
REQUESTS=40 CONCURRENCY=4 npm run benchmark:besu  # throughput, p50/p95/p99, failures, node CPU/RAM
cd ../network && scripts/fault-tolerance.sh       # 4/4 -> 3/4 -> 2/4 -> recovery
```

To show that a full workflow succeeds with a validator down:
`network/scripts/stop-node.sh 4 && (cd blockchain && npm run demo:besu); network/scripts/start-node.sh 4`

## 6. Backend

```bash
cd backend
npm ci
npm run gen:secrets          # writes backend/.env with fresh random JWT_SECRET, ENCRYPTION_KEY, PSEUDONYM_SALT
npm test                     # 122 passing (no database needed)
ADMIN_EMAIL=admin@laa.test ADMIN_PASSWORD='choose-a-long-passphrase' node scripts/create-admin.js
npm start                    # http://localhost:5000, indexer starts automatically
```

Full-stack check (needs Besu, MongoDB and the backend running):

```bash
ADMIN_EMAIL=admin@laa.test ADMIN_PASSWORD='…' node scripts/e2e-full-stack.js   # 23 checks
```

The login rate limit is 20 attempts per 15 minutes. For repeated automated runs, start the backend
with `AUTH_RATE_LIMIT=1000 npm start`.

Browser test (portal running on :3000). It uses a test wallet provider backed by the synthetic
keys in place of MetaMask:

```bash
cd e2e && npm ci
ADMIN_EMAIL=admin@laa.test ADMIN_PASSWORD='…' npm test                          # 6 checks
```

## 7. Portal (browser demonstration)

```bash
npm ci && npm start          # http://localhost:3000
```

1. In MetaMask, import the synthetic keys you need from `network/generated/accounts.json`
   (for example `registrar`, `approver-laa`, `approver-survey`, `approver-deeds` and
   `citizen-alice`). They are development keys for the local chain only. The portal adds the
   "LMBS Besu" network (chain id 2026, RPC http://127.0.0.1:8545) on first connect.
2. Register a portal account for each person. Log in as the admin and assign roles in the Admin
   panel: `REGISTRY_OFFICER` for the registrar, `NOTARY` or `SURVEYOR` for approvers.
3. Each person opens **Blockchain registry → Wallet → Connect**, then **Link this wallet**. This
   signs a message only; no transaction is sent.
4. **Registrar**: open *Register parcel*. Enter the beneficiary's wallet and attach a *Survey
   Plan*. Submit and confirm in MetaMask. The parcel appears as `PENDING_APPROVAL`.
5. **Approvers**: open *Approvals* and approve. The third approval executes the request, and the
   indexer marks the parcel and deed `ACTIVE`.
6. **Owner**: open *Blockchain registry → Start transfer*. Enter the buyer's wallet, attach a Deed
   of Sale and submit. Approvers approve, and the owner changes.
7. Optional: a dispute officer opens a dispute in the registry console. Any new transfer of that
   parcel is then refused.

## 8. Test accounts

`network/scripts/setup.sh` creates these labelled accounts. The keys are random on every setup
and are never committed.

| Label | On-chain role |
|---|---|
| governance | DEFAULT_ADMIN_ROLE |
| registrar | REGISTRAR_ROLE |
| approver-laa / -survey / -deeds / -ministry | APPROVER_ROLE (4 institutions, threshold 3) |
| identity-issuer | IDENTITY_ISSUER_ROLE |
| dispute-officer | DISPUTE_OFFICER_ROLE |
| encumbrance-officer | ENCUMBRANCE_OFFICER_ROLE |
| citizen-alice / -bob / -carol | none (identities anchored by `deploy`) |

## 9. Stopping

```bash
network/scripts/stop.sh
```
