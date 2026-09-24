# Known limitations (prototype)

The status labels used here are **implemented**, **partial** and **planned**.

## Scope

* **Partial:** only first registration and transfer of a whole title are implemented on-chain.
  Subdivision, consolidation, lease renewal, succession and co-ownership shares are **planned**.
  Off-chain co-ownership percentages exist in the read model, but the chain has one holder per
  title.
* **Partial:** title revocation (`POST /api/titles/:deed/revoke`) is an off-chain annotation
  only, marked `anchored: false`. To stop dealings on-chain, a dispute officer must open a dispute
  on the parcel. An on-chain revocation or court-order function is **planned**.
* A verified citizen may submit a first registration for themselves. While it is pending, the
  parcel number is reserved until approvers reject it (2 rejections) or the applicant cancels.
  Rate limits or a registrar-only submission policy for self-applications are **planned**.
* The off-chain dispute and encumbrance case-management pages (claims, evidence, notes) are
  records only. They govern transfers only when an authorised officer also records the dispute or
  encumbrance on-chain from the Blockchain registry console.

## Identity

* **Implemented:** wallet binding by signed challenge, and pseudonymous identity anchoring by an
  identity issuer.
* **Planned:** W3C Verifiable Credentials, BBS selective disclosure and ZK proofs (see
  `ARCHITECTURE.md` §6). KYC itself is a manual off-chain step.
* Wallet loss or recovery and key rotation for citizens are not implemented. An identity issuer
  can suspend the old wallet, but re-binding a subject to a new wallet is **planned**.

## Network and operations

* All four validators run on one machine in the demonstration. Institutional deployment (separate
  hosts, TLS between nodes, monitoring, backup, validator voting to add or remove members) is
  **planned**.
* Account permissioning uses a local allowlist file. Enrolling a new citizen who must *send*
  transactions requires adding the account on every node (`perm_addAccountsToAllowlist` or a
  new `setup.sh`). Receiving a title needs no enrolment.
* The Docker Compose file mirrors the tested native configuration but was **not** executed in the
  recorded run.
* Development keys live in `network/generated/accounts.json` and MetaMask. Production custody
  (hardware wallets or HSM, multisig governance) is **planned**.
* The governance admin delay is 0 in the prototype. Use ≥ 24 h in any real deployment.

## Backend and data

* Documents are encrypted in a local directory. A private IPFS cluster, backup and key rotation
  for `ENCRYPTION_KEY` are **planned**.
* The indexer polls every 4 s. There is no reorg handling beyond QBFT's immediate finality.
* Backend test coverage is about 69% of lines. The security-critical modules (auth, RBAC, chain
  verification, documents, indexer) are covered. Legacy dashboard, search and provenance
  services are not unit-tested.
* The full-stack E2E run used FerretDB (MongoDB-compatible) in the sandbox. Repeat it on MongoDB
  7 on the evaluation machine.

## Evaluation

* Performance figures come from one 2-vCPU container with 4 client workers. They describe
  workflow latency under a 2 s block period, not system capacity. A Hyperledger Caliper run is
  **planned** for the formal evaluation.
* Usability evaluation with LAA staff and citizens has not yet been carried out.

## UI and language

* New on-chain screens are in English. Sesotho translations for these strings are still to be
  added to `src/i18n/ses.json`; the i18n layer falls back to English.
* The portal needs a browser wallet (MetaMask). Wallet-less, custodial access for citizens is out
  of scope.

## Legal

* The title token is the registry's internal digital record. It does not create or transfer legal
  ownership by itself; that follows the Land Act 2010 and the authorised registry act.
