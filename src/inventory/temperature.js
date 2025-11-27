import { InventoryError } from '../core/errors.js';
import { isArray, isPlainObject, isString } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { assertDay, daysBetween } from '../core/dates.js';
import { renderTable } from '../core/text.js';

/**
 * Temperature cables.
 *
 * A bin has cables hung down through it with sensors every few feet. What the
 * manager watches is not the absolute reading, it is the shape: one sensor
 * eight or ten degrees over its neighbours at the same depth is a spot going
 * off, and it will keep climbing whatever the weather does outside.
 *
 * A rise between two readings matters even more than a single high one, because
 * grain that is heating heats faster the hotter it gets.
 */

export const HOT_SPOT_MARGIN_F = 8;
export const RISE_PER_WEEK_F = 5;

export function createReading(input) {
  isPlainObject(input, 'reading');
  return Object.freeze({
    bin: isString(input.bin, 'bin'),
    day: assertDay(input.day, 'day'),
    cable: isString(input.cable, 'cable'),
    sensor: isString(input.sensor, 'sensor'),
    depthFeet: input.depthFeet ?? null,
    tempF: input.tempF,
  });
}

export function createReadingSet(readings) {
  isArray(readings, 'readings', { minLength: 1 });
  const built = readings.map((reading) => createReading(reading));
  const days = new Set(built.map((reading) => reading.day));
  if (days.size > 1) {
    throw new InventoryError('MIXED_DAYS', 'a reading set covers one day', {
      days: [...days].sort(),
    });
  }
  const seen = new Set();
  for (const reading of built) {
    const key = `${reading.cable}/${reading.sensor}`;
    if (seen.has(key)) {
      throw new InventoryError('SENSOR_READ_TWICE', `${key} appears twice in the set`, { key });
    }
    seen.add(key);
  }
  return Object.freeze(built);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return roundHalfUp((sorted[middle - 1] + sorted[middle]) / 2, 1);
}

export function profile(readings) {
  const temps = readings.map((reading) => reading.tempF);
  return {
    bin: readings[0].bin,
    day: readings[0].day,
    sensors: readings.length,
    min: Math.min(...temps),
    max: Math.max(...temps),
    median: median(temps),
    spread: roundHalfUp(Math.max(...temps) - Math.min(...temps), 1),
  };
}

/** Sensors sitting well over the middle of the bin. */
export function findHotSpots(readings, { margin = HOT_SPOT_MARGIN_F } = {}) {
  const middle = median(readings.map((reading) => reading.tempF));
  return readings
    .filter((reading) => reading.tempF - middle >= margin)
    .map((reading) => ({
      cable: reading.cable,
      sensor: reading.sensor,
      depthFeet: reading.depthFeet,
      tempF: reading.tempF,
      overMedian: roundHalfUp(reading.tempF - middle, 1),
    }))
    .sort((a, b) => b.overMedian - a.overMedian);
}

/**
 * The change between two sets, per sensor, scaled to a week so two readings
 * eight days apart and two readings four days apart can be compared.
 */
export function trend(previous, current) {
  const days = daysBetween(previous[0].day, current[0].day);
  if (days <= 0) {
    throw new InventoryError('READINGS_OUT_OF_ORDER', 'the later set is not later', {
      previous: previous[0].day,
      current: current[0].day,
    });
  }
  const before = new Map(
    previous.map((reading) => [`${reading.cable}/${reading.sensor}`, reading])
  );
  return current
    .filter((reading) => before.has(`${reading.cable}/${reading.sensor}`))
    .map((reading) => {
      const older = before.get(`${reading.cable}/${reading.sensor}`);
      const change = roundHalfUp(reading.tempF - older.tempF, 1);
      return {
        cable: reading.cable,
        sensor: reading.sensor,
        from: older.tempF,
        to: reading.tempF,
        days,
        change,
        perWeek: roundHalfUp((change * 7) / days, 1),
      };
    });
}

export function risingSensors(previous, current, { perWeek = RISE_PER_WEEK_F } = {}) {
  return trend(previous, current)
    .filter((entry) => entry.perWeek >= perWeek)
    .sort((a, b) => b.perWeek - a.perWeek);
}

/** One word for the bin, which is what goes on the walk around sheet. */
export function binCondition(readings, previous) {
  const hot = findHotSpots(readings);
  const rising = previous ? risingSensors(previous, readings) : [];
  if (hot.length > 0 && rising.length > 0) return 'going off';
  if (hot.length > 0) return 'watch';
  if (rising.length > 0) return 'warming';
  return 'settled';
}

export function renderProfile(readings) {
  const summary = profile(readings);
  const hot = findHotSpots(readings);
  const lines = [
    `${summary.bin} on ${summary.day}: ${summary.sensors} sensors, ${summary.min} to ${summary.max}, middle ${summary.median}`,
  ];
  if (hot.length === 0) {
    lines.push('Nothing over the margin.');
  } else {
    lines.push(
      renderTable(
        [
          { header: 'cable', key: 'cable' },
          { header: 'sensor', key: 'sensor' },
          { header: 'depth', value: (row) => String(row.depthFeet ?? ''), align: 'right' },
          { header: 'degrees', key: 'tempF', align: 'right' },
          { header: 'over middle', key: 'overMedian', align: 'right' },
        ],
        hot
      )
    );
  }
  return lines.join('\n');
}
