import { describe, expect, it } from 'vitest';
import { formatBushels, formatPrice } from '../../src/core/money.js';
import { createLayout } from '../../src/io/fixed.js';
import { grossBushelsOf } from '../../src/weights/ticket.js';
import { settleOf } from '../../src/pricing/quotes.js';
import { basisFor } from '../../src/pricing/basis.js';
import {
  FORMATS,
  importBasisBoard,
  importQuoteBoard,
  importSamples,
  importTickets,
  summariseImport,
} from '../../src/io/importers.js';

const ticketCsv = [
  'number,day,commodity,account,grossPounds,tarePounds',
  'T-1,2025-10-09,corn,HALVORSEN,78500,28100',
  'T-2,2025-10-09,corn,DRAKE-TRUST,76200,27900',
  '',
].join('\n');

describe('importing tickets', () => {
  it('builds a ticket a row', () => {
    const result = importTickets(ticketCsv);
    expect(result.records).toHaveLength(2);
    expect(result.problems).toEqual([]);
    expect(formatBushels(grossBushelsOf(result.records[0]))).toBe('900.00');
  });

  it('keeps going past a bad row and says which one', () => {
    const withBad = ticketCsv.replace('76200,27900', '27900,76200');
    const result = importTickets(withBad);
    expect(result.records).toHaveLength(1);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].row).toBe(2);
    expect(result.problems[0].message).toMatch(/tare 76200 is over gross 27900/);
  });

  it('takes the alternative column names the old extract uses', () => {
    const other = [
      'ticket,date,commodity,account,gross,tare',
      'T-9,2025-10-09,corn,X,78500,28100',
      '',
    ].join('\n');
    expect(importTickets(other).records[0].number).toBe('T-9');
  });

  it('strips the thousands separators the spreadsheet puts in', () => {
    const commas = [
      'number,day,commodity,account,grossPounds,tarePounds',
      '"T-3",2025-10-09,corn,X,"78,500","28,100"',
      '',
    ].join('\n');
    expect(importTickets(commas).records[0].netPounds).toBe(50_400);
  });

  it('reads a fixed width extract', () => {
    const layout = createLayout([
      { name: 'number', start: 1, length: 8, type: 'text' },
      { name: 'day', start: 9, length: 8, type: 'day' },
      { name: 'commodity', start: 17, length: 8, type: 'text' },
      { name: 'account', start: 25, length: 12, type: 'text' },
      { name: 'grossPounds', start: 37, length: 7, type: 'integer' },
      { name: 'tarePounds', start: 44, length: 7, type: 'integer' },
    ]);
    const line = 'T-10441 ' + '20251009' + 'corn    ' + 'HALVORSEN   ' + '0078500' + '0028100';
    const result = importTickets(`${line}\n`, { format: 'fixed', layout });
    expect(result.records[0].netPounds).toBe(50_400);
  });

  it('refuses a fixed import with no layout', () => {
    expect(() => importTickets('x', { format: 'fixed' })).toThrow(/needs a layout/);
  });

  it('refuses a format it does not have', () => {
    expect(() => importTickets('x', { format: 'xml' })).toThrow(/must be one of/);
    expect(FORMATS).toEqual(['csv', 'fixed']);
  });
});

describe('importing samples', () => {
  const sampleCsv = [
    'id,commodity,day,testWeight,damagedTotal,heatDamaged,bcfm,moisture',
    'S-1,corn,2025-10-09,55.4,2.1,0,1.8,16.4',
    'S-2,corn,2025-10-09,53.2,7.4,0.1,2.5,18.5',
    '',
  ].join('\n');

  it('builds a sample a row', () => {
    const result = importSamples(sampleCsv);
    expect(result.records).toHaveLength(2);
    expect(result.records[1].damagedTotal).toBe(7.4);
  });

  it('leaves out a reading the file did not carry', () => {
    expect(importSamples(sampleCsv).records[0].protein).toBeUndefined();
  });

  it('reports a reading that is out of range', () => {
    const bad = sampleCsv.replace('16.4', '96.4');
    const result = importSamples(bad);
    expect(result.problems[0].code).toBe('OUT_OF_RANGE');
  });
});

describe('importing boards', () => {
  it('reads a settlement board', () => {
    const csv = ['contract,settle', 'ZCZ25,4.2500', 'ZCH26,4.4000', ''].join('\n');
    const board = importQuoteBoard(csv, '2025-10-09');
    expect(formatPrice(settleOf(board, 'ZCZ25'))).toBe('4.2500');
  });

  it('reads a basis board', () => {
    const csv = ['period,contract,basis', '2025-10,ZCZ25,-0.3500', ''].join('\n');
    const board = importBasisBoard(csv, {
      house: 'Rush Creek',
      commodity: 'corn',
      day: '2025-10-09',
    });
    expect(basisFor(board, '2025-10')).toBe(-3500);
  });
});

describe('summarising', () => {
  it('says all good when nothing was refused', () => {
    expect(summariseImport(importTickets(ticketCsv), 'tickets')).toBe('2 tickets, all good');
  });

  it('counts the refusals', () => {
    const withBad = ticketCsv.replace('76200,27900', '27900,76200');
    expect(summariseImport(importTickets(withBad), 'tickets')).toBe('1 tickets in, 1 refused');
  });
});
