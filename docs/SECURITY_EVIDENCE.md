# Security evidence (supervisor item 9.5)

## 1. Mnemonic / seed-phrase handling removed

| Removed | Replaced by |
|---|---|
| `src/utils/signatureStorage.js` (mnemonic hashed, kept in localStorage, sent to backend) | nothing. Approvals are wallet transactions or EIP-712 signatures. |
| Mnemonic input in `src/components/ValidatorDashboard.js` (legacy dApp, `src/App.js`) | `src/govtech/pages/ApprovalsQueue.js` (on-chain M-of-N) |
| `backend/routes/signatures.js`, `controllers/signatureController.js`, `models/Signature.js` (stored the phrase encrypted and returned it decrypted) | deleted. `POST /api/signatures/store` now returns 404. |
| AES-CBC key derived from a default string (`DEFAULT_TEST_KEY_MUST_CHANGE`) | AES-256-GCM with a mandatory random 256-bit `ENCRYPTION_KEY`, used for documents only |
| `src/utils/qbftConsensus.js` (in-app QBFT phase simulation) | deleted. Consensus is Besu QBFT. |

**Automated proof:** `backend/test/08.securityEvidence.test.js` scans the code in `backend/` and
`src/` (comments excluded). It fails if any of these appear:

* mnemonic, seed-phrase or HD-wallet code
* browser-storage writes of signatures or keys
* random "transaction hashes"
* hard-coded private keys or connection-string credentials
* any of the deleted files

The frontend test `src/chain/abi.test.js` asserts that the contract ABI has no mnemonic
parameters and no PREPARE, COMMIT or FINALIZED functions.

## 2. Credentials and keys

* This repository's history (`git log --all`) contains no `.env` files, private keys or database
  credentials. `.gitignore` excludes `.env`, `network/generated/` (all node and account keys),
  deployments, evidence and the encrypted document store.
* The backend refuses to start without strong `JWT_SECRET`, `ENCRYPTION_KEY` and
  `PSEUDONYM_SALT` (tested in `01.config.test.js`). `npm run gen:secrets` creates them locally.
* Besu node keys and development accounts are generated per machine by
  `npm run network:setup` and are never committed.

**Action still required by the student (cannot be done from code):** the *submitted archive* the
supervisor reviewed contained real deployment and database credentials, encryption material and
validator or network keys. Each of them must be **revoked and rotated**:

1. MongoDB Atlas: delete the exposed database user and create a new one. Also review the IP
   access list.
2. Any RPC, API or hosting tokens found in the old archive: revoke them and issue new ones.
3. The old `ENCRYPTION_KEY` and JWT secret: discard them. Data encrypted with the old key
   (mnemonics) must be **deleted**, not migrated.
4. Old validator and node keys: discard them. `npm run network:setup` generates a fresh network.
5. If the old archive was pushed to any remote, rewrite that history (`git filter-repo`) or
   delete the repository, then submit a clean archive made with `git archive` (see TRACEABILITY
   P2).

## 3. Raw personal data removed from the chain

* `UserProfile` (name, email, telephone, address, date of birth on-chain) is **replaced** by
  `IdentityRegistry`. That contract stores only `subjectId`, `credentialHash`, `issuerRef`,
  `status` and `updatedAt`. There is one identity model.
* `test/08.IdentityPrivacy.test.js` walks the whole contract ABI and fails if any personal-data
  field name appears.
* The identity anchor endpoint returns only salted hashes (E2E check 7).

## 4. Protected routes reject anonymous users

* `backend/test/02.authentication.test.js` sends 35 protected endpoint and method combinations
  without a token; all return **401**. It also rejects tokens with the wrong secret, expired
  tokens, unsigned (`alg=none`) tokens and malformed headers.
* `backend/test/03.authorization.test.js` covers 18 restricted endpoints: a `CITIZEN` receives
  **403** on each. An unverified wallet claim is ignored. On-chain-backed writes require a
  verified wallet.
* `backend/test/04.registration.test.js`: registration that requests `ADMIN` still creates a
  `CITIZEN`. Wallets can only be bound by signature, the challenge is single-use and expires, and
  a wallet cannot be taken from another account.
