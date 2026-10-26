import abis from './generated/abis.json';

// The frontend must talk to the refactored contracts: M-of-N approvals, no
// mnemonic parameters and no in-contract consensus phases.
test('uses the LandRegistry approval interface without mnemonic or QBFT-phase functions', () => {
    const names = abis.LandRegistry.filter((f) => f.type === 'function').map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['submitRegistration', 'submitTransfer', 'approveRequest', 'rejectRequest', 'submitSignedDecision', 'execute', 'cancel']));
    const text = JSON.stringify(abis).toLowerCase();
    expect(text).not.toMatch(/mnemonic|prepare|commit|finaliz/);
});
