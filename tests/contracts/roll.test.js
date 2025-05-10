import { describe, expect, it } from 'vitest';
import { formatContract } from '../../src/pricing/board.js';
import { createContract } from '../../src/contracts/types.js';
import {
  canRoll,
  DEFAULT_ROLL_FEE_POINTS,
  hasFuturesLeg,
  rollContract,
  rollCost,
  rollHistory,
  totalRollFees,
  totalRollPoints,
} from '../../src/contracts/roll.js';

function hta(overrides = {}) {
  return createContract({
    id: 'C-2001',
    kind: 'hta',
    account: 'DRAKE-TRUST',
    commodity: 'corn',
    bushels: 500_000,
    signedOn: '2025-06-02',
    deliveryFrom: '2025-10-01',
    deliveryTo: '2026-02-28',
    futuresPoints: 46_250,
    futuresContract: 'ZCZ25',
    ...overrides,
  });
}

describe('whether a contract can roll', () => {
  it('needs a futures leg', () => {
    const dp = createContract({
      id: 'C-3001',
      kind: 'dp',
      account: 'DRAKE-TRUST',
      commodity: 'corn',
      bushels: 100_000,
      signedOn: '2025-06-02',
      deliveryFrom: '2025-10-01',
      deliveryTo: '2026-02-28',
    });
    expect(hasFuturesLeg(dp)).toBe(false);
    expect(canRoll(dp, '2025-10-01')).toBe(false);
    expect(() => rollContract(dp, { to: 'ZCH26', day: '2025-10-01', spreadPoints: 1500 })).toThrow(
      /no futures leg/
    );
  });

  it('must happen before first notice day', () => {
    expect(canRoll(hta(), '2025-11-27')).toBe(true);
    expect(canRoll(hta(), '2025-11-28')).toBe(false);
    expect(() =>
      rollContract(hta(), { to: 'ZCH26', day: '2025-11-28', spreadPoints: 1500 })
    ).toThrow(/already in notice/);
  });

  it('walks first notice back off a holiday', () => {
    expect(canRoll(hta(), '2025-11-28', ['2025-11-28'])).toBe(false);
    expect(canRoll(hta(), '2025-11-26', ['2025-11-28'])).toBe(true);
  });
});

describe('rolling', () => {
  it('hands the grower the spread less the fee', () => {
    const rolled = rollContract(hta(), {
      to: 'ZCH26',
      day: '2025-11-20',
      spreadPoints: 1500,
    });
    expect(formatContract(rolled.futuresContract)).toBe('ZCH26');
    expect(rolled.futuresPoints).toBe(46_250 + 1400);
    expect(rollHistory(rolled)).toHaveLength(1);
    expect(rollHistory(rolled)[0].months).toBe(3);
  });

  it('costs the grower money in an inverse', () => {
    const rolled = rollContract(hta(), {
      to: 'ZCH26',
      day: '2025-11-20',
      spreadPoints: -800,
    });
    expect(rolled.futuresPoints).toBe(46_250 - 900);
  });

  it('takes a fee other than the default', () => {
    expect(DEFAULT_ROLL_FEE_POINTS).toBe(100);
    expect(rollCost(1500, 250)).toBe(1250);
    const rolled = rollContract(hta(), {
      to: 'ZCH26',
      day: '2025-11-20',
      spreadPoints: 1500,
      feePoints: 250,
    });
    expect(rolled.futuresPoints).toBe(46_250 + 1250);
  });

  it('refuses to roll backwards', () => {
    expect(() =>
      rollContract(hta(), { to: 'ZCU25', day: '2025-08-01', spreadPoints: 500 })
    ).toThrow(/is not later than/);
  });

  it('refuses to roll onto another board', () => {
    expect(() =>
      rollContract(hta(), { to: 'ZSH26', day: '2025-11-20', spreadPoints: 500 })
    ).toThrow(/cannot roll onto ZS/);
  });

  it('leaves the contract it was given alone', () => {
    const original = hta();
    rollContract(original, { to: 'ZCH26', day: '2025-11-20', spreadPoints: 1500 });
    expect(formatContract(original.futuresContract)).toBe('ZCZ25');
    expect(rollHistory(original)).toEqual([]);
  });
});

describe('a chain of rolls', () => {
  it('keeps every leg and totals the fees', () => {
    const once = rollContract(hta(), { to: 'ZCH26', day: '2025-11-20', spreadPoints: 1500 });
    const twice = rollContract(once, { to: 'ZCK26', day: '2026-02-20', spreadPoints: 700 });
    expect(rollHistory(twice)).toHaveLength(2);
    expect(totalRollPoints(twice)).toBe(1400 + 600);
    expect(totalRollFees(twice)).toBe(200);
    expect(twice.futuresPoints).toBe(46_250 + 2000);
  });
});
