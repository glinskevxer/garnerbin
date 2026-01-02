import { writeFileSync } from 'node:fs';
import { ConfigError } from '../core/errors.js';
import { bushelsFromDecimal } from '../core/money.js';
import { closeDay, needsAttention, renderClose } from '../report/dailyclose.js';
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
 * Close the day.
 *
 * This is the last command run before the office locks up. It settles what it
 * can, foots the bushels against whatever the bins were measured at, seals the
 * day, and refuses to say the day is closed if anything is still open.
 */

export function runClose(options) {
  const house = readHouse(options.house);
  const tickets = assertClean(readTickets(options.tickets), 'ticket');
  const day = options.day ?? tickets[0]?.day;
  if (!day) {
    throw new ConfigError('NO_DAY', 'the ticket file is empty and no day was given', {});
  }

  let settlements = [];
  if (options.samples && (options.bid || options.board)) {
    const samples = assertClean(readSamples(options.samples), 'sample');
    const index = sampleIndex(samples);
    settlements = tickets
      .filter((ticket) => ticket.day === day && ticket.direction === 'in')
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

  const close = closeDay({
    day,
    house: house.name,
    tickets,
    settlements,
    opening: options.opening === undefined ? 0 : bushelsFromDecimal(Number(options.opening)),
    measured:
      options.measured === undefined ? undefined : bushelsFromDecimal(Number(options.measured)),
  });

  const attention = needsAttention(close);
  const lines = [renderClose(close)];
  if (attention.length === 0) {
    lines.push('', 'Nothing needs looking at. The day is closed.');
  } else {
    lines.push('', 'Before this day is closed:', ...attention.map((reason) => `  ${reason}`));
  }

  if (options.out) {
    writeFileSync(options.out, `${JSON.stringify(close.journal, null, 2)}\n`, 'utf8');
  }
  return { close, attention, text: lines.join('\n') };
}

export function register(program) {
  program
    .command('close')
    .description('settle, foot and seal a day before the office locks up')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-t, --tickets <path>', 'a scale ticket extract')
    .option('-s, --samples <path>', 'a sample extract, needed to settle')
    .option('-b, --bid <price>', 'the posted bid, such as 4.2750')
    .option('--board <path>', 'a settlement board file')
    .option('--basis <path>', 'a basis board file')
    .option('--period <period>', 'the delivery period on the basis board')
    .option('-d, --day <day>', 'the day to close, defaults to the first in the file')
    .option('--opening <bushels>', 'what was in the house this morning')
    .option('--measured <bushels>', 'what the bins measured tonight')
    .option('-o, --out <path>', 'write the sealed journal to a file')
    .action((options) => {
      const result = runClose(options);
      console.log(result.text);
      if (result.attention.length > 0) process.exitCode = 1;
    });
}
