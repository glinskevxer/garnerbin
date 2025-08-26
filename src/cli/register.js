import { writeFileSync } from 'node:fs';
import { ConfigError } from '../core/errors.js';
import { buildRegister, registerCsv, renderRegister } from '../report/register.js';
import { settleLoad } from '../settlement/settle.js';
import { bidFor } from './settle.js';
import {
  assertClean,
  readHouse,
  readSamples,
  readTickets,
  sampleForTicket,
  sampleIndex,
} from './desk.js';

/**
 * The daily ticket register.
 *
 * It runs with or without settlements. Without a bid it prints the weights
 * alone, which is what the scale house wants at close of business; with one it
 * settles as it goes and foots the money too, which is what the office wants
 * the next morning.
 */

export function runRegister(options) {
  const house = readHouse(options.house);
  const tickets = assertClean(readTickets(options.tickets), 'ticket');
  const day = options.day ?? tickets[0]?.day;
  if (!day) {
    throw new ConfigError('NO_DAY', 'the ticket file is empty and no day was given', {});
  }
  const onDay = tickets.filter((ticket) => ticket.day === day);

  let settlements = [];
  if (options.samples && (options.bid || options.board)) {
    const samples = assertClean(readSamples(options.samples), 'sample');
    const index = sampleIndex(samples);
    settlements = onDay
      .filter((ticket) => ticket.direction === 'in')
      .map((ticket) =>
        settleLoad({
          ticket,
          sample: sampleForTicket(index, ticket),
          bidPoints: bidFor(options, ticket.commodity),
          discountSchedule: house.discounts[ticket.commodity] ?? null,
          dryingSchedule: house.drying[ticket.commodity] ?? null,
          assessments: house.assessments.filter((entry) => entry.id.startsWith(ticket.commodity)),
          shrinkFactor: house.shrinkFactor,
          handlingPercent: house.handlingPercent,
        })
      );
  }

  const register = buildRegister({ day, house: house.name, tickets: onDay, settlements });
  if (options.out) writeFileSync(options.out, registerCsv(register), 'utf8');
  return { register, text: renderRegister(register) };
}

export function register(program) {
  program
    .command('register')
    .description('print the ticket register for a day, settled or not')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-t, --tickets <path>', 'a scale ticket extract')
    .option('-s, --samples <path>', 'a sample extract, needed to settle')
    .option('-b, --bid <price>', 'the posted bid, such as 4.2750')
    .option('--board <path>', 'a settlement board file')
    .option('--basis <path>', 'a basis board file')
    .option('--period <period>', 'the delivery period on the basis board')
    .option('-d, --day <day>', 'the day to print, defaults to the first in the file')
    .option('-o, --out <path>', 'write the register to a csv')
    .action((options) => {
      console.log(runRegister(options).text);
    });
}
