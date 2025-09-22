import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { formatBushels } from '../../src/core/money.js';
import { remainingBushels } from '../../src/contracts/apply.js';
import { runContracts } from '../../src/cli/contracts.js';

const example = (name) => fileURLToPath(new URL(`../../examples/${name}`, import.meta.url));

const base = { file: example('contracts-2025.json') };

describe('the register on its own', () => {
  const result = runContracts(base);

  it('reads every contract', () => {
    expect(result.positions).toHaveLength(5);
    expect(result.text).toContain('Contract register');
  });

  it('prints the price on a priced contract and the open legs on the rest', () => {
    expect(result.text).toContain('4.3250');
    expect(result.text).toContain('basis open');
    expect(result.text).toContain('futures+basis open');
  });

  it('counts the open legs', () => {
    expect(result.text).toContain('Open legs      3');
  });

  it('narrows to an account', () => {
    expect(runContracts({ ...base, account: 'HALVORSEN' }).positions).toHaveLength(2);
  });

  it('narrows to a commodity', () => {
    expect(runContracts({ ...base, commodity: 'soybeans' }).positions).toHaveLength(1);
  });

  it('says so when nothing matches', () => {
    expect(() => runContracts({ ...base, account: 'NOBODY' })).toThrow(/nothing in that file/);
  });

  it('refuses a file with no contracts array', () => {
    expect(() => runContracts({ file: example('rush-creek.json') })).toThrow(
      /carries no contracts/
    );
  });
});

describe('applying a days loads', () => {
  const result = runContracts({ ...base, tickets: example('tickets-2025-10-09.csv') });

  it('puts each load on the right account', () => {
    const halvorsen = result.positions.find((entry) => entry.contract.id === 'C-1001');
    expect(halvorsen.appliedBushels).toBeGreaterThan(0);
    expect(halvorsen.applications.map((entry) => entry.ticket)).toContain('T-10441');
  });

  it('sends the soybean load to the soybean contract', () => {
    const beans = result.positions.find((entry) => entry.contract.id === 'C-1005');
    expect(beans.applications).toHaveLength(1);
    expect(beans.applications[0].ticket).toBe('T-10445');
  });

  it('fills the contract closing soonest first', () => {
    const kessel = result.positions.find((entry) => entry.contract.id === 'C-1002');
    expect(kessel.applications).toHaveLength(2);
  });

  it('leaves nothing applied to a contract with no matching account', () => {
    const drake = result.positions.find((entry) => entry.contract.id === 'C-1003');
    expect(drake.applications).toHaveLength(1);
  });

  it('reports the loads that had nowhere to go', () => {
    expect(result.unapplied.map((entry) => entry.ticket)).toEqual([]);
  });

  it('draws the remaining bushels down', () => {
    const halvorsen = result.positions.find((entry) => entry.contract.id === 'C-1001');
    expect(remainingBushels(halvorsen)).toBeLessThan(halvorsen.contract.bushels);
    expect(result.text).toContain('Still to come');
  });

  it('names a load with no contract open for it', () => {
    const narrowed = runContracts({
      ...base,
      account: 'HALVORSEN',
      tickets: example('tickets-2025-10-09.csv'),
    });
    expect(narrowed.unapplied.length).toBeGreaterThan(0);
    expect(narrowed.text).toContain('loads with no contract open');
    expect(formatBushels(narrowed.unapplied[0].bushels)).toMatch(/^\d/);
  });
});
