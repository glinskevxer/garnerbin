import { heading, keyValue } from '../core/text.js';
import { assertDay } from '../core/dates.js';
import { buildPosition } from '../inventory/position.js';
import { createContract } from '../contracts/types.js';
import { openPosition } from '../contracts/apply.js';
import { countBySeverity, findExceptions, renderExceptions } from '../report/exceptions.js';
import { applyTickets } from './contracts.js';
import { assertClean, readHouse, readJsonFile, readSamples, readTickets } from './desk.js';

/**
 * The morning exception sheet.
 *
 * It takes whichever files the operator has and checks the ones it got. A desk
 * that only has tickets and samples still gets the ticket checks; adding the
 * position file adds the hedge check. Nothing is skipped silently: the header
 * lists what it looked at.
 */

export function runExceptions(options) {
  const asOf = assertDay(options.asOf, 'asOf');
  const house = readHouse(options.house);
  const desk = {};
  const looked = ['house'];

  if (options.tickets) {
    desk.tickets = assertClean(readTickets(options.tickets), 'ticket');
    looked.push('tickets');
  }
  if (options.samples) {
    desk.samples = assertClean(readSamples(options.samples), 'sample');
    looked.push('samples');
  }
  if (options.contracts) {
    const document = readJsonFile(options.contracts, 'contract file');
    const positions = (document.contracts ?? []).map((entry) =>
      openPosition(createContract(entry))
    );
    desk.contracts = desk.tickets ? applyTickets(positions, desk.tickets).positions : positions;
    looked.push('contracts');
  }
  if (options.position) {
    const document = readJsonFile(options.position, 'position file');
    desk.positions = (document.positions ?? []).map((entry) => buildPosition(entry));
    looked.push('position');
  }

  const found = findExceptions(desk, asOf, {
    unsettledDays: Number(options.unsettledDays ?? 3),
    unhedgedLimit: options.unhedgedLimit ? Number(options.unhedgedLimit) * 100 : Infinity,
  });
  const counts = countBySeverity(found);

  const text = [
    heading(`${house.name} exceptions at ${asOf}`),
    keyValue([
      ['Looked at', looked.join(', ')],
      ['Stops', String(counts.stop)],
      ['Warnings', String(counts.warn)],
      ['Notes', String(counts.note)],
    ]),
    '',
    renderExceptions(found),
  ].join('\n');

  return { exceptions: found, counts, looked, text };
}

export function register(program) {
  program
    .command('exceptions')
    .description('list the things on the desk that are going to cost money')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-a, --as-of <day>', 'the day to check at')
    .option('-t, --tickets <path>', 'a scale ticket extract')
    .option('-s, --samples <path>', 'a sample extract')
    .option('--contracts <path>', 'a contract file')
    .option('--position <path>', 'a position file')
    .option('--unsettled-days <days>', 'how long a ticket may sit unsettled', '3')
    .option('--unhedged-limit <bushels>', 'the unhedged covenant, in bushels')
    .action((options) => {
      const result = runExceptions(options);
      console.log(result.text);
      if (result.counts.stop > 0) process.exitCode = 1;
    });
}
