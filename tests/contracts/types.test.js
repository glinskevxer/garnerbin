import { describe, expect, it } from 'vitest';
import {
  CONTRACT_KINDS,
  createContract,
  describeContract,
  isLate,
  isPriced,
  openLegs,
  priceOf,
  toleranceBushels,
  withinWindow,
} from '../../src/contracts/types.js';

function base(overrides = {}) {
  return {
    id: 'C-1001',
    kind: 'forward',
    account: 'HALVORSEN',
    commodity: 'corn',
    bushels: 500_000,
    signedOn: '2025-06-02',
    deliveryFrom: '2025-10-01',
    deliveryTo: '2025-11-30',
    futuresPoints: 46_250,
    futuresContract: 'ZCZ25',
    basisPoints: -3000,
    ...overrides,
  };
}

describe('the six kinds', () => {
  it('takes the six and no others', () => {
    expect(CONTRACT_KINDS).toEqual(['cash', 'forward', 'basis', 'hta', 'dp', 'minPrice']);
    expect(() => createContract(base({ kind: 'handshake' }))).toThrow(/must be one of/);
  });

  it('prices a forward on both legs', () => {
    const contract = createContract(base());
    expect(isPriced(contract)).toBe(true);
    expect(priceOf(contract)).toBe(43_250);
    expect(openLegs(contract)).toEqual([]);
  });

  it('leaves the board open on a basis contract', () => {
    const contract = createContract(
      base({ kind: 'basis', futuresPoints: undefined, futuresContract: undefined })
    );
    expect(openLegs(contract)).toEqual(['futures']);
    expect(priceOf(contract)).toBeNull();
  });

  it('leaves the basis open on a hedged to arrive', () => {
    const contract = createContract(base({ kind: 'hta', basisPoints: undefined }));
    expect(openLegs(contract)).toEqual(['basis']);
    expect(contract.futuresContract.month).toBe(12);
  });

  it('leaves both open on delayed price', () => {
    const contract = createContract(
      base({
        kind: 'dp',
        futuresPoints: undefined,
        futuresContract: undefined,
        basisPoints: undefined,
      })
    );
    expect(openLegs(contract)).toEqual(['futures', 'basis']);
  });

  it('carries a premium on a minimum price contract', () => {
    const contract = createContract(base({ kind: 'minPrice', premiumPoints: 2200 }));
    expect(contract.premiumPoints).toBe(2200);
  });
});

describe('the rules that keep the legs honest', () => {
  it('refuses a hedged to arrive that has a basis on it', () => {
    expect(() => createContract(base({ kind: 'hta' }))).toThrow(/leaves basisPoints open/);
  });

  it('refuses a basis contract that has a board price on it', () => {
    expect(() => createContract(base({ kind: 'basis' }))).toThrow(/leaves futuresPoints open/);
  });

  it('refuses a forward with a leg missing', () => {
    expect(() => createContract(base({ basisPoints: undefined }))).toThrow(/needs basisPoints/);
    expect(() => createContract(base({ futuresPoints: undefined }))).toThrow(/needs futuresPoints/);
  });

  it('refuses a priced leg with no contract month behind it', () => {
    expect(() => createContract(base({ futuresContract: undefined }))).toThrow(
      /futuresContract is required/
    );
  });

  it('refuses a delivery window that closes before it opens', () => {
    expect(() =>
      createContract(base({ deliveryFrom: '2025-11-30', deliveryTo: '2025-10-01' }))
    ).toThrow(/opens after it closes/);
  });

  it('refuses a contract for no bushels', () => {
    expect(() => createContract(base({ bushels: 0 }))).toThrow(/greater than zero/);
  });
});

describe('the delivery window', () => {
  const contract = createContract(base());

  it('takes a day inside the window', () => {
    expect(withinWindow(contract, '2025-10-01')).toBe(true);
    expect(withinWindow(contract, '2025-11-30')).toBe(true);
    expect(withinWindow(contract, '2025-09-30')).toBe(false);
  });

  it('calls a day past the close late', () => {
    expect(isLate(contract, '2025-12-01')).toBe(true);
    expect(isLate(contract, '2025-11-30')).toBe(false);
    expect(isLate(contract, '2025-09-01')).toBe(false);
  });

  it('allows two percent either way by default', () => {
    expect(toleranceBushels(contract)).toBe(10_000);
    expect(toleranceBushels(createContract(base({ tolerancePercent: 0 })))).toBe(0);
  });
});

describe('describing a contract', () => {
  it('prints the price when it has one', () => {
    expect(describeContract(createContract(base()))).toBe('C-1001 forward corn 5000 bu at 4.3250');
  });

  it('names the open legs when it does not', () => {
    const dp = createContract(
      base({
        kind: 'dp',
        futuresPoints: undefined,
        futuresContract: undefined,
        basisPoints: undefined,
      })
    );
    expect(describeContract(dp)).toContain('futures and basis open');
  });
});
