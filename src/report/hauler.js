import { isArray } from '../core/assert.js';
import { percentOf, roundHalfUp } from '../core/numbers.js';
import { bushelsToDecimal } from '../core/money.js';
import { heading, renderTable } from '../core/text.js';
import { bushelColumn, moneyColumn, numberColumn, textColumn } from './columns.js';
import { grossBushelsOf, isInbound } from '../weights/ticket.js';

/**
 * Who hauled what.
 *
 * The manager wants this for two reasons. One is a thank you note at Christmas
 * to whoever moved the most bushels. The other is the reason it is worth
 * writing down: a hauler whose loads are consistently wetter or dirtier than
 * everybody else's is either cutting a wet corner of a field or not covering
 * his trailer, and either way it costs the house shrink it did not price.
 */

export function haulerSummary(tickets, settlements = []) {
  isArray(tickets, 'tickets');
  const byTicket = new Map(settlements.map((entry) => [entry.ticket, entry]));
  const haulers = new Map();

  for (const ticket of tickets) {
    if (!isInbound(ticket)) continue;
    const key = ticket.hauler ?? ticket.account;
    const row = haulers.get(key) ?? {
      hauler: key,
      loads: 0,
      grossBushels: 0,
      netBushels: 0,
      units: new Set(),
      moistureProduct: 0,
      moistureBushels: 0,
      netCents: 0,
      settled: 0,
    };
    row.loads += 1;
    row.grossBushels += grossBushelsOf(ticket);
    if (ticket.unit) row.units.add(ticket.unit);

    const settlement = byTicket.get(ticket.number);
    if (settlement) {
      row.settled += 1;
      row.netBushels += settlement.weights.netBushels;
      row.netCents += settlement.netCents;
      row.moistureProduct += settlement.weights.moisture * settlement.weights.grossBushels;
      row.moistureBushels += settlement.weights.grossBushels;
    }
    haulers.set(key, row);
  }

  return [...haulers.values()]
    .map((row) => ({
      hauler: row.hauler,
      loads: row.loads,
      units: [...row.units].sort(),
      grossBushels: row.grossBushels,
      netBushels: row.netBushels,
      averageLoad: row.loads === 0 ? 0 : Math.round(row.grossBushels / row.loads),
      averageMoisture:
        row.moistureBushels === 0
          ? null
          : roundHalfUp(row.moistureProduct / row.moistureBushels, 1),
      shrinkPercent:
        row.settled === 0
          ? null
          : percentOf(
              bushelsToDecimal(row.grossBushels - row.netBushels),
              bushelsToDecimal(row.grossBushels),
              2
            ),
      netCents: row.netCents,
      settled: row.settled,
    }))
    .sort((a, b) => b.grossBushels - a.grossBushels);
}

/** Haulers running wetter than the house average, and by how much. */
export function wetterThanAverage(rows) {
  const measured = rows.filter((row) => row.averageMoisture !== null);
  if (measured.length === 0) return [];
  const bushels = measured.reduce((sum, row) => sum + row.grossBushels, 0);
  const average =
    measured.reduce((sum, row) => sum + row.averageMoisture * row.grossBushels, 0) / bushels;
  return measured
    .filter((row) => row.averageMoisture > average)
    .map((row) => ({
      hauler: row.hauler,
      averageMoisture: row.averageMoisture,
      overHouse: roundHalfUp(row.averageMoisture - average, 2),
    }))
    .sort((a, b) => b.overHouse - a.overHouse);
}

export function busiest(rows, count = 3) {
  return rows.slice(0, count);
}

export function renderHaulers(rows, { house = 'unnamed house' } = {}) {
  return [
    heading(`${house} haulers`),
    '',
    renderTable(
      [
        textColumn('hauler', 'hauler'),
        numberColumn('loads', 'loads'),
        bushelColumn('gross', 'grossBushels'),
        bushelColumn('average load', 'averageLoad'),
        numberColumn('moisture', 'averageMoisture', { places: 1 }),
        numberColumn('shrink pct', 'shrinkPercent', { places: 2 }),
        moneyColumn('paid', (row) => (row.settled === 0 ? null : row.netCents)),
      ],
      rows
    ),
  ].join('\n');
}
