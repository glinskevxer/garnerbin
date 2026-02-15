import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatMoney } from '../../src/core/money.js';
import { loadHouse } from '../../src/config/house.js';
import { importSamples, importTickets } from '../../src/io/importers.js';
import { settleDay } from '../../src/settlement/day.js';
import { buildRegister } from '../../src/report/register.js';
import { appendAll, GENESIS, openJournal } from '../../src/audit/journal.js';
import { grossBushelsOf } from '../../src/weights/ticket.js';
import { agreesWithRegister, assertAgrees, renderReplay, replay } from '../../src/audit/replay.js';

const read = (name) => readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8');
const house = loadHouse(JSON.parse(read('rush-creek.json')));
const tickets = importTickets(read('tickets-2025-10-09.csv')).records;
const samples = importSamples(read('samples-2025-10-09.csv')).records;
const settlements = settleDay({ house, tickets, samples, bidPoints: 42_750 });

const journal = appendAll(openJournal(house.name), [
  ...tickets.map((ticket) => ({
    day: ticket.day,
    event: 'ticket',
    detail: {
      number: ticket.number,
      direction: ticket.direction,
      account: ticket.account,
      commodity: ticket.commodity,
      grossBushels: grossBushelsOf(ticket),
    },
  })),
  ...settlements.map((settlement) => ({
    day: settlement.day,
    event: 'settlement',
    detail: {
      ticket: settlement.ticket,
      account: settlement.account,
      settlementBushels: settlement.weights.netBushels,
      netCents: settlement.netCents,
    },
  })),
]);

describe('replaying a journal', () => {
  const replayed = replay(journal);

  it('walks every entry', () => {
    expect(replayed.entries).toBe(15);
    expect(replayed.days).toEqual(['2025-10-09']);
  });

  it('splits the tickets by commodity and direction', () => {
    const corn = replayed.commodities.find((row) => row.commodity === 'corn');
    expect(corn.tickets).toBe(7);
    expect(corn.shipped).toBeGreaterThan(0);
    expect(corn.received).toBeGreaterThan(corn.shipped);
  });

  it('adds the settlements up by account', () => {
    expect(replayed.settlements).toBe(7);
    expect(replayed.accounts[0].cents).toBeGreaterThan(0);
    expect(formatMoney(replayed.paidCents)).toMatch(/^\d/);
  });

  it('stops at a day when told to', () => {
    expect(replay(journal, { through: '2025-10-08' }).entries).toBe(0);
    expect(replay(journal, { through: '2025-10-09' }).entries).toBe(15);
  });

  it('names an event it does not know rather than dropping it', () => {
    const odd = appendAll(journal, [{ day: '2025-10-10', event: 'fumigation', detail: {} }]);
    expect(replay(odd).unhandled).toEqual(['fumigation']);
  });

  it('refuses a journal whose seal is broken', () => {
    const tampered = { ...journal, head: GENESIS };
    expect(() => replay(tampered)).toThrow(/the journal breaks/);
  });
});

describe('against the register', () => {
  const register = buildRegister({
    day: '2025-10-09',
    house: house.name,
    tickets,
    settlements,
  });

  it('agrees with a register built the ordinary way', () => {
    expect(agreesWithRegister(replay(journal), register).ok).toBe(true);
    expect(assertAgrees(replay(journal), register)).toBe(true);
  });

  it('catches a register with a ticket the journal never saw', () => {
    const extra = buildRegister({
      day: '2025-10-09',
      tickets: [...tickets, { ...tickets[0], number: 'T-99999' }],
      settlements,
    });
    const result = agreesWithRegister(replay(journal), extra);
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toContain('the register holds 9');
  });

  it('does not compare money against a register that settled nothing', () => {
    const weightsOnly = buildRegister({ day: '2025-10-09', tickets, settlements: [] });
    const result = agreesWithRegister(replay(journal), weightsOnly);
    expect(result.comparedMoney).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('catches money that does not match', () => {
    const short = buildRegister({
      day: '2025-10-09',
      tickets,
      settlements: settlements.slice(0, 3),
    });
    expect(() => assertAgrees(replay(journal), short)).toThrow(/the journal paid/);
  });
});

describe('printing a replay', () => {
  it('says what it found', () => {
    const text = renderReplay(replay(journal));
    expect(text).toContain('Rush Creek Grain: 15 entries over 1 days');
    expect(text).toContain('corn');
    expect(text).toContain('7 settlements');
  });
});
