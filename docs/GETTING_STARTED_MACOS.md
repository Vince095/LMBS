# Getting started on macOS (and Linux)

This is the macOS version of [GETTING_STARTED_WINDOWS.md](GETTING_STARTED_WINDOWS.md). The steps
are the same, only the installation differs. The project commands (`npm run …`) are identical on
every platform.

> Type commands **without** a trailing `# comment`. zsh does not treat `#` as a comment unless
> you run `setopt interactive_comments`.

## 1. Install the tools (Homebrew)

```bash
brew install git node@22
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Java and Besu.** Pick one of the two options.

**Option A: Besu 25.9.0 with Java 21 (the tested combination)**

```bash
brew install openjdk@21
curl -L -o ~/Downloads/besu-25.9.0.tar.gz https://github.com/hyperledger/besu/releases/download/25.9.0/besu-25.9.0.tar.gz
mkdir -p ~/besu && tar xzf ~/Downloads/besu-25.9.0.tar.gz -C ~/besu
echo 'export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"' >> ~/.zshrc
echo 'export BESU_BIN="$HOME/besu/besu-25.9.0/bin/besu"' >> ~/.zshrc
source ~/.zshrc
"$BESU_BIN" --version
```

**Option B: Homebrew's latest Besu.** It needs the matching (newer) Java.

```bash
brew install openjdk
brew tap hyperledger/besu
brew install hyperledger/besu/besu
echo 'export JAVA_HOME="$(brew --prefix openjdk)/libexec/openjdk.jdk/Contents/Home"' >> ~/.zshrc
source ~/.zshrc
besu --version
```

If `besu --version` says *Java version must be at least N*, the `JAVA_HOME` line is not active.
Open a new terminal, or check that `java -version` reports N or later.

Install **MetaMask** in Chrome, Brave or Firefox.

On Linux, install Node 22, MongoDB 7+, and Temurin/OpenJDK 21 with your package manager. Then
follow Option A, using the same `.tar.gz`.

## 2. Get the code and install dependencies

```bash
git clone https://github.com/Vince095/LMBS.git ~/lmbs
cd ~/lmbs
git checkout supervisor-fixes
(cd blockchain && npm ci)
(cd backend && npm ci)
npm ci
```

## 3. Everything else

Follow the Windows guide from **section 6** onwards. Wherever it says `C:\lmbs`, use `~/lmbs`.
The commands are the same, for example:

```bash
cd ~/lmbs/blockchain && npm test
cd ~/lmbs && npm run network:setup && npm run network:start
cd ~/lmbs/blockchain && npm run deploy:besu && npm run demo:besu
cd ~/lmbs/backend && npm run gen:secrets && npm run create-admin -- --email admin@laa.test --password "choose-a-long-passphrase" && npm start
cd ~/lmbs && npm start
```

To open the test accounts file: `open -a TextEdit ~/lmbs/network/generated/accounts.json`.
