import { writeFileSync } from 'node:fs';
import { ConfigError } from '../core/errors.js';
import { buildRegister, registerCsv, renderRegister } from '../report/register.js';
import { settleDay } from '../settlement/day.js';
import { addBidOptions, addDeskOptions, bidFor, wantsSettlement } from './options.js';
import { assertClean, readHouse, readSamples, readTickets } from './desk.js';

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
  if (wantsSettlement(options)) {
    const samples = assertClean(readSamples(options.samples), 'sample');
    settlements = settleDay({
      house,
      tickets: onDay,
      samples,
      day,
      bidFor: (commodity) => bidFor(options, commodity),
    });
  }

  const register = buildRegister({ day, house: house.name, tickets: onDay, settlements });
  if (options.out) writeFileSync(options.out, registerCsv(register), 'utf8');
  return { register, text: renderRegister(register) };
}

export function register(program) {
  const command = program
    .command('register')
    .description('print the ticket register for a day, settled or not');
  addDeskOptions(command);
  addBidOptions(command)
    .option('-o, --out <path>', 'write the register to a csv')
    .action((options) => {
      console.log(runRegister(options).text);
    });
}
