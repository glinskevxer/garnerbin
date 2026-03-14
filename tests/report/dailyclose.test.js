import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import { createTicket } from '../../src/weights/ticket.js';
import { createSample } from '../../src/grading/sample.js';
import { settleLoad } from '../../src/settlement/settle.js';
import { verifyJournal } from '../../src/audit/journal.js';
import { closeDay, needsAttention, renderClose } from '../../src/report/dailyclose.js';

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
    ...overrides,
  });
}

const tickets = [
  ticket('T-1'),
  ticket('T-2', { commodity: 'soybeans' }),
  ticket('T-3', { direction: 'out' }),
  ticket('T-9', { day: '2025-10-10' }),
];

const settlements = [settleLoad({ ticket: tickets[0], sample, bidPoints: 42_750 })];

describe('closing a day', () => {
  const close = closeDay({
    day: '2025-10-09',
    house: 'Rush Creek Grain',
    tickets,
    settlements,
  });

  it('leaves out the tickets from another day', () => {
    expect(close.register.totals.tickets).toBe(3);
  });

  it('splits received from shipped by commodity', () => {
    expect(formatBushels(close.byCommodity.corn.received)).toBe('900.00');
    expect(formatBushels(close.byCommodity.corn.shipped)).toBe('900.00');
    expect(close.byCommodity.soybeans.shipped).toBe(0);
  });

  it('seals the day', () => {
    expect(close.seal).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyJournal(close.journal).ok).toBe(true);
    expect(close.journal.entries).toHaveLength(3);
  });

  it('knows it does not foot with tickets unsettled', () => {
    expect(close.foots).toBe(false);
    expect(needsAttention(close)).toContain('1 tickets are not settled');
  });

  it('leaves the reconciliation out when nobody measured', () => {
    expect(close.reconciliation).toBeNull();
    expect(close.inTolerance).toBeNull();
  });
});

describe('with a measurement', () => {
  it('foots the bushels against the bins', () => {
    const close = closeDay({
      day: '2025-10-09',
      tickets,
      settlements,
      opening: 0,
      measured: 84_000,
    });
    expect(close.reconciliation.book).toBe(84_000);
    expect(close.reconciliation.direction).toBe('flat');
    expect(close.inTolerance).toBe(true);
  });

  it('says so when the bins do not agree', () => {
    const close = closeDay({
      day: '2025-10-09',
      tickets,
      settlements,
      measured: 90_000,
    });
    expect(close.inTolerance).toBe(false);
    expect(needsAttention(close).some((reason) => reason.includes('over'))).toBe(true);
  });
});

describe('rendering', () => {
  it('prints the day and the seal', () => {
    const close = closeDay({ day: '2025-10-09', house: 'Rush Creek Grain', tickets, settlements });
    const text = renderClose(close);
    expect(text).toContain('Rush Creek Grain close for 2025-10-09');
    expect(text).toContain('The day seals to');
    expect(text).toContain('Everything settled  no');
  });

  it('prints the reconciliation when there is one', () => {
    const close = closeDay({ day: '2025-10-09', tickets, settlements, measured: 84_000 });
    expect(renderClose(close)).toContain('Inside tolerance');
  });

  it('says nothing needs attention on a clean day', () => {
    const beanSample = createSample({
      id: 'S-2',
      commodity: 'soybeans',
      day: '2025-10-09',
      testWeight: 55.8,
      damagedTotal: 1.8,
      heatDamaged: 0.1,
      foreignMaterial: 1.4,
      splits: 12.5,
      otherColors: 0.4,
      moisture: 12.6,
    });
    const everything = tickets
      .filter((entry) => entry.day === '2025-10-09')
      .map((entry) =>
        settleLoad({
          ticket: entry,
          sample: entry.commodity === 'soybeans' ? beanSample : sample,
          bidPoints: 42_750,
        })
      );
    const close = closeDay({
      day: '2025-10-09',
      tickets,
      settlements: everything,
      measured: 84_000,
    });
    expect(needsAttention(close)).toEqual([]);
  });
});
