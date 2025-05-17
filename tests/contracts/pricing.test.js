import { describe, expect, it } from 'vitest';
import { formatPrice } from '../../src/core/money.js';
import { formatContract } from '../../src/pricing/board.js';
import { createContract, openLegs } from '../../src/contracts/types.js';
import {
  finalPrice,
  isFullyPriced,
  priceBasisLeg,
  priceContract,
  pricedOn,
  priceFuturesLeg,
  pricingHistory,
} from '../../src/contracts/pricing.js';

function build(kind, extra = {}) {
  return createContract({
    id: `C-${kind}`,
    kind,
    account: 'DRAKE-TRUST',
    commodity: 'corn',
    bushels: 500_000,
    signedOn: '2025-06-02',
    deliveryFrom: '2025-10-01',
    deliveryTo: '2026-02-28',
    ...extra,
  });
}

const basisContract = build('basis', { basisPoints: -3000 });
const htaContract = build('hta', { futuresPoints: 46_250, futuresContract: 'ZCZ25' });
const dpContract = build('dp');

describe('pricing the board leg', () => {
  it('closes the open leg on a basis contract', () => {
    const priced = priceFuturesLeg(basisContract, {
      day: '2025-09-15',
      points: 44_000,
      futuresContract: 'ZCZ25',
      takenBy: 'phone',
    });
    expect(isFullyPriced(priced)).toBe(true);
    expect(formatPrice(finalPrice(priced))).toBe('4.1000');
    expect(pricingHistory(priced)[0].takenBy).toBe('phone');
  });

  it('refuses a leg that is already priced', () => {
    expect(() =>
      priceFuturesLeg(htaContract, { day: '2025-09-15', points: 44_000, futuresContract: 'ZCZ25' })
    ).toThrow(/priced its futures leg already/);
  });

  it('refuses a month that has stopped trading', () => {
    expect(() =>
      priceFuturesLeg(basisContract, {
        day: '2025-12-15',
        points: 44_000,
        futuresContract: 'ZCZ25',
      })
    ).toThrow(/stopped trading before/);
  });

  it('leaves the contract it was given open', () => {
    priceFuturesLeg(basisContract, { day: '2025-09-15', points: 44_000, futuresContract: 'ZCZ25' });
    expect(openLegs(basisContract)).toEqual(['futures']);
  });
});

describe('pricing the basis leg', () => {
  it('closes the open leg on a hedged to arrive', () => {
    const priced = priceBasisLeg(htaContract, { day: '2025-10-20', points: -2800 });
    expect(isFullyPriced(priced)).toBe(true);
    expect(formatPrice(finalPrice(priced))).toBe('4.3450');
    expect(formatContract(priced.futuresContract)).toBe('ZCZ25');
  });

  it('refuses a pricing before the contract was signed', () => {
    expect(() => priceBasisLeg(htaContract, { day: '2025-05-01', points: -2800 })).toThrow(
      /not signed until 2025-06-02/
    );
  });

  it('refuses a leg that is already priced', () => {
    expect(() => priceBasisLeg(basisContract, { day: '2025-09-15', points: -2800 })).toThrow(
      /priced its basis leg already/
    );
  });
});

describe('pricing both legs at once', () => {
  it('closes out a delayed price contract', () => {
    const priced = priceContract(dpContract, {
      day: '2026-01-12',
      futuresPoints: 45_000,
      futuresContract: 'ZCH26',
      basisPoints: -2500,
      takenBy: 'counter',
    });
    expect(isFullyPriced(priced)).toBe(true);
    expect(formatPrice(finalPrice(priced))).toBe('4.2500');
    expect(pricingHistory(priced)).toHaveLength(2);
  });

  it('prices only what is still open', () => {
    const priced = priceContract(htaContract, { day: '2025-10-20', basisPoints: -2800 });
    expect(pricingHistory(priced)).toHaveLength(1);
    expect(pricingHistory(priced)[0].leg).toBe('basis');
  });
});

describe('reading the pricing back', () => {
  it('reports the last day anything was priced', () => {
    expect(pricedOn(dpContract)).toBe('2025-06-02');
    const priced = priceContract(dpContract, {
      day: '2026-01-12',
      futuresPoints: 45_000,
      futuresContract: 'ZCH26',
      basisPoints: -2500,
    });
    expect(pricedOn(priced)).toBe('2026-01-12');
  });

  it('refuses to give a final price on an open contract', () => {
    expect(() => finalPrice(dpContract)).toThrow(/still has futures and basis open/);
  });
});
