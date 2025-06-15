import { describe, expect, it } from 'vitest';
import { formatBushels, formatMoney } from '../../src/core/money.js';
import {
  byMonth,
  closeLot,
  commissionCents,
  isOpen,
  lotBushels,
  netContracts,
  netHedgeBushels,
  openLot,
  openLots,
  realisedCents,
  realisedPoints,
  SIDES,
} from '../../src/hedging/hedge.js';

function lot(overrides = {}) {
  return openLot({
    id: 'H-1',
    commodity: 'corn',
    contract: 'ZCZ25',
    side: 'short',
    contracts: 10,
    pricePoints: 46_250,
    openedOn: '2025-09-15',
    broker: 'Wheeler',
    ...overrides,
  });
}

describe('opening a lot', () => {
  it('takes the two sides and no others', () => {
    expect(SIDES).toEqual(['short', 'long']);
    expect(() => lot({ side: 'sideways' })).toThrow(/must be one of/);
  });

  it('works the bushels out of the contract size', () => {
    expect(formatBushels(lotBushels(lot()))).toBe('50,000.00');
    expect(formatBushels(lotBushels(lot({ commodity: 'soybeans' })))).toBe('50,000.00');
  });

  it('refuses a lot of no contracts', () => {
    expect(() => lot({ contracts: 0 })).toThrow(/greater than zero/);
  });
});

describe('closing a lot', () => {
  it('records the offset', () => {
    const closed = closeLot(lot(), { pricePoints: 44_000, day: '2025-11-20' });
    expect(isOpen(closed)).toBe(false);
    expect(closed.closedOn).toBe('2025-11-20');
  });

  it('refuses to close twice', () => {
    const closed = closeLot(lot(), { pricePoints: 44_000, day: '2025-11-20' });
    expect(() => closeLot(closed, { pricePoints: 43_000, day: '2025-11-21' })).toThrow(
      /was closed on 2025-11-20/
    );
  });

  it('refuses to close before it opened', () => {
    expect(() => closeLot(lot(), { pricePoints: 44_000, day: '2025-09-01' })).toThrow(
      /is before 2025-09-15/
    );
  });
});

describe('what the lot made', () => {
  it('pays a short when the board falls', () => {
    const closed = closeLot(lot(), { pricePoints: 44_000, day: '2025-11-20' });
    expect(realisedPoints(closed)).toBe(2250);
    expect(formatMoney(realisedCents(closed))).toBe('11,250.00');
  });

  it('costs a short when the board rises', () => {
    const closed = closeLot(lot(), { pricePoints: 48_000, day: '2025-11-20' });
    expect(realisedPoints(closed)).toBe(-1750);
    expect(realisedCents(closed)).toBeLessThan(0);
  });

  it('runs a long the other way', () => {
    const closed = closeLot(lot({ side: 'long' }), { pricePoints: 48_000, day: '2025-11-20' });
    expect(realisedPoints(closed)).toBe(1750);
  });

  it('refuses to report on a lot still open', () => {
    expect(() => realisedPoints(lot())).toThrow(/has not been offset/);
  });

  it('charges commission on both ends of a closed lot', () => {
    expect(commissionCents(lot(), 250)).toBe(2500);
    expect(commissionCents(closeLot(lot(), { pricePoints: 44_000, day: '2025-11-20' }), 250)).toBe(
      5000
    );
  });
});

describe('the open book', () => {
  const book = [
    lot(),
    lot({ id: 'H-2', side: 'long', contracts: 4 }),
    lot({ id: 'H-3', commodity: 'soybeans', contract: 'ZSX25', contracts: 6 }),
    closeLot(lot({ id: 'H-4', contracts: 20 }), { pricePoints: 44_000, day: '2025-11-20' }),
  ];

  it('counts only what is still open', () => {
    expect(openLots(book)).toHaveLength(3);
  });

  it('nets the contracts with short counted positive', () => {
    expect(netContracts(book, 'corn')).toBe(6);
    expect(netContracts(book)).toBe(12);
  });

  it('nets the bushels behind them', () => {
    expect(formatBushels(netHedgeBushels(book, 'corn'))).toBe('30,000.00');
  });

  it('groups the open book by month', () => {
    const months = byMonth(book);
    expect(months).toContainEqual({ contract: 'ZCZ25', contracts: 6 });
    expect(months).toContainEqual({ contract: 'ZSX25', contracts: 6 });
  });
});
