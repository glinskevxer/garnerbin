import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/core/money.js';
import {
  balance,
  closeAccount,
  createAccount,
  openLedger,
  owedToGrower,
  owedToHouse,
  post,
  postAll,
  POSTING_KINDS,
  postingsBetween,
  runningBalance,
  totalsByKind,
} from '../../src/accounts/grower.js';

const account = createAccount({
  id: 'HALVORSEN',
  name: 'Halvorsen Farms',
  address: 'Rural Route 2',
  since: '1998-09-01',
});

function ledgerWith(entries) {
  return postAll(openLedger(account), entries);
}

const day = '2025-10-09';

describe('accounts', () => {
  it('opens active with an empty ledger', () => {
    const ledger = openLedger(account);
    expect(ledger.account.active).toBe(true);
    expect(ledger.postings).toEqual([]);
    expect(balance(ledger)).toBe(0);
  });

  it('leaves the optional fields null', () => {
    const bare = createAccount({ id: 'X', name: 'X Farms' });
    expect(bare.address).toBeNull();
    expect(bare.since).toBeNull();
  });
});

describe('posting', () => {
  it('takes the seven kinds and no others', () => {
    expect(POSTING_KINDS).toHaveLength(7);
    expect(() => post(openLedger(account), { day, kind: 'gift', cents: 100 })).toThrow(
      /must be one of/
    );
  });

  it('lets the kind set the sign', () => {
    const ledger = ledgerWith([
      { day, kind: 'settlement', cents: 384_750, reference: 'T-10441' },
      { day, kind: 'drying', cents: 13_480, reference: 'T-10441' },
    ]);
    expect(ledger.postings[0].cents).toBe(384_750);
    expect(ledger.postings[1].cents).toBe(-13_480);
    expect(formatMoney(balance(ledger))).toBe('3,712.70');
  });

  it('refuses a negative amount rather than guessing what was meant', () => {
    expect(() => post(openLedger(account), { day, kind: 'settlement', cents: -1 })).toThrow(
      /let the kind set the sign/
    );
  });

  it('leaves the ledger it was given alone', () => {
    const first = openLedger(account);
    post(first, { day, kind: 'settlement', cents: 100 });
    expect(first.postings).toHaveLength(0);
  });

  it('refuses to post to a closed account', () => {
    const closed = closeAccount(openLedger(account), '2026-01-01');
    expect(() => post(closed, { day, kind: 'settlement', cents: 100 })).toThrow(/is closed/);
  });
});

describe('the balance', () => {
  const ledger = ledgerWith([
    { day: '2025-10-09', kind: 'settlement', cents: 384_750 },
    { day: '2025-10-15', kind: 'advance', cents: 200_000 },
    { day: '2026-01-31', kind: 'storage', cents: 50_000 },
  ]);

  it('adds the postings up', () => {
    expect(formatMoney(balance(ledger))).toBe('1,347.50');
  });

  it('can be read at a day in the past', () => {
    expect(formatMoney(balance(ledger, '2025-10-14'))).toBe('3,847.50');
    expect(formatMoney(balance(ledger, '2025-10-15'))).toBe('1,847.50');
  });

  it('says which way it runs', () => {
    expect(owedToGrower(ledger)).toBe(134_750);
    expect(owedToHouse(ledger)).toBe(0);
    const overdrawn = ledgerWith([{ day, kind: 'advance', cents: 100_000 }]);
    expect(owedToHouse(overdrawn)).toBe(100_000);
    expect(owedToGrower(overdrawn)).toBe(0);
  });

  it('totals by kind', () => {
    const totals = totalsByKind(ledger);
    expect(totals.settlement).toBe(384_750);
    expect(totals.advance).toBe(-200_000);
    expect(totals.payment).toBe(0);
  });

  it('pulls a window out', () => {
    expect(postingsBetween(ledger, '2025-10-01', '2025-10-31')).toHaveLength(2);
  });

  it('runs a balance down the page', () => {
    const rows = runningBalance(ledger);
    expect(rows.map((row) => row.balance)).toEqual([384_750, 184_750, 134_750]);
    expect(rows[1].amount).toBe('-2,000.00');
    expect(rows[0].amount).toBe('+3,847.50');
  });
});

describe('closing', () => {
  it('closes an account that stands at nothing', () => {
    const settled = ledgerWith([
      { day, kind: 'settlement', cents: 100_000 },
      { day, kind: 'payment', cents: 100_000 },
    ]);
    const closed = closeAccount(settled, '2026-02-01');
    expect(closed.account.active).toBe(false);
    expect(closed.account.closedOn).toBe('2026-02-01');
  });

  it('refuses to close an account with money on it', () => {
    const owing = ledgerWith([{ day, kind: 'settlement', cents: 100_000 }]);
    expect(() => closeAccount(owing, '2026-02-01')).toThrow(/still stands at 1,000.00/);
  });
});
