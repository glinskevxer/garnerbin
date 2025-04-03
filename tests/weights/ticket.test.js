import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  createTicket,
  DIRECTIONS,
  grossBushelsOf,
  isInbound,
  isOutbound,
  splitTicket,
  ticketLine,
  totalNetPounds,
} from '../../src/weights/ticket.js';

const fields = {
  number: 'T-10441',
  day: '2025-10-09',
  commodity: 'corn',
  account: 'HALVORSEN',
  hauler: 'Halvorsen Farms',
  unit: 'blue peterbilt',
  grossPounds: 78_540,
  tarePounds: 28_100,
};

describe('createTicket', () => {
  it('works the net weight out of the two weighings', () => {
    const ticket = createTicket(fields);
    expect(ticket.netPounds).toBe(50_440);
    expect(ticket.direction).toBe('in');
    expect(ticket.carrier).toBe('hopperTrailer');
    expect(Object.isFrozen(ticket)).toBe(true);
  });

  it('takes the two directions and no others', () => {
    expect(DIRECTIONS).toEqual(['in', 'out']);
    expect(createTicket({ ...fields, direction: 'out' }).direction).toBe('out');
    expect(() => createTicket({ ...fields, direction: 'sideways' })).toThrow(/must be one of/);
  });

  it('refuses a ticket keyed in backwards', () => {
    expect(() => createTicket({ ...fields, grossPounds: 28_100, tarePounds: 78_540 })).toThrow(
      /tare 78540 is over gross 28100/
    );
  });

  it('refuses an inbound load that weighed nothing', () => {
    expect(() => createTicket({ ...fields, grossPounds: 28_100 })).toThrow(/weighed in empty/);
  });

  it('lets an outbound ticket weigh zero, which happens on a rejected load', () => {
    const ticket = createTicket({ ...fields, direction: 'out', grossPounds: 28_100 });
    expect(ticket.netPounds).toBe(0);
  });

  it('refuses a carrier and a commodity it does not know', () => {
    expect(() => createTicket({ ...fields, carrier: 'wheelbarrow' })).toThrow(/must be one of/);
    expect(() => createTicket({ ...fields, commodity: 'oats' })).toThrow(/must be one of/);
  });

  it('needs an account to settle against', () => {
    const { account: _account, ...noAccount } = fields;
    expect(() => createTicket(noAccount)).toThrow(/account is required/);
  });

  it('leaves the optional fields null rather than undefined', () => {
    const { hauler: _hauler, unit: _unit, ...bare } = fields;
    const ticket = createTicket(bare);
    expect(ticket.hauler).toBeNull();
    expect(ticket.bin).toBeNull();
    expect(ticket.remarks).toBe('');
  });
});

describe('bushels on the ticket', () => {
  it('divides by the legal weight', () => {
    expect(formatBushels(grossBushelsOf(createTicket(fields)))).toBe('900.71');
  });

  it('divides beans by sixty', () => {
    const beans = createTicket({ ...fields, commodity: 'soybeans' });
    expect(formatBushels(grossBushelsOf(beans))).toBe('840.66');
  });

  it('prints a register line', () => {
    expect(ticketLine(createTicket(fields))).toBe('T-10441  2025-10-09  in   corn          900.71');
    expect(ticketLine(createTicket({ ...fields, direction: 'out' }))).toContain('out');
  });

  it('knows which way a ticket runs', () => {
    expect(isInbound(createTicket(fields))).toBe(true);
    expect(isOutbound(createTicket({ ...fields, direction: 'out' }))).toBe(true);
  });
});

describe('splitting a load', () => {
  it('cuts the pounds by the shares', () => {
    const parts = splitTicket(createTicket(fields), [
      { share: 0.5, account: 'HALVORSEN' },
      { share: 0.5, account: 'DRAKE-TRUST' },
    ]);
    expect(parts).toHaveLength(2);
    expect(parts[0].netPounds).toBe(25_220);
    expect(parts[1].netPounds).toBe(25_220);
    expect(parts[1].account).toBe('DRAKE-TRUST');
    expect(parts[0].number).toBe('T-10441-1');
  });

  it('gives the rounding leftovers to the last share', () => {
    const parts = splitTicket(createTicket(fields), [
      { share: 1 / 3 },
      { share: 1 / 3 },
      { share: 1 / 3 },
    ]);
    expect(totalNetPounds(parts)).toBe(50_440);
    expect(parts[2].netPounds).not.toBe(parts[0].netPounds);
  });

  it('refuses shares that do not add to one', () => {
    expect(() => splitTicket(createTicket(fields), [{ share: 0.4 }, { share: 0.4 }])).toThrow(
      /add to 0.8/
    );
  });

  it('refuses an empty split', () => {
    expect(() => splitTicket(createTicket(fields), [])).toThrow(/at least 1/);
  });
});
