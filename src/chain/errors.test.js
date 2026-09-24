import { Interface } from 'ethers';
import abis from './generated/abis.json';
import { decodeChainError } from './errors';

const registry = new Interface(abis.LandRegistry);

test('decodes LandRegistry custom errors into plain-language messages', () => {
    const data = registry.encodeErrorResult('ParcelUnavailable', ['0x' + '11'.repeat(32), 1]);
    expect(decodeChainError({ data })).toMatch(/already reserved/);
    expect(decodeChainError({ data: registry.encodeErrorResult('DirectTransferDisabled', []) })).toMatch(/approved transfer request/);
    expect(decodeChainError({ revert: { name: 'ConflictOfInterest' } })).toMatch(/cannot vote/);
});

test('explains wallet rejections and falls back to the raw message', () => {
    expect(decodeChainError({ code: 'ACTION_REJECTED' })).toMatch(/rejected/);
    expect(decodeChainError(new Error('network down'))).toBe('network down');
});
