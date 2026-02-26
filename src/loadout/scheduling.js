import { ConfigError } from '../core/errors.js';
import { isArray, isInteger, isPlainObject, positive } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { bushelsToDecimal, formatBushels } from '../core/money.js';
import { renderTable } from '../core/text.js';

/**
 * The pit on a harvest day.
 *
 * Trucks arrive faster than the leg can take them and the line backs out onto
 * the road. Everybody knows that; what nobody knows without working it out is
 * whether a second pit fixes it or whether the dryer is the thing holding
 * everything up, and those two have very different price tags.
 *
 * The simulation is deterministic. Trucks are served in the order they arrive,
 * a pit takes one at a time, and the service time is the load over the unload
 * rate. That is not queueing theory and it does not need to be: it is what the
 * yard actually does, and the answer it gives can be checked against the day.
 */

export function createPit(input) {
  isPlainObject(input, 'pit');
  const pit = {
    pits: positive(isInteger(input.pits ?? 1, 'pits'), 'pits'),
    unloadBushelsPerHour: positive(input.unloadBushelsPerHour, 'unloadBushelsPerHour'),
    turnaroundMinutes: input.turnaroundMinutes ?? 4,
    dryerBushelsPerHour:
      input.dryerBushelsPerHour === undefined || input.dryerBushelsPerHour === null
        ? null
        : positive(input.dryerBushelsPerHour, 'dryerBushelsPerHour'),
  };
  if (pit.turnaroundMinutes < 0) {
    throw new ConfigError('BAD_TURNAROUND', 'a turnaround cannot be negative', {
      turnaroundMinutes: pit.turnaroundMinutes,
    });
  }
  return Object.freeze(pit);
}

/** Minutes on the pit for one load, weighing and pulling ahead included. */
export function serviceMinutes(pit, bushelHundredths) {
  isInteger(bushelHundredths, 'bushelHundredths');
  const hours = bushelsToDecimal(bushelHundredths) / pit.unloadBushelsPerHour;
  return roundHalfUp(hours * 60 + pit.turnaroundMinutes, 2);
}

export function hourlyCapacity(pit) {
  const perLoad = pit.turnaroundMinutes;
  return {
    unloadBushelsPerHour: pit.unloadBushelsPerHour * pit.pits,
    turnaroundMinutes: perLoad,
    dryerBushelsPerHour: pit.dryerBushelsPerHour,
    limitedBy:
      pit.dryerBushelsPerHour !== null &&
      pit.dryerBushelsPerHour < pit.unloadBushelsPerHour * pit.pits
        ? 'the dryer'
        : 'the pit',
  };
}

/**
 * Run a day of arrivals through the pit. Arrival times are minutes from the
 * start of the day, which keeps the arithmetic out of the calendar.
 */
export function simulateDay(pit, arrivals) {
  isArray(arrivals, 'arrivals', { minLength: 1 });
  const queue = [...arrivals].sort((a, b) => a.arrivesAt - b.arrivesAt);
  const free = new Array(pit.pits).fill(0);
  const rows = [];

  for (const truck of queue) {
    const arrivesAt = isInteger(truck.arrivesAt, 'arrivesAt');
    const soonest = Math.min(...free);
    const index = free.indexOf(soonest);
    const startsAt = Math.max(arrivesAt, soonest);
    const minutes = serviceMinutes(pit, truck.bushels);
    const leavesAt = roundHalfUp(startsAt + minutes, 2);
    free[index] = leavesAt;
    rows.push({
      truck: truck.truck ?? `load ${rows.length + 1}`,
      bushels: truck.bushels,
      arrivesAt,
      startsAt: roundHalfUp(startsAt, 2),
      leavesAt,
      waitedMinutes: roundHalfUp(startsAt - arrivesAt, 2),
      pit: index + 1,
    });
  }

  const waits = rows.map((row) => row.waitedMinutes);
  const bushels = rows.reduce((sum, row) => sum + row.bushels, 0);
  const lastOut = Math.max(...rows.map((row) => row.leavesAt));
  return {
    rows,
    loads: rows.length,
    bushels,
    longestWait: Math.max(...waits),
    meanWait: roundHalfUp(waits.reduce((sum, wait) => sum + wait, 0) / waits.length, 2),
    lastOut,
    hoursWorked: roundHalfUp(lastOut / 60, 2),
    bushelsPerHour: roundHalfUp(bushelsToDecimal(bushels) / (lastOut / 60), 0),
  };
}

/** Would another pit help, or is the dryer the thing in the way. */
export function wouldAnotherPitHelp(pit, arrivals) {
  const now = simulateDay(pit, arrivals);
  const wider = simulateDay(createPit({ ...pit, pits: pit.pits + 1 }), arrivals);
  const saved = roundHalfUp(now.longestWait - wider.longestWait, 2);
  const limited = hourlyCapacity(pit).limitedBy;
  return {
    savedMinutes: saved,
    worthIt: saved >= 15 && limited === 'the pit',
    limitedBy: limited,
    longestWaitNow: now.longestWait,
    longestWaitThen: wider.longestWait,
  };
}

export function renderDay(day) {
  return [
    renderTable(
      [
        { header: 'truck', key: 'truck' },
        { header: 'bushels', value: (row) => formatBushels(row.bushels), align: 'right' },
        { header: 'in', key: 'arrivesAt', align: 'right' },
        { header: 'waited', key: 'waitedMinutes', align: 'right' },
        { header: 'out', key: 'leavesAt', align: 'right' },
        { header: 'pit', key: 'pit', align: 'right' },
      ],
      day.rows
    ),
    '',
    `${day.loads} loads, ${formatBushels(day.bushels)} bushels in ${day.hoursWorked} hours, longest wait ${day.longestWait} minutes`,
  ].join('\n');
}
