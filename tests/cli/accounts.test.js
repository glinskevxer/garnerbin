import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { formatMoney } from '../../src/core/money.js';
import { balance } from '../../src/accounts/grower.js';
import { loadLedgers, runAccounts } from '../../src/cli/accounts.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));
const base = { file: example('accounts-2025.json') };

describe('loading the accounts file', () => {
  it('builds a ledger for every account', () => {
    const ledgers = loadLedgers({
      accounts: [{ id: 'A', name: 'A Farms' }],
      postings: [{ account: 'A', day: '2025-10-09', kind: 'settlement', cents: 100 }],
    });
    expect(ledgers).toHaveLength(1);
    expect(balance(ledgers[0])).toBe(100);
  });

  it('refuses a posting for an account that is not there', () => {
    expect(() =>
      loadLedgers({
        accounts: [{ id: 'A', name: 'A Farms' }],
        postings: [{ account: 'B', day: '2025-10-09', kind: 'settlement', cents: 100 }],
      })
    ).toThrow(/names B, which has no account/);
  });

  it('refuses the same account twice', () => {
    expect(() =>
      loadLedgers({
        accounts: [
          { id: 'A', name: 'A' },
          { id: 'A', name: 'A again' },
        ],
      })
    ).toThrow(/is in the file twice/);
  });

  it('refuses a file with no accounts array', () => {
    expect(() => loadLedgers({})).toThrow(/carries no accounts/);
  });
});

describe('the payables book', () => {
  const result = runAccounts(base);

  it('lists the accounts with money on them', () => {
    expect(result.ledgers).toHaveLength(4);
    expect(result.text).toContain('Payables');
    expect(result.text).toContain('HALVORSEN');
  });

  it('leaves out the account that was paid off', () => {
    expect(result.rows.map((row) => row.account)).not.toContain('VOSS-LAND-CO');
  });

  it('reads at a day in the past', () => {
    const early = runAccounts({ ...base, asOf: '2025-10-10' });
    const kessel = early.rows.find((row) => row.account === 'KESSEL');
    expect(formatMoney(kessel.cents)).toBe('7,000.56');
  });
});

describe('one growers statement', () => {
  const result = runAccounts({
    ...base,
    account: 'HALVORSEN',
    from: '2025-10-01',
    to: '2025-10-31',
  });

  it('prints the statement for the period', () => {
    expect(result.text).toContain('statement for Halvorsen Farms');
    expect(result.statement.rows).toHaveLength(3);
  });

  it('spans every posting when no period was given', () => {
    const whole = runAccounts({ ...base, account: 'HALVORSEN' });
    expect(whole.statement.from).toBe('2025-09-20');
    expect(whole.statement.to).toBe('2025-11-02');
    expect(whole.statement.rows).toHaveLength(5);
  });

  it('foots from brought forward to owed', () => {
    expect(result.statement.openingCents + result.statement.movementCents).toBe(
      result.statement.closingCents
    );
  });

  it('takes another period', () => {
    const later = runAccounts({
      ...base,
      account: 'HALVORSEN',
      from: '2025-11-01',
      to: '2025-11-30',
    });
    expect(later.statement.rows).toHaveLength(1);
    expect(later.statement.rows[0].reference).toBe('CK-4412');
  });

  it('says so when the account is not there', () => {
    expect(() => runAccounts({ ...base, account: 'NOBODY' })).toThrow(/no account NOBODY/);
  });
});
