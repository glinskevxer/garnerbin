import { formatBushels, formatMoney } from '../core/money.js';
import { toCsv } from '../io/csv.js';
import { busiest, haulerSummary, renderHaulers, wetterThanAverage } from '../report/hauler.js';
import { settleDay } from '../settlement/day.js';
import { addBidOptions, addDeskOptions, bidFor, wantsSettlement } from './options.js';
import { assertClean, readHouse, readSamples, readTickets, writeOut } from './desk.js';

/**
 * Who hauled what, and who is running wet.
 *
 * Without a bid it works off the tickets alone and the moisture and shrink
 * columns come out blank, which is honest: those numbers only exist once the
 * loads have been graded and settled.
 */

export function runHaulers(options) {
  const house = readHouse(options.house);
  const tickets = assertClean(readTickets(options.tickets), 'ticket');
  const day = options.day ?? tickets[0]?.day;
  const onDay = options.allDays ? tickets : tickets.filter((ticket) => ticket.day === day);

  let settlements = [];
  if (wantsSettlement(options)) {
    const samples = assertClean(readSamples(options.samples), 'sample');
    settlements = settleDay({
      house,
      tickets: onDay,
      samples,
      bidFor: (commodity) => bidFor(options, commodity),
    });
  }

  const rows = haulerSummary(onDay, settlements);
  const wet = wetterThanAverage(rows);
  const parts = [renderHaulers(rows, { house: house.name })];
  if (wet.length > 0) {
    parts.push(
      '',
      'Running wetter than the house:',
      ...wet.map(
        (entry) => `  ${entry.hauler} at ${entry.averageMoisture}, ${entry.overHouse} over`
      )
    );
  }
  parts.push(
    '',
    `Busiest: ${busiest(rows)
      .map((row) => `${row.hauler} (${formatBushels(row.grossBushels)})`)
      .join(', ')}`
  );

  if (options.out) writeOut(options.out, haulersCsv(rows), 'hauler summary');
  return { rows, wet, text: parts.join('\n') };
}

export function haulersCsv(rows) {
  return toCsv(rows, [
    { header: 'hauler', key: 'hauler' },
    { header: 'loads', key: 'loads' },
    { header: 'units', value: (row) => row.units.join(' ') },
    { header: 'grossBushels', value: (row) => formatBushels(row.grossBushels) },
    { header: 'averageLoad', value: (row) => formatBushels(row.averageLoad) },
    { header: 'averageMoisture', value: (row) => row.averageMoisture ?? '' },
    { header: 'shrinkPercent', value: (row) => row.shrinkPercent ?? '' },
    {
      header: 'paid',
      value: (row) => (row.settled === 0 ? '' : formatMoney(row.netCents, { grouped: false })),
    },
  ]);
}

export function register(program) {
  const command = program
    .command('haulers')
    .description('summarise who hauled what and who is running wet');
  addDeskOptions(command);
  addBidOptions(command)
    .option('--all-days', 'take every day in the file rather than one', false)
    .option('-o, --out <path>', 'write the summary to a csv')
    .action((options) => {
      console.log(runHaulers(options).text);
    });
}
