import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  balanceOf,
  deposit,
  depositedBushels,
  isOverdrawn,
  openBankAccount,
  renderBank,
  runningEntries,
  shrinkKept,
  withdraw,
  withdrawnBushels,
} from '../../src/inventory/grainbank.js';

function bank(overrides = {}) {
  return openBankAccount({
    id: 'GB-1',
    account: 'KESSEL',
    commodity: 'corn',
    openedOn: '2025-10-01',
    ...overrides,
  });
}

const stocked = deposit(bank(), {
  day: '2025-10-09',
  bushels: 1_000_000,
  shrinkPercent: 1.5,
  ticket: 'T-10444',
});

describe('opening an account', () => {
  it('starts empty', () => {
    expect(balanceOf(bank())).toBe(0);
    expect(bank().entries).toEqual([]);
    expect(bank().allowOverdraft).toBe(false);
  });

  it('refuses a commodity the house does not take', () => {
    expect(() => bank({ commodity: 'oats' })).toThrow(/must be one of/);
  });
});

describe('depositing', () => {
  it('takes the shrink on the way in', () => {
    const entry = stocked.entries[0];
    expect(formatBushels(entry.grossBushels)).toBe('10,000.00');
    expect(formatBushels(entry.shrinkBushels)).toBe('150.00');
    expect(formatBushels(entry.bushels)).toBe('9,850.00');
    expect(formatBushels(balanceOf(stocked))).toBe('9,850.00');
  });

  it('takes nothing when no shrink was posted', () => {
    const plain = deposit(bank(), { day: '2025-10-09', bushels: 1_000_000 });
    expect(plain.entries[0].shrinkBushels).toBe(0);
  });

  it('leaves the account it was given alone', () => {
    const before = bank();
    deposit(before, { day: '2025-10-09', bushels: 1000 });
    expect(before.entries).toHaveLength(0);
  });

  it('refuses a deposit of nothing', () => {
    expect(() => deposit(bank(), { day: '2025-10-09', bushels: 0 })).toThrow(/greater than zero/);
  });
});

describe('withdrawing', () => {
  it('comes out at the ticket weight with no shrink', () => {
    const drawn = withdraw(stocked, { day: '2025-11-14', bushels: 200_000, ticket: 'T-11001' });
    expect(drawn.entries[1].shrinkBushels).toBe(0);
    expect(formatBushels(balanceOf(drawn))).toBe('7,850.00');
  });

  it('refuses to draw more than is there', () => {
    expect(() => withdraw(stocked, { day: '2025-11-14', bushels: 2_000_000 })).toThrow(
      /has 9,850.00 and asked for 20,000.00/
    );
  });

  it('allows an overdraft when the account was opened that way', () => {
    const lenient = deposit(bank({ allowOverdraft: true }), {
      day: '2025-10-09',
      bushels: 100_000,
    });
    const drawn = withdraw(lenient, { day: '2025-11-14', bushels: 200_000 });
    expect(isOverdrawn(drawn)).toBe(true);
    expect(balanceOf(drawn)).toBeLessThan(0);
  });

  it('reads the balance at the day of the withdrawal, not at the end', () => {
    const later = deposit(stocked, { day: '2025-12-01', bushels: 1_000_000 });
    expect(() => withdraw(later, { day: '2025-11-01', bushels: 1_500_000 })).toThrow(
      /NOT_ENOUGH|asked for/
    );
  });
});

describe('reading the account', () => {
  const busy = withdraw(withdraw(stocked, { day: '2025-11-14', bushels: 200_000 }), {
    day: '2025-12-12',
    bushels: 150_000,
  });

  it('adds the deposits and the withdrawals up separately', () => {
    expect(formatBushels(depositedBushels(busy))).toBe('9,850.00');
    expect(formatBushels(withdrawnBushels(busy))).toBe('3,500.00');
  });

  it('shows what the house kept', () => {
    expect(formatBushels(shrinkKept(busy))).toBe('150.00');
  });

  it('runs a balance down the page', () => {
    const rows = runningEntries(busy);
    expect(rows.map((row) => formatBushels(row.balance))).toEqual([
      '9,850.00',
      '7,850.00',
      '6,350.00',
    ]);
  });

  it('reads at a day in the past', () => {
    expect(formatBushels(balanceOf(busy, '2025-11-30'))).toBe('7,850.00');
  });
});

describe('printing', () => {
  it('lays the account out with the shrink visible', () => {
    const text = renderBank(stocked);
    expect(text).toContain('KESSEL grain bank in corn');
    expect(text).toContain('150.00 kept as shrink');
  });

  it('says so when nothing has moved', () => {
    expect(renderBank(bank())).toContain('Nothing has moved on this account.');
  });
});
