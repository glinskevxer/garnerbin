import { describe, expect, it } from 'vitest';
import { formatBushels, formatMoney } from '../../src/core/money.js';
import { createTicket } from '../../src/weights/ticket.js';
import { createSample } from '../../src/grading/sample.js';
import { settleLoad } from '../../src/settlement/settle.js';
import { buildRegister, registerCsv, renderRegister } from '../../src/report/register.js';

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

const tickets = [
  ticket('T-1002'),
  ticket('T-1001', { account: 'DRAKE-TRUST' }),
  ticket('T-1003', { direction: 'out', account: 'CARGILL' }),
];

const settlements = [settleLoad({ ticket: tickets[0], sample, bidPoints: 42_750 })];

describe('buildRegister', () => {
  const register = buildRegister({
    day: '2025-10-09',
    house: 'Rush Creek',
    tickets,
    settlements,
  });

  it('sorts the tickets by number', () => {
    expect(register.rows.map((row) => row.ticket)).toEqual(['T-1001', 'T-1002', 'T-1003']);
  });

  it('hangs the settlement off the ticket it belongs to', () => {
    const settled = register.rows.find((row) => row.ticket === 'T-1002');
    expect(settled.grade).toBe('US No. 2');
    expect(formatMoney(settled.netCents)).toBe('3,847.50');
  });

  it('leaves an unsettled ticket blank rather than zero', () => {
    const open = register.rows.find((row) => row.ticket === 'T-1001');
    expect(open.netCents).toBeNull();
    expect(open.settlementBushels).toBeNull();
  });

  it('counts the two directions separately', () => {
    expect(register.totals.inbound).toBe(2);
    expect(register.totals.outbound).toBe(1);
    expect(register.totals.outboundPounds).toBe(50_400);
  });

  it('totals only the inbound bushels', () => {
    expect(formatBushels(register.totals.grossBushels)).toBe('1,800.00');
  });

  it('counts what is still unsettled', () => {
    expect(register.totals.unsettled).toBe(2);
  });

  it('refuses a day it cannot read', () => {
    expect(() => buildRegister({ day: 'friday', tickets })).toThrow(/YYYY-MM-DD/);
  });

  it('takes a register with no tickets at all', () => {
    const empty = buildRegister({ day: '2025-10-09', tickets: [] });
    expect(empty.totals.tickets).toBe(0);
    expect(empty.totals.netCents).toBe(0);
  });
});

describe('rendering', () => {
  const register = buildRegister({
    day: '2025-10-09',
    house: 'Rush Creek',
    tickets,
    settlements,
  });

  it('heads the sheet and foots the totals', () => {
    const text = renderRegister(register);
    expect(text).toContain('Rush Creek ticket register 2025-10-09');
    expect(text).toContain('Tickets                3 (2 in, 1 out)');
    expect(text).toMatch(/Paid out +3,847\.50/);
  });

  it('writes a csv with a header', () => {
    const csv = registerCsv(register);
    expect(csv.split('\n')[0]).toBe(
      'ticket,day,direction,account,commodity,netPounds,grossBushels,settlementBushels,grade,net'
    );
    expect(csv.split('\n')).toHaveLength(5);
  });

  it('leaves the money ungrouped in the csv', () => {
    expect(registerCsv(register)).toContain('3847.50');
  });
});
