import { describe, expect, it } from 'vitest';
import { createTicket } from '../../src/weights/ticket.js';
import { createSample } from '../../src/grading/sample.js';
import { createBin } from '../../src/inventory/bins.js';
import { buildPosition } from '../../src/inventory/position.js';
import { createContract } from '../../src/contracts/types.js';
import { applyLoad, openPosition } from '../../src/contracts/apply.js';
import { issueReceipt } from '../../src/storage/receipts.js';
import {
  countBySeverity,
  findExceptions,
  renderExceptions,
  SEVERITIES,
} from '../../src/report/exceptions.js';

const sample = createSample({
  id: 'S-1',
  commodity: 'corn',
  day: '2025-10-09',
  testWeight: 55.4,
  damagedTotal: 2.1,
  heatDamaged: 0,
  bcfm: 1.8,
  moisture: 15,
});

function ticket(number, overrides = {}) {
  return createTicket({
    number,
    day: '2025-10-09',
    commodity: 'corn',
    account: 'HALVORSEN',
    grossPounds: 78_500,
    tarePounds: 28_100,
    sampleId: 'S-1',
    ...overrides,
  });
}

describe('the severities', () => {
  it('ranks stop above warn above note', () => {
    expect(SEVERITIES).toEqual(['stop', 'warn', 'note']);
  });
});

describe('ticket exceptions', () => {
  it('stops a load that came in without a sample', () => {
    const found = findExceptions(
      { tickets: [ticket('T-1', { sampleId: undefined })], samples: [sample] },
      '2025-10-09'
    );
    expect(found[0].code).toBe('NO_SAMPLE');
    expect(found[0].severity).toBe('stop');
  });

  it('stops a load that graded sample grade', () => {
    const musty = createSample({ ...readings(), id: 'S-2', musty: true });
    const found = findExceptions(
      { tickets: [ticket('T-1', { sampleId: 'S-2' })], samples: [musty] },
      '2025-10-09'
    );
    expect(found.find((entry) => entry.code === 'SAMPLE_GRADE').message).toContain('musty');
  });

  it('warns on a reading over the meter ceiling', () => {
    const wet = createSample({ ...readings(), id: 'S-3', moisture: 38 });
    const found = findExceptions(
      { tickets: [ticket('T-1', { sampleId: 'S-3' })], samples: [wet] },
      '2025-10-09'
    );
    expect(found.some((entry) => entry.code === 'OVER_METER')).toBe(true);
  });

  it('warns on a ticket that has sat unsettled', () => {
    const desk = { tickets: [ticket('T-1')], samples: [sample] };
    expect(findExceptions(desk, '2025-10-11').some((entry) => entry.code === 'UNSETTLED')).toBe(
      false
    );
    expect(findExceptions(desk, '2025-10-20').some((entry) => entry.code === 'UNSETTLED')).toBe(
      true
    );
  });

  it('says nothing about a ticket that settled', () => {
    const desk = {
      tickets: [ticket('T-1')],
      samples: [sample],
      settlements: [{ ticket: 'T-1' }],
    };
    expect(findExceptions(desk, '2025-11-01')).toEqual([]);
  });

  it('ignores outbound tickets', () => {
    const desk = { tickets: [ticket('T-1', { direction: 'out', sampleId: undefined })] };
    expect(findExceptions(desk, '2025-11-01')).toEqual([]);
  });
});

function readings() {
  return {
    id: 'S-1',
    commodity: 'corn',
    day: '2025-10-09',
    testWeight: 55.4,
    damagedTotal: 2.1,
    heatDamaged: 0,
    bcfm: 1.8,
  };
}

describe('the rest of the desk', () => {
  it('warns on a contract that closed short', () => {
    const contract = createContract({
      id: 'C-1',
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
    });
    const position = applyLoad(openPosition(contract), {
      ticket: 'T-1',
      bushels: 100_000,
      day: '2025-10-15',
    });
    const found = findExceptions({ contracts: [position] }, '2025-12-05');
    expect(found[0].code).toBe('CONTRACT_SHORT');
    expect(found[0].message).toContain('4,000.00');
  });

  it('stops on a position that is unhedged past the limit', () => {
    const position = buildPosition({ commodity: 'corn', inventory: 50_000_000 });
    const found = findExceptions({ positions: [position] }, '2025-11-01', {
      unhedgedLimit: 10_000_000,
    });
    expect(found[0].code).toBe('UNHEDGED');
  });

  it('stops on a bin carrying more than it holds', () => {
    const bin = createBin({ id: 'B-1', diameterFeet: 15, eaveHeightFeet: 20 });
    const desk = { house: { holdings: { 'B-1': { bin, bushels: 90_000_000 } } } };
    expect(findExceptions(desk, '2025-11-01')[0].code).toBe('BIN_OVERFULL');
  });

  it('notes a receipt that has been open a year', () => {
    const receipt = issueReceipt({
      number: 'WR-1',
      account: 'HALVORSEN',
      commodity: 'corn',
      bushels: 100_000,
      issuedOn: '2024-09-01',
    });
    expect(findExceptions({ receipts: [receipt] }, '2025-11-01')[0].code).toBe('OLD_RECEIPT');
  });

  it('warns when the house is out of tolerance', () => {
    const desk = { reconciliation: { receipts: 1_000_000, measured: 1_020_000 } };
    expect(findExceptions(desk, '2025-11-01')[0].code).toBe('OUT_OF_TOLERANCE');
  });
});

describe('reading the report', () => {
  const found = findExceptions(
    { tickets: [ticket('T-1', { sampleId: undefined })], samples: [] },
    '2025-11-01'
  );

  it('counts by severity', () => {
    expect(countBySeverity(found).stop).toBe(1);
    expect(countBySeverity([]).warn).toBe(0);
  });

  it('sorts the stops to the top', () => {
    expect(found[0].severity).toBe('stop');
  });

  it('prints a table, or says there is nothing', () => {
    expect(renderExceptions(found)).toContain('NO_SAMPLE');
    expect(renderExceptions([])).toBe('Nothing to look at.');
  });
});
