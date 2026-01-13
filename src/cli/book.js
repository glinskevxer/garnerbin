import { writeFileSync } from 'node:fs';
import { formatBushels, formatMoney } from '../core/money.js';
import { heading, keyValue } from '../core/text.js';
import { appendAll, openJournal, verifyJournal } from '../audit/journal.js';
import { settleDay } from '../settlement/day.js';
import { grossBushelsOf } from '../weights/ticket.js';
import { bidFor } from './settle.js';
import { assertClean, readHouse, readSamples, readTickets } from './desk.js';

/**
 * Book a day into the audit journal.
 *
 * Two runs of the same day over the same files produce the same seal. That is
 * the property the auditor checks, and it is why nothing in here reads the
 * clock: the day comes off the tickets, not off the machine.
 */

export function entriesForDay(house, tickets, samples, options) {
  const entries = [];
  for (const ticket of tickets) {
    entries.push({
      day: ticket.day,
      event: 'ticket',
      detail: {
        number: ticket.number,
        direction: ticket.direction,
        account: ticket.account,
        commodity: ticket.commodity,
        netPounds: ticket.netPounds,
        grossBushels: grossBushelsOf(ticket),
      },
    });
  }
  if (!options.bid && !options.board) return entries;
  const settlements = settleDay({
    house,
    tickets,
    samples,
    bidFor: (commodity) => bidFor(options, commodity),
  });
  for (const settlement of settlements) {
    entries.push({
      day: settlement.day,
      event: 'settlement',
      detail: {
        ticket: settlement.ticket,
        account: settlement.account,
        grade: settlement.grade.label,
        settlementBushels: settlement.weights.netBushels,
        netPricePoints: settlement.netPricePoints,
        netCents: settlement.netCents,
      },
    });
  }
  return entries;
}

export function runBook(options) {
  const house = readHouse(options.house);
  const tickets = assertClean(readTickets(options.tickets), 'ticket');
  const samples = options.samples ? assertClean(readSamples(options.samples), 'sample') : [];
  const day = options.day ?? tickets[0]?.day;
  const onDay = tickets.filter((ticket) => ticket.day === day);
  const entries = entriesForDay(house, onDay, samples, options);
  const journal = appendAll(openJournal(house.name), entries);
  const sound = verifyJournal(journal);

  const settlements = journal.entries.filter((entry) => entry.event === 'settlement');
  const text = [
    heading(`${house.name} journal for ${day}`),
    keyValue([
      ['Entries', String(journal.entries.length)],
      ['Tickets', String(journal.entries.filter((entry) => entry.event === 'ticket').length)],
      ['Settlements', String(settlements.length)],
      [
        'Bushels settled',
        formatBushels(settlements.reduce((sum, entry) => sum + entry.detail.settlementBushels, 0)),
      ],
      ['Paid out', formatMoney(settlements.reduce((sum, entry) => sum + entry.detail.netCents, 0))],
      ['Sound', sound.ok ? 'yes' : `no, breaks at ${sound.brokenAt}`],
    ]),
    '',
    `The journal seals to ${journal.head}`,
  ].join('\n');

  if (options.out) writeFileSync(options.out, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  return { journal, sound, text };
}

export function register(program) {
  program
    .command('book')
    .description('book a days tickets and settlements into a sealed journal')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-t, --tickets <path>', 'a scale ticket extract')
    .option('-s, --samples <path>', 'a sample extract, needed to settle')
    .option('-b, --bid <price>', 'the posted bid, such as 4.2750')
    .option('--board <path>', 'a settlement board file')
    .option('--basis <path>', 'a basis board file')
    .option('--period <period>', 'the delivery period on the basis board')
    .option('-d, --day <day>', 'the day to book, defaults to the first in the file')
    .option('-o, --out <path>', 'write the journal to a file')
    .action((options) => {
      const result = runBook(options);
      console.log(result.text);
      if (!result.sound.ok) process.exitCode = 1;
    });
}
