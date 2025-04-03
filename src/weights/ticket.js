import { TicketError } from '../core/errors.js';
import { isArray, isPlainObject, isString, nonNegative, oneOf } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { formatBushels } from '../core/money.js';
import { assertDay } from '../core/dates.js';
import { assertCommodityId, legalWeight } from '../commodity/registry.js';
import { CARRIER_IDS } from '../grading/probe.js';
import { netWeight, poundsToBushels } from '../core/units.js';

/**
 * The scale ticket.
 *
 * Two weighings and everything else is bookkeeping. The ticket is the record of
 * record: it is what the grower keeps, what the auditor pulls, and what every
 * later number in the office is derived from, so it validates hard and it never
 * changes once it is written.
 */

export const DIRECTIONS = Object.freeze(['in', 'out']);

export function createTicket(input) {
  isPlainObject(input, 'ticket');
  const grossPounds = nonNegative(input.grossPounds, 'grossPounds');
  const tarePounds = nonNegative(input.tarePounds, 'tarePounds');
  const ticket = {
    number: isString(input.number, 'number'),
    day: assertDay(input.day, 'day'),
    direction: oneOf(input.direction ?? 'in', 'direction', DIRECTIONS),
    commodity: assertCommodityId(input.commodity),
    carrier: oneOf(input.carrier ?? 'hopperTrailer', 'carrier', CARRIER_IDS),
    hauler: input.hauler === undefined ? null : isString(input.hauler, 'hauler'),
    unit: input.unit === undefined ? null : isString(input.unit, 'unit'),
    account: isString(input.account, 'account'),
    grossPounds: roundHalfUp(grossPounds, 0),
    tarePounds: roundHalfUp(tarePounds, 0),
    netPounds: netWeight(grossPounds, tarePounds),
    sampleId: input.sampleId === undefined ? null : isString(input.sampleId, 'sampleId'),
    bin: input.bin === undefined ? null : isString(input.bin, 'bin'),
    remarks:
      input.remarks === undefined ? '' : isString(input.remarks, 'remarks', { allowEmpty: true }),
  };
  if (ticket.netPounds === 0 && ticket.direction === 'in') {
    throw new TicketError('EMPTY_LOAD', `ticket ${ticket.number} weighed in empty`, {
      number: ticket.number,
    });
  }
  return Object.freeze(ticket);
}

export function isInbound(ticket) {
  return ticket.direction === 'in';
}

export function isOutbound(ticket) {
  return ticket.direction === 'out';
}

/** Gross bushels off the legal weight, before dockage and before shrink. */
export function grossBushelsOf(ticket) {
  return poundsToBushels(ticket.netPounds, legalWeight(ticket.commodity));
}

export function ticketLine(ticket) {
  const arrow = isInbound(ticket) ? 'in ' : 'out';
  return [
    ticket.number,
    ticket.day,
    arrow,
    ticket.commodity.padEnd(8),
    formatBushels(grossBushelsOf(ticket)).padStart(10),
  ].join('  ');
}

/**
 * Split a load across accounts or bins.
 *
 * The pit does this when a grower hauls for himself and a landlord on the same
 * truck. The pounds have to come out exactly, so the last split takes whatever
 * rounding left behind rather than the whole thing quietly losing a pound.
 */
export function splitTicket(ticket, splits) {
  isArray(splits, 'splits', { minLength: 1 });
  let shareTotal = 0;
  for (const split of splits) {
    shareTotal += nonNegative(split.share, 'share');
  }
  if (roundHalfUp(shareTotal, 6) !== 1) {
    throw new TicketError('SPLIT_NOT_WHOLE', `the shares add to ${shareTotal}, not 1`, {
      number: ticket.number,
      shareTotal,
    });
  }
  const parts = [];
  let assigned = 0;
  splits.forEach((split, index) => {
    const last = index === splits.length - 1;
    const pounds = last
      ? ticket.netPounds - assigned
      : roundHalfUp(ticket.netPounds * split.share, 0);
    assigned += pounds;
    parts.push(
      Object.freeze({
        ...ticket,
        number: `${ticket.number}-${index + 1}`,
        account: split.account ?? ticket.account,
        bin: split.bin ?? ticket.bin,
        share: split.share,
        grossPounds: roundHalfUp(ticket.grossPounds * split.share, 0),
        tarePounds: roundHalfUp(ticket.tarePounds * split.share, 0),
        netPounds: pounds,
      })
    );
  });
  return parts;
}

export function totalNetPounds(tickets) {
  return tickets.reduce((sum, ticket) => sum + ticket.netPounds, 0);
}
