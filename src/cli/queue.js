import { ConfigError } from '../core/errors.js';
import { heading, keyValue } from '../core/text.js';
import { formatBushels } from '../core/money.js';
import {
  createPit,
  hourlyCapacity,
  renderDay,
  simulateDay,
  wouldAnotherPitHelp,
} from '../loadout/scheduling.js';
import { readJsonFile } from './desk.js';

/**
 * Run a harvest day through the pit.
 *
 * The answer worth having is at the bottom: whether another pit would fix the
 * line, or whether the dryer is the thing in the way and a second pit would
 * only move the queue from the road to the yard.
 */

export function runQueue(options) {
  const document = readJsonFile(options.file, 'arrivals file');
  if (!Array.isArray(document.arrivals)) {
    throw new ConfigError('NO_ARRIVALS', `${options.file} carries no arrivals array`, {
      path: options.file,
    });
  }
  const pit = createPit({
    ...(document.pit ?? {}),
    ...(options.pits ? { pits: Number(options.pits) } : {}),
    ...(options.rate ? { unloadBushelsPerHour: Number(options.rate) } : {}),
  });
  const day = simulateDay(pit, document.arrivals);
  const advice = wouldAnotherPitHelp(pit, document.arrivals);
  const capacity = hourlyCapacity(pit);

  const text = [
    heading(`The pit on ${document.day ?? 'a harvest day'}`),
    keyValue([
      ['Pits', String(pit.pits)],
      ['Unload rate', `${capacity.unloadBushelsPerHour} bushels an hour`],
      [
        'Dryer',
        pit.dryerBushelsPerHour === null ? 'not counted' : `${pit.dryerBushelsPerHour} an hour`,
      ],
      ['Limited by', capacity.limitedBy],
    ]),
    '',
    renderDay(day),
    '',
    keyValue([
      ['Loads', String(day.loads)],
      ['Bushels', formatBushels(day.bushels)],
      ['Mean wait', `${day.meanWait} minutes`],
      ['Longest wait', `${day.longestWait} minutes`],
      ['Through the pit', `${day.bushelsPerHour} bushels an hour`],
    ]),
    '',
    advice.worthIt
      ? `Another pit would take ${advice.savedMinutes} minutes off the longest wait.`
      : `Another pit would save ${advice.savedMinutes} minutes and the day is limited by ${advice.limitedBy}.`,
  ].join('\n');

  return { pit, day, advice, text };
}

export function register(program) {
  program
    .command('queue')
    .description('run a harvest days arrivals through the pit')
    .requiredOption('-f, --file <path>', 'the arrivals file')
    .option('--pits <count>', 'override how many pits are open')
    .option('--rate <bushels>', 'override the unload rate an hour')
    .action((options) => {
      console.log(runQueue(options).text);
    });
}
