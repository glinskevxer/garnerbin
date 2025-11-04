import { heading, keyValue, renderTable } from '../core/text.js';
import { capacityOf } from '../inventory/bins.js';
import { formatBushels } from '../core/money.js';
import { houseSummary } from '../config/house.js';
import { readHouse, readSamples, readTickets, sampleForTicket, sampleIndex } from './desk.js';

/**
 * Read everything the desk is pointed at and say whether it holds together.
 *
 * This is the command an operator runs before anything else in the morning. It
 * is deliberately noisy about what it checked, because a validator that prints
 * "ok" and nothing else teaches nobody anything about what it did not check.
 */

export function runValidate(options) {
  const house = readHouse(options.house);
  const lines = [
    heading(`${house.name} configuration`),
    keyValue(Object.entries(houseSummary(house)).map(([key, value]) => [key, String(value)])),
    '',
    renderTable(
      [
        { header: 'bin', key: 'id' },
        { header: 'kind', key: 'kind' },
        { header: 'holds', value: (bin) => bin.commodity ?? 'anything' },
        { header: 'bushels', value: (bin) => formatBushels(capacityOf(bin)), align: 'right' },
      ],
      house.bins
    ),
  ];

  const problems = [];
  if (options.tickets) {
    const tickets = readTickets(options.tickets);
    problems.push(
      ...tickets.problems.map((problem) => `tickets row ${problem.row}: ${problem.message}`)
    );
    lines.push('', `${tickets.records.length} tickets read`);

    if (options.samples) {
      const samples = readSamples(options.samples);
      problems.push(
        ...samples.problems.map((problem) => `samples row ${problem.row}: ${problem.message}`)
      );
      lines.push(`${samples.records.length} samples read`);
      const index = sampleIndex(samples.records);
      for (const ticket of tickets.records.filter((entry) => entry.direction === 'in')) {
        try {
          sampleForTicket(index, ticket);
        } catch (error) {
          problems.push(error.message);
        }
      }
    }
    const bins = new Set(house.bins.map((bin) => bin.id));
    for (const ticket of tickets.records) {
      if (ticket.bin && !bins.has(ticket.bin)) {
        problems.push(`${ticket.number} names bin ${ticket.bin}, which this house does not have`);
      }
      if (!house.commodities.includes(ticket.commodity)) {
        problems.push(`${ticket.number} is ${ticket.commodity}, which this house does not take`);
      }
    }
  }

  if (problems.length > 0) {
    lines.push('', heading('problems'), problems.map((problem) => `  ${problem}`).join('\n'));
  } else {
    lines.push('', 'Nothing to fix.');
  }
  return { text: lines.join('\n'), problems };
}

export function register(program) {
  program
    .command('validate')
    .description('read the house file and the day extracts and check they hold together')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .option('-t, --tickets <path>', 'a scale ticket extract')
    .option('-s, --samples <path>', 'a sample extract')
    .option('--strict', 'exit non zero when anything is wrong', false)
    .action((options) => {
      const result = runValidate(options);
      console.log(result.text);
      if (options.strict && result.problems.length > 0) process.exitCode = 1;
    });
}
