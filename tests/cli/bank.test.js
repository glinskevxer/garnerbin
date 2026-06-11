import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { formatBushels } from '../../src/core/money.js';
import { balanceOf } from '../../src/inventory/grainbank.js';
import { buildAccount, runBank } from '../../src/cli/bank.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = {
  house: example('rush-creek.json'),
  file: example('grainbank-2026.json'),
};

describe('building an account from the file', () => {
  it('replays the deposits and withdrawals in order', () => {
    const bank = buildAccount({
      id: 'GB-1',
      account: 'X',
      commodity: 'corn',
      openedOn: '2025-10-01',
      entries: [
        { kind: 'deposit', day: '2025-10-09', bushels: 100_000, shrinkPercent: 1.5 },
        { kind: 'withdrawal', day: '2025-11-01', bushels: 20_000 },
      ],
    });
    expect(bank.entries).toHaveLength(2);
    expect(formatBushels(balanceOf(bank))).toBe('785.00');
  });

  it('refuses an entry kind the bank does not have', () => {
    expect(() =>
      buildAccount({
        id: 'GB-1',
        account: 'X',
        commodity: 'corn',
        openedOn: '2025-10-01',
        entries: [{ kind: 'transfer', day: '2025-10-09', bushels: 100 }],
      })
    ).toThrow(/has a transfer entry/);
  });

  it('refuses a withdrawal past the balance on an ordinary account', () => {
    expect(() =>
      buildAccount({
        id: 'GB-1',
        account: 'X',
        commodity: 'corn',
        openedOn: '2025-10-01',
        entries: [
          { kind: 'deposit', day: '2025-10-09', bushels: 10_000 },
          { kind: 'withdrawal', day: '2025-11-01', bushels: 20_000 },
        ],
      })
    ).toThrow(/asked for/);
  });
});

describe('the bank sheet', () => {
  const result = runBank(base);

  it('reads every account on the file', () => {
    expect(result.rows.map((row) => row.account)).toEqual(['KESSEL', 'VOSS-LAND-CO']);
    expect(result.text).toContain('Rush Creek Grain grain bank at 2026-03-01');
  });

  it('takes the shrink on the way in and shows what the house kept', () => {
    const kessel = result.rows.find((row) => row.account === 'KESSEL');
    expect(formatBushels(kessel.shrink)).toBe('286.17');
    expect(kessel.deposited).toBeLessThan(1_000_000 + 907_800);
  });

  it('nets the deposits against the withdrawals', () => {
    const kessel = result.rows.find((row) => row.account === 'KESSEL');
    expect(kessel.balance).toBe(kessel.deposited - kessel.withdrawn);
  });

  it('flags the account that has drawn past its deposits', () => {
    expect(result.overdrawn.map((row) => row.account)).toEqual(['VOSS-LAND-CO']);
    expect(result.text).toMatch(/Overdrawn +VOSS-LAND-CO/);
  });

  it('reads the balances at a day in the past', () => {
    const early = runBank({ ...base, asOf: '2025-12-31' });
    const kessel = early.rows.find((row) => row.account === 'KESSEL');
    expect(kessel.balance).toBeGreaterThan(
      result.rows.find((row) => row.account === 'KESSEL').balance
    );
    expect(early.overdrawn).toEqual([]);
  });

  it('narrows to one account', () => {
    expect(runBank({ ...base, account: 'KESSEL' }).rows).toHaveLength(1);
  });

  it('says so when an account has neither a bank account nor a receipt', () => {
    expect(() => runBank({ ...base, account: 'NOBODY' })).toThrow(/nothing in that file/);
  });

  it('takes an account that holds receipts but no bank account', () => {
    const halvorsen = runBank({ ...base, account: 'HALVORSEN' });
    expect(halvorsen.rows).toEqual([]);
    expect(halvorsen.receipts).toHaveLength(2);
    expect(halvorsen.text).toContain('warehouse receipts');
  });
});

describe('the receipts alongside', () => {
  const result = runBank(base);

  it('lists the open receipts with how long they have been open', () => {
    expect(result.receipts).toHaveLength(3);
    expect(result.text).toContain('warehouse receipts');
    expect(result.text).toContain('WR-4401');
    expect(result.text).toContain('Bushels on receipt');
  });

  it('narrows the receipts with the account', () => {
    const halvorsen = runBank({ ...base, account: 'HALVORSEN' });
    expect(halvorsen.receipts.map((receipt) => receipt.number)).toEqual(['WR-4401', 'WR-4403']);
  });
});

describe('one account in full', () => {
  it('prints the ledger with a running balance', () => {
    const result = runBank({ ...base, statement: 'KESSEL' });
    expect(result.text).toContain('KESSEL grain bank in corn');
    expect(result.text).toContain('kept as shrink');
  });

  it('says so when the account is not there', () => {
    expect(() => runBank({ ...base, statement: 'NOBODY' })).toThrow(/no bank account for NOBODY/);
  });
});

describe('what it refuses', () => {
  it('refuses a file with no accounts array', () => {
    expect(() => runBank({ ...base, file: example('rush-creek.json') })).toThrow(
      /carries no accounts/
    );
  });

  it('refuses a commodity the house does not take', () => {
    expect(() => runBank({ ...base, file: example('lots-2026-03-01.json') })).toThrow();
  });
});
