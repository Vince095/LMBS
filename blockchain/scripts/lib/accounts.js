/**
 * Resolves the labelled actors used by deploy / demo scripts.
 *
 *  - On the Besu network the keys come from network/generated/accounts.json
 *    (synthetic development keys created by network/scripts/setup.sh).
 *  - On hardhat / localhost the default Hardhat test signers are used in the
 *    same order.
 */
const LABELS = [
    'governance',
    'registrar',
    'approver-laa',
    'approver-survey',
    'approver-deeds',
    'approver-ministry',
    'identity-issuer',
    'dispute-officer',
    'encumbrance-officer',
    'citizen-alice',
    'citizen-bob',
    'citizen-carol',
];

async function actors(ethers) {
    const signers = await ethers.getSigners();
    if (signers.length < LABELS.length) {
        throw new Error(`Need ${LABELS.length} accounts, found ${signers.length}. Run network/scripts/setup.sh first.`);
    }
    const out = {};
    LABELS.forEach((label, i) => { out[label] = signers[i]; });
    out.approvers = [out['approver-laa'], out['approver-survey'], out['approver-deeds'], out['approver-ministry']];
    out.citizens = [out['citizen-alice'], out['citizen-bob'], out['citizen-carol']];
    return out;
}

module.exports = { LABELS, actors };
