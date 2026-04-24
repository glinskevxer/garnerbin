import { ConfigError } from '../core/errors.js';
import { formatBushels, formatMoney } from '../core/money.js';
import { heading, keyValue } from '../core/text.js';
import { toCsv } from '../io/csv.js';
import { buildSeason, marginOf, renderSeason } from '../report/seasonal.js';
import { settleDay } from '../settlement/day.js';
import { addBidOptions, addDeskOptions, bidFor } from './options.js';
import { assertClean, readHouse, readSamples, readTickets, writeOut } from './desk.js';

/**
 * The season, out of the tickets and the samples.
 *
 * It settles every day in the files and then adds them up, which is slower than
 * reading a saved settlement file and is the point: the season comes off the
 * same code path the settlements did, so it cannot quietly disagree with them.
 */

export function runSeason(options) {
  const house = readHouse(options.house);
  const tickets = assertClean(readTickets(options.tickets), 'ticket');
  const samples = assertClean(readSamples(options.samples), 'sample');
  const days = [...new Set(tickets.map((ticket) => ticket.day))].sort();

  const settlements = days.flatMap((day) =>
    settleDay({
      house,
      tickets,
      samples,
      day,
      bidFor: (commodity) => bidFor(options, commodity),
    })
  );
  if (settlements.length === 0) {
    throw new ConfigError('NOTHING_TO_ADD_UP', 'no inbound load in those files settled', {
      days,
    });
  }

  const commodities = options.commodity
    ? [options.commodity]
    : [...new Set(settlements.map((entry) => entry.commodity))].sort();

  const seasons = commodities.map((commodity) => buildSeason({ settlements, commodity }));
  const parts = [
    heading(`${house.name} season`),
    keyValue([
      ['Days', `${days[0]} to ${days.at(-1)}`],
      ['Loads settled', String(settlements.length)],
      ['Grains', commodities.join(', ')],
    ]),
  ];
  for (const season of seasons) {
    const margin = marginOf(season);
    parts.push(
      '',
      renderSeason(season),
      '',
      keyValue([
        ['Kept as shrink', formatBushels(margin.shrinkBushels)],
        ['Charged in discounts and drying', formatMoney(margin.chargedCents)],
      ])
    );
  }

  if (options.out) writeOut(options.out, seasonCsv(seasons), 'season summary');
  return { seasons, settlements, text: parts.join('\n') };
}

export function seasonCsv(seasons) {
  return toCsv(seasons, [
    { header: 'commodity', key: 'commodity' },
    { header: 'cropYear', key: 'cropYear' },
    { header: 'loads', key: 'loads' },
    { header: 'grossBushels', value: (row) => formatBushels(row.grossBushels) },
    { header: 'settlementBushels', value: (row) => formatBushels(row.netBushels) },
    { header: 'keptPercent', key: 'keptPercent' },
    { header: 'averageMoisture', key: 'averageMoisture' },
    { header: 'paid', value: (row) => formatMoney(row.netCents, { grouped: false }) },
  ]);
}

export function register(program) {
  const command = program
    .command('season')
    .description('settle every day in the files and add the season up');
  addDeskOptions(command);
  addBidOptions(command)
    .option('--commodity <id>', 'only this commodity')
    .option('-o, --out <path>', 'write the summary to a csv')
    .action((options) => {
      console.log(runSeason(options).text);
    });
}
