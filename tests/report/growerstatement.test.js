import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../src/core/money.js';
import { createAccount, openLedger, postAll } from '../../src/accounts/grower.js';
import {
  buildGrowerStatement,
  payablesBook,
  renderGrowerStatement,
  renderPayables,
  statementCsv,
} from '../../src/report/growerstatement.js';

function ledgerFor(id, name, entries) {
  return postAll(openLedger(createAccount({ id, name })), entries);
}

const halvorsen = ledgerFor('HALVORSEN', 'Halvorsen Farms', [
  { day: '2025-09-20', kind: 'settlement', cents: 120_000, reference: 'T-10390' },
  { day: '2025-10-09', kind: 'settlement', cents: 384_750, reference: 'T-10441' },
  { day: '2025-10-09', kind: 'drying', cents: 13_480, reference: 'T-10441' },
  { day: '2025-10-15', kind: 'advance', cents: 200_000, reference: 'A-77' },
  { day: '2025-11-02', kind: 'payment', cents: 100_000, reference: 'CK-4412' },
]);

const window = { from: '2025-10-01', to: '2025-10-31', house: 'Rush Creek Grain' };

describe('the statement', () => {
  const statement = buildGrowerStatement(halvorsen, window);

  it('brings the earlier postings forward', () => {
    expect(formatMoney(statement.openingCents)).toBe('1,200.00');
  });

  it('lists only what happened in the window', () => {
    expect(statement.rows).toHaveLength(3);
    expect(statement.rows.map((row) => row.reference)).toEqual(['T-10441', 'T-10441', 'A-77']);
  });

  it('foots', () => {
    expect(statement.openingCents + statement.movementCents).toBe(statement.closingCents);
    expect(statement.rows.at(-1).balanceCents).toBe(statement.closingCents);
  });

  it('runs the balance down the page', () => {
    expect(statement.rows.map((row) => row.balanceCents)).toEqual([504_750, 491_270, 291_270]);
  });

  it('signs the amounts', () => {
    expect(statement.rows[0].amount).toBe('+3,847.50');
    expect(statement.rows[1].amount).toBe('-134.80');
  });

  it('refuses a window that runs backwards', () => {
    expect(() => buildGrowerStatement(halvorsen, { from: '2025-10-31', to: '2025-10-01' })).toThrow(
      /runs backwards/
    );
  });

  it('takes a window with nothing in it', () => {
    const quiet = buildGrowerStatement(halvorsen, { from: '2025-12-01', to: '2025-12-31' });
    expect(quiet.rows).toEqual([]);
    expect(quiet.openingCents).toBe(quiet.closingCents);
  });
});

describe('rendering', () => {
  it('heads the sheet and closes with what is owed', () => {
    const text = renderGrowerStatement(buildGrowerStatement(halvorsen, window));
    expect(text).toContain('Rush Creek Grain statement for Halvorsen Farms');
    expect(text).toContain('Brought forward  1,200.00');
    expect(text).toContain('Owed to you  2,912.70');
  });

  it('says which way a negative balance runs', () => {
    const overdrawn = ledgerFor('X', 'X Farms', [
      { day: '2025-10-05', kind: 'advance', cents: 50_000 },
    ]);
    expect(renderGrowerStatement(buildGrowerStatement(overdrawn, window))).toContain(
      'Owed to the house  500.00'
    );
  });

  it('says so when nothing moved', () => {
    const quiet = buildGrowerStatement(halvorsen, { from: '2025-12-01', to: '2025-12-31' });
    expect(renderGrowerStatement(quiet)).toContain('Nothing moved on this account');
  });

  it('writes a csv', () => {
    const csv = statementCsv(buildGrowerStatement(halvorsen, window));
    expect(csv.split('\n')[0]).toBe('day,kind,reference,amount,balance');
    expect(csv.split('\n')).toHaveLength(5);
  });
});

describe('the payables book', () => {
  const kessel = ledgerFor('KESSEL', 'Kessel Brothers', [
    { day: '2025-10-09', kind: 'advance', cents: 75_000 },
  ]);
  const flat = ledgerFor('VOSS', 'Voss Land Co', [
    { day: '2025-10-09', kind: 'settlement', cents: 1000 },
    { day: '2025-10-10', kind: 'payment', cents: 1000 },
  ]);

  it('lists the accounts with money standing, biggest first', () => {
    const rows = payablesBook([kessel, halvorsen, flat]);
    expect(rows.map((row) => row.account)).toEqual(['HALVORSEN', 'KESSEL']);
  });

  it('leaves out the accounts that stand at nothing', () => {
    expect(payablesBook([flat])).toEqual([]);
    expect(renderPayables([])).toBe('Every account stands at nothing.');
  });

  it('reads at a day in the past', () => {
    const rows = payablesBook([halvorsen], '2025-10-09');
    expect(formatMoney(rows[0].cents)).toBe('4,912.70');
  });

  it('totals both directions', () => {
    const text = renderPayables(payablesBook([kessel, halvorsen]));
    expect(text).toContain('Owed to growers');
    expect(text).toContain('Owed to the house  750.00');
  });
});
