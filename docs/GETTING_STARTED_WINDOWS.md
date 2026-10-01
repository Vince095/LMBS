# Getting started on Windows

This guide takes a new user from a clean Windows 10 or 11 PC to a running LMBS prototype. At the
end you will have a 4-validator blockchain, the backend API, and the web portal running. It takes
about 45 minutes the first time, mostly downloads.

> All accounts, keys and data in this guide are **synthetic test data** for a local machine.
> Never reuse the generated keys anywhere else.

**Contents**

1. [What you will install](#1-what-you-will-install)
2. [Prepare PowerShell](#2-prepare-powershell)
3. [Install the tools](#3-install-the-tools)
4. [Get the code](#4-get-the-code)
5. [Install the project dependencies](#5-install-the-project-dependencies)
6. [Run the automated tests](#6-run-the-automated-tests)
7. [Create and start the blockchain network](#7-create-and-start-the-blockchain-network)
8. [Deploy the contracts and run the demo](#8-deploy-the-contracts-and-run-the-demo)
9. [Start the backend](#9-start-the-backend)
10. [Start the web portal](#10-start-the-web-portal)
11. [Use the portal](#11-use-the-portal)
12. [Daily start and stop](#12-daily-start-and-stop)
13. [Troubleshooting](#13-troubleshooting)
14. [Alternative: Docker Desktop instead of Java and Besu](#14-alternative-docker-desktop-instead-of-java-and-besu)

---

## 1. What you will install

| Tool | Version | Why |
|---|---|---|
| Git | any recent | download the code |
| Node.js | 22 LTS | runs the contracts' tests, backend, portal and helper scripts |
| Java (Eclipse Temurin JDK) | **21** | needed by Hyperledger Besu 25.9.0 |
| Hyperledger Besu | **25.9.0** | the blockchain nodes (4 validators) |
| MongoDB Community Server | 7 or 8 | off-chain database for users, documents and read models |
| MetaMask | latest | browser wallet used to sign approvals and requests |

Use exactly **Besu 25.9.0 with Java 21**. Newer Besu releases need a newer Java (25+). The
project was tested on 25.9.0.

You need about 3 GB of free disk space and 8 GB of RAM. The four Besu nodes use about 500 MB each.

## 2. Prepare PowerShell

Open **Windows Terminal** (or PowerShell) **as your normal user**, not as Administrator unless a
step says so.

Type each command block exactly as shown and press Enter after each line.

npm commands fail in PowerShell when script execution is disabled (the error is *"running scripts
is disabled on this system"*). Allow scripts for your user once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Answer `Y` if asked.

## 3. Install the tools

`winget` comes with Windows 10 (1809+) and 11. Run:

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id EclipseAdoptium.Temurin.21.JDK -e
winget install --id MongoDB.Server -e
```

**Close Windows Terminal and open it again** so that the new programs are found.

### 3.1 Point Windows at Java 21

Besu uses `JAVA_HOME` if it is set. Set it to the Java 21 you just installed:

```powershell
$jdk = (Get-ChildItem "C:\Program Files\Eclipse Adoptium" -Directory | Where-Object Name -like "jdk-21*" | Select-Object -First 1).FullName
[Environment]::SetEnvironmentVariable("JAVA_HOME", $jdk, "User")
$env:JAVA_HOME = $jdk
& "$env:JAVA_HOME\bin\java.exe" -version
```

The last line must print `openjdk version "21...`.

### 3.2 Install Besu 25.9.0

1. Download **besu-25.9.0.zip** from
   https://github.com/hyperledger/besu/releases/tag/25.9.0 (under *Assets*).
2. Unzip it to `C:\besu`. You should now have `C:\besu\besu-25.9.0\bin\besu.bat`.
3. Tell the project where Besu is:

```powershell
[Environment]::SetEnvironmentVariable("BESU_BIN", "C:\besu\besu-25.9.0\bin\besu.bat", "User")
$env:BESU_BIN = "C:\besu\besu-25.9.0\bin\besu.bat"
& $env:BESU_BIN --version
```

The last line must print something like `besu/v25.9.0/windows-x86_64/openjdk-java-21`.

### 3.3 Check MongoDB

The MongoDB installer sets MongoDB up as a Windows service that starts automatically. Check it:

```powershell
Get-Service MongoDB
```

`Status` must be `Running`. If it is `Stopped`, open PowerShell **as Administrator** and run
`Start-Service MongoDB`.

### 3.4 Install MetaMask

Install the **MetaMask** extension in Chrome or Edge from https://metamask.io and create a wallet.
For this prototype the wallet only holds test accounts.

### 3.5 Check everything

```powershell
git --version
node --version
& $env:BESU_BIN --version
Get-Service MongoDB
```

`node --version` must show v22 or later.

## 4. Get the code

Use a short folder path without spaces, for example `C:\lmbs`.

**Option A, from GitHub:**

```powershell
git clone https://github.com/Vince095/LMBS.git C:\lmbs
cd C:\lmbs
git checkout supervisor-fixes
```

**Option B, from the source zip** you were given: unzip it to `C:\lmbs`, then:

```powershell
cd C:\lmbs
```

All the following commands start in `C:\lmbs` unless a step says otherwise.

## 5. Install the project dependencies

```powershell
cd C:\lmbs\blockchain
npm ci
cd C:\lmbs\backend
npm ci
cd C:\lmbs
npm ci
```

This downloads a few hundred MB. Warnings about deprecated packages are normal.

## 6. Run the automated tests

These run without the network or database.

```powershell
cd C:\lmbs\blockchain
npm test
```

Expected: **154 passing**. The first run downloads the Solidity compiler. If that download is
blocked on your network, use `npm run test:offline` instead.

```powershell
cd C:\lmbs\backend
npm test
```

Expected: **Tests: 122 passed, 122 total**.

## 7. Create and start the blockchain network

```powershell
cd C:\lmbs
npm run network:setup
```

This creates the four validator keys, the genesis file, the node and account allowlists, and 12
synthetic test accounts in `network\generated\`. Only run it **once**. Running it again creates a
brand-new, empty network.

Start the four validators:

```powershell
npm run network:start
```

Wait for `Producing blocks (block N)`. It usually takes 20–90 seconds.

> **Windows Firewall** may ask whether Java may communicate on networks. Everything runs on your
> own PC (127.0.0.1), so you can allow *Private networks* or simply cancel.

Check the nodes at any time:

```powershell
npm run network:status
```

All four nodes should show a block number and `peers 3` (node1) or at least `peers 1`.

## 8. Deploy the contracts and run the demo

```powershell
cd C:\lmbs\blockchain
npm run deploy:besu
npm run demo:besu
```

The deploy step prints five contract addresses and copies them to the backend and the portal. The
demo walks through the full workflow and must end with **`Result: PASS`**.

## 9. Start the backend

Open a **new terminal tab** (keep the first one free for later commands):

```powershell
cd C:\lmbs\backend
npm run gen:secrets
npm run create-admin -- --email admin@laa.test --password "choose-a-long-passphrase"
npm start
```

* `gen:secrets` creates `backend\.env` with random secrets. Run it **once only**.
* `create-admin` creates the first administrator. Run it **once only**. Use your own password of
  at least 12 characters, and remember it.
* `npm start` must show `LMBS backend listening on :5000` and then `[db] connected: lmbs_db`.

Leave this tab open. Closing it stops the backend.

Optional end-to-end check, run in another tab while the backend is running:

```powershell
cd C:\lmbs\backend
npm run e2e -- --email admin@laa.test --password "choose-a-long-passphrase"
```

Expected: **23/23 checks passed**.

## 10. Start the web portal

Open another **new terminal tab**:

```powershell
cd C:\lmbs
npm start
```

The portal opens at **http://localhost:3000**. Leave this tab open.

## 11. Use the portal

### 11.1 Import test accounts into MetaMask

1. Open the test accounts file:
   ```powershell
   notepad C:\lmbs\network\generated\accounts.json
   ```
2. In MetaMask, choose **account menu → Add account or hardware wallet → Import account**. Paste
   the `privateKey` value (the text starting with `0x`) for each of these labels:
   `registrar`, `approver-laa`, `approver-survey`, `approver-deeds`, `citizen-alice` and
   `citizen-bob`.
3. Rename each MetaMask account to its label so that you can tell them apart.

The first time the portal connects, MetaMask asks to add the **LMBS Besu QBFT** network (chain ID
2026). Approve it. To add it by hand instead, use RPC URL `http://127.0.0.1:8545`, chain ID
`2026` and currency symbol `ETH`.

### 11.2 Create portal users and give them roles

1. In the portal, click **Register** and create one account each for: Registrar, LAA Approver,
   Survey Approver, Deeds Approver and Alice. Use any e-mail addresses. Passwords need at least
   10 characters.
2. Log in as `admin@laa.test`, open **Admin panel**, and set these roles:
   * Registrar → **REGISTRY_OFFICER**
   * each approver → **NOTARY** or **SURVEYOR**
   * Alice stays **CITIZEN**
3. Log out.

### 11.3 Link each person's wallet

Repeat for every person:

1. In MetaMask, select that person's account.
2. Log in to the portal as that person.
3. Open **Blockchain registry**, click **Connect wallet**, then **Link this wallet to my account**.
4. MetaMask asks you to **sign** a message. This is free and is not a transaction.
5. The Wallet panel now shows the on-chain role (for example *Registrar* or *Approver*). Log out.

### 11.4 Register a parcel (as the Registrar)

1. Select the `registrar` account in MetaMask and log in as Registrar.
2. Open **Register New Title**.
3. **Step 1:** enter Alice's name. In *Beneficiary wallet address*, paste Alice's `address` from
   `accounts.json`.
4. **Step 2:** enter a parcel number such as `13283-001`, a district and an area.
5. **Step 3:** upload any PDF and set its type to **Survey Plan**.
6. **Step 4:** click **Sign and Submit** and confirm the transaction in MetaMask.

The parcel now shows as *pending approval*.

### 11.5 Approve it (three approvers)

For each of the three approvers:

1. Select the approver's account in MetaMask and log in as that approver.
2. Open **Approvals** and click **Approve** on the request. Confirm in MetaMask.

After the third approval the request shows **EXECUTED**. A few seconds later the parcel is
**ACTIVE**, and its certificate shows as verified against the blockchain.

### 11.6 Transfer the title (as Alice)

1. Select `citizen-alice` in MetaMask and log in as Alice.
2. Open **Blockchain registry**. Under *Titles held by this wallet*, click **Start transfer**.
3. Paste Bob's `address` as the buyer, attach a PDF of type **Deed of Sale**, and submit.
4. Three approvers approve it as in 11.5. The owner changes to Bob.

## 12. Daily start and stop

**Stop** everything:

1. Press `Ctrl+C` in the backend tab and in the portal tab.
2. In any tab, run:

```powershell
cd C:\lmbs
npm run network:stop
```

**Start again** next time. Do **not** run `network:setup` or `deploy:besu` again; the chain keeps
its data.

```powershell
cd C:\lmbs
npm run network:start
```

Then, in separate tabs:

```powershell
cd C:\lmbs\backend
npm start
```

```powershell
cd C:\lmbs
npm start
```

**Start completely fresh** (new empty chain): stop everything, then run `npm run network:setup`,
`npm run network:start`, and (in `blockchain`) `npm run deploy:besu`. Restart the backend. In
MetaMask, clear the old transaction history: **Settings → Advanced → Clear activity tab data**.

## 13. Troubleshooting

| Message or problem | Cause and fix |
|---|---|
| `running scripts is disabled on this system` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (section 2). |
| `Besu was not found or did not start` | `BESU_BIN` is not set, or a new terminal was not opened after setting it. Repeat 3.2 and open a new terminal. |
| `This Besu needs Java 25 but Java 17 is active` (any numbers) | Java and Besu versions do not match. Use Besu 25.9.0 with Java 21 and set `JAVA_HOME` (3.1). |
| `npm run network:start` stays at `Waiting for blocks` for more than 3 minutes | Check `network\generated\logs\node1.log`. Common causes: another program uses port 8545 or 30303 (close it or restart Windows), or a firewall product blocks local connections. |
| `The network appears to be running` during setup | Run `npm run network:stop` first. |
| Backend: `Insecure configuration` | `backend\.env` is missing; run `npm run gen:secrets` in `backend`. |
| Backend: `MongoDB connection failed` | MongoDB is not running: `Get-Service MongoDB`; start it as Administrator with `Start-Service MongoDB`. |
| Portal: *Blockchain network not configured* | Run `npm run deploy:besu` in `blockchain`, then restart the backend. |
| Portal: *Your wallet does not hold the on-chain role…* | The wrong MetaMask account is selected for the logged-in person. |
| Portal: *The connected wallet is not the one linked…* | Switch MetaMask to the account linked to this portal user, or link the selected one. |
| Portal: *That wallet has no verified identity* | The beneficiary or buyer address is not one of the test citizens. Use the `citizen-…` addresses from `accounts.json`. |
| MetaMask: *nonce too high* or transactions stuck after a fresh network | MetaMask → Settings → Advanced → **Clear activity tab data**. |
| Login: `Too many attempts` | The login limit is 20 per 15 minutes. Wait, or for automated testing set `AUTH_RATE_LIMIT=1000` in `backend\.env` and restart the backend. |
| `npm ci` fails with `EPERM` or `EBUSY` | Close editors or terminals that are using the folder (or pause antivirus scanning of `C:\lmbs`) and run it again. |

## 14. Alternative: Docker Desktop instead of Java and Besu

If you prefer not to install Java and Besu, install **Docker Desktop** (it uses WSL 2):
`winget install --id Docker.DockerDesktop -e`. Start Docker Desktop, then:

```powershell
cd C:\lmbs
npm run network:setup:docker
cd C:\lmbs\network
docker compose up -d
cd C:\lmbs
npm run network:status
```

Continue from step 8. To stop the network, run `docker compose down` in `C:\lmbs\network`.
`npm run network:fault-test` also works in Docker mode. The recorded test runs used native Besu;
this Docker file mirrors the same settings.

---

Next: [USER_GUIDE.md](USER_GUIDE.md) covers evaluation runs (reliability, benchmark, fault
tolerance) and the browser end-to-end test, and [ARCHITECTURE.md](ARCHITECTURE.md) explains
how the system works.
