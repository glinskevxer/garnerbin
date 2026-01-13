import { isArray, isPlainObject } from '../core/assert.js';
import { sampleForTicket, sampleIndex } from '../grading/sample.js';
import { isInbound } from '../weights/ticket.js';
import { settleLoad } from './settle.js';

/**
 * Settling a day against a house.
 *
 * Four commands used to build the same settleLoad call out of the same house
 * fields, and the fourth one to be written got the assessment filter subtly
 * wrong. It lives here now: given a house, the day's tickets and the samples,
 * this is the one place that decides which schedules and which charges apply.
 */

export function scheduleFor(house, commodity) {
  return {
    discountSchedule: house.discounts[commodity] ?? null,
    dryingSchedule: house.drying[commodity] ?? null,
    assessments: house.assessments.filter((entry) => entry.id.startsWith(`${commodity}-`)),
    shrinkFactor: house.shrinkFactor,
    handlingPercent: house.handlingPercent,
  };
}

export function settleAgainstHouse(house, { ticket, sample, bidPoints }) {
  return settleLoad({ ticket, sample, bidPoints, ...scheduleFor(house, ticket.commodity) });
}

/**
 * Settle every inbound ticket on the day. The bid comes from a function so a
 * caller can price each commodity off its own basis without this knowing how.
 */
export function settleDay(input) {
  isPlainObject(input, 'day');
  const house = isPlainObject(input.house, 'house');
  const tickets = isArray(input.tickets, 'tickets');
  const index = sampleIndex(isArray(input.samples ?? [], 'samples'));
  const bidFor = input.bidFor ?? (() => input.bidPoints);

  return tickets
    .filter(
      (ticket) =>
        isInbound(ticket) &&
        (input.day === undefined || ticket.day === input.day) &&
        (input.commodity === undefined || ticket.commodity === input.commodity) &&
        (input.ticket === undefined || ticket.number === input.ticket)
    )
    .map((ticket) =>
      settleAgainstHouse(house, {
        ticket,
        sample: sampleForTicket(index, ticket),
        bidPoints: bidFor(ticket.commodity, ticket),
      })
    );
}

export function totalsOf(settlements) {
  return {
    loads: settlements.length,
    grossBushels: settlements.reduce((sum, entry) => sum + entry.weights.grossBushels, 0),
    netBushels: settlements.reduce((sum, entry) => sum + entry.weights.netBushels, 0),
    dryingCents: settlements.reduce((sum, entry) => sum + entry.drying.cents, 0),
    discountCents: settlements.reduce((sum, entry) => sum + entry.discountCents, 0),
    netCents: settlements.reduce((sum, entry) => sum + entry.netCents, 0),
  };
}
