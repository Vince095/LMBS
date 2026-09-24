/**
 * Scripted demonstration of the complete vertical slice (supervisor item 9.3):
 *   submit request -> reject duplicate -> obtain approvals -> mint title ->
 *   owner initiates transfer -> governed transfer completes.
 * Also shows the bypass attempts that must fail. Uses synthetic data only.
 *
 *   npx hardhat run scripts/demo-vertical-slice.js --network besu
 */
const hre = require('hardhat');
const { actors } = require('./lib/accounts');
const { loadDeployment, contracts, expectedRevert, writeEvidence, VOTE_TYPES } = require('./lib/common');

const STATUS = ['NONE', 'PENDING', 'APPROVED', 'EXECUTED', 'REJECTED', 'CANCELLED'];

async function main() {
    const { ethers, network } = hre;
    const dep = loadDeployment(network.name);
    const a = await actors(ethers);
    const { registry, roles } = { ...(await contracts(ethers, dep)), roles: dep.roles };
    const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));
    const log = [];
    const step = (title, data = {}) => { log.push({ step: title, ...data }); console.log(`\n== ${title}`); for (const [k, v] of Object.entries(data)) console.log(`   ${k}: ${v}`); };
    const send = async (p) => { const r = await (await p).wait(); return { tx: r.hash, block: r.blockNumber }; };

    const [alice, bob] = a.citizens;
    const parcel = `DEMO-${Date.now().toString().slice(-6)}-001`;

    // 1. Submit registration
    let r = await send(registry.connect(a.registrar).submitRegistration(parcel, alice.address, h(`survey:${parcel}`), h(`lease:${parcel}`)));
    const regId = await registry.requestCount();
    const key = await registry.parcelKeyOf(parcel);
    step('1. Registrar submits first registration (parcel reserved)', { parcel, requestId: regId, parcelKey: key, ...r });

    // 2. Duplicate attempts
    const dupVariant = ` ${parcel.toLowerCase().replace('-001', ' - 001')} `;
    const dup = {
        sameNumber: await expectedRevert(registry.connect(a.registrar).submitRegistration, parcel, bob.address, h('x'), h('y')),
        reformattedNumber: await expectedRevert(registry.connect(a.registrar).submitRegistration, dupVariant, bob.address, h('x'), h('y')),
    };
    step('2. Duplicate requests are rejected while the first is pending', { ...dup, variantTried: JSON.stringify(dupVariant) });

    // 3. Approvals: two direct transactions + one EIP-712 signature relayed by the registrar
    r = await send(registry.connect(a.approvers[0]).approveRequest(regId));
    step('3a. LAA approves (direct transaction)', r);
    r = await send(registry.connect(a.approvers[1]).approveRequest(regId));
    step('3b. Survey Department approves (direct transaction)', r);

    const req = await registry.getRequest(regId);
    const latest = await ethers.provider.getBlock('latest');
    const vote = {
        requestId: regId, parcelKey: req.parcelKey, action: 0, decision: 1, documentHash: req.documentHash,
        role: roles.APPROVER_ROLE, nonce: BigInt(Date.now()), deadline: BigInt(latest.timestamp + 3600),
    };
    const domain = { ...dep.eip712, chainId: dep.chainId, verifyingContract: dep.contracts.LandRegistry };
    const sig = await a.approvers[2].signTypedData(domain, VOTE_TYPES, vote);
    r = await send(registry.connect(a.registrar).submitSignedDecision(vote, sig));
    step('3c. Deeds Registry signs an EIP-712 approval off-line; registrar relays it (threshold reached)', { signer: a.approvers[2].address, ...r });
    const replay = await expectedRevert(registry.connect(a.registrar).submitSignedDecision, vote, sig);

    // 4. Title minted
    const tokenId = BigInt(key);
    step('4. Title minted after threshold', {
        requestStatus: STATUS[Number((await registry.getRequest(regId)).status)],
        owner: await registry.ownerOf(tokenId),
        expectedOwner: alice.address,
        replayedSignature: replay,
    });

    // 5. Transfer initiation
    const bypass = {
        nonOwnerInitiates: await expectedRevert(registry.connect(bob).submitTransfer, tokenId, bob.address, h('fake sale')),
        validatorInitiates: await expectedRevert(registry.connect(a.approvers[0]).submitTransfer, tokenId, bob.address, h('fake sale')),
        directTransferFrom: await expectedRevert(registry.connect(alice).transferFrom, alice.address, bob.address, tokenId),
    };
    r = await send(registry.connect(alice).submitTransfer(tokenId, bob.address, h(`deed-of-sale:${parcel}`)));
    const trId = await registry.requestCount();
    step('5. Owner initiates transfer; bypass attempts fail', { requestId: trId, ...r, ...bypass });

    // 6. Governed transfer
    for (const i of [0, 1, 3]) await send(registry.connect(a.approvers[i]).approveRequest(trId));
    step('6. Governed transfer completes after 3-of-4 approvals', {
        requestStatus: STATUS[Number((await registry.getRequest(trId)).status)],
        newOwner: await registry.ownerOf(tokenId),
        expectedOwner: bob.address,
        history: (await registry.titleHistory(tokenId)).join(', '),
    });

    const ok = (await registry.ownerOf(tokenId)) === bob.address
        && bypass.nonOwnerInitiates === 'NotTitleHolder'
        && bypass.validatorInitiates === 'NotTitleHolder'
        && bypass.directTransferFrom === 'DirectTransferDisabled'
        && dup.sameNumber === 'ParcelUnavailable' && dup.reformattedNumber === 'ParcelUnavailable'
        && replay === 'NonceAlreadyUsed';
    const file = writeEvidence(`demo-${network.name}`, { network: network.name, chainId: dep.chainId, parcel, ok, log });
    console.log(`\nResult: ${ok ? 'PASS' : 'FAIL'}  (evidence: ${file})`);
    if (!ok) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
