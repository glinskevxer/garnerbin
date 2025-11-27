import { describe, expect, it } from 'vitest';
import {
  binCondition,
  createReadingSet,
  findHotSpots,
  HOT_SPOT_MARGIN_F,
  profile,
  renderProfile,
  risingSensors,
  RISE_PER_WEEK_F,
  trend,
} from '../../src/inventory/temperature.js';

function set(day, temps, bin = 'B-1') {
  return createReadingSet(
    temps.map((tempF, index) => ({
      bin,
      day,
      cable: `C-${Math.floor(index / 3) + 1}`,
      sensor: `S-${(index % 3) + 1}`,
      depthFeet: 10 * ((index % 3) + 1),
      tempF,
    }))
  );
}

const settled = set('2025-11-14', [42, 41, 43, 42, 40, 41, 43, 42, 41]);
const hotSpot = set('2025-11-14', [42, 41, 43, 42, 55, 41, 43, 42, 41]);

describe('building a reading set', () => {
  it('keeps every sensor', () => {
    expect(settled).toHaveLength(9);
    expect(Object.isFrozen(settled)).toBe(true);
  });

  it('refuses a set that spans two days', () => {
    expect(() =>
      createReadingSet([
        { bin: 'B-1', day: '2025-11-14', cable: 'C-1', sensor: 'S-1', tempF: 40 },
        { bin: 'B-1', day: '2025-11-15', cable: 'C-1', sensor: 'S-2', tempF: 41 },
      ])
    ).toThrow(/covers one day/);
  });

  it('refuses the same sensor twice', () => {
    expect(() =>
      createReadingSet([
        { bin: 'B-1', day: '2025-11-14', cable: 'C-1', sensor: 'S-1', tempF: 40 },
        { bin: 'B-1', day: '2025-11-14', cable: 'C-1', sensor: 'S-1', tempF: 41 },
      ])
    ).toThrow(/appears twice/);
  });

  it('refuses an empty set', () => {
    expect(() => createReadingSet([])).toThrow(/at least 1/);
  });
});

describe('the profile', () => {
  it('gives the shape of the bin', () => {
    const summary = profile(settled);
    expect(summary.bin).toBe('B-1');
    expect(summary.min).toBe(40);
    expect(summary.max).toBe(43);
    expect(summary.median).toBe(42);
    expect(summary.spread).toBe(3);
  });

  it('takes the middle of an even count', () => {
    expect(profile(set('2025-11-14', [40, 42])).median).toBe(41);
  });
});

describe('hot spots', () => {
  it('finds a sensor well over the middle', () => {
    expect(HOT_SPOT_MARGIN_F).toBe(8);
    const found = findHotSpots(hotSpot);
    expect(found).toHaveLength(1);
    expect(found[0].tempF).toBe(55);
    expect(found[0].overMedian).toBe(13);
  });

  it('finds nothing in an even bin', () => {
    expect(findHotSpots(settled)).toEqual([]);
  });

  it('takes a tighter margin', () => {
    expect(findHotSpots(settled, { margin: 1 }).length).toBeGreaterThan(0);
  });

  it('sorts the worst first', () => {
    const two = set('2025-11-14', [42, 41, 43, 42, 55, 51, 43, 42, 41]);
    expect(findHotSpots(two).map((entry) => entry.tempF)).toEqual([55, 51]);
  });
});

describe('the trend between two sets', () => {
  const later = set('2025-11-21', [43, 42, 44, 43, 52, 42, 44, 43, 42]);

  it('scales the change to a week', () => {
    const rows = trend(settled, later);
    expect(rows).toHaveLength(9);
    const spot = rows.find((row) => row.to === 52);
    expect(spot.change).toBe(12);
    expect(spot.perWeek).toBe(12);
  });

  it('scales a shorter gap up', () => {
    const soon = set('2025-11-17', [43, 42, 44, 43, 44, 42, 44, 43, 42]);
    const rows = trend(settled, soon);
    expect(rows[0].days).toBe(3);
    expect(rows[0].perWeek).toBe(2.3);
  });

  it('refuses two sets in the wrong order', () => {
    expect(() => trend(later, settled)).toThrow(/is not later/);
  });

  it('ignores a sensor that was not read both times', () => {
    const partial = createReadingSet([
      { bin: 'B-1', day: '2025-11-21', cable: 'C-9', sensor: 'S-1', tempF: 50 },
    ]);
    expect(trend(settled, partial)).toEqual([]);
  });

  it('lists the sensors climbing faster than the limit', () => {
    expect(RISE_PER_WEEK_F).toBe(5);
    const rising = risingSensors(settled, later);
    expect(rising).toHaveLength(1);
    expect(rising[0].perWeek).toBe(12);
  });
});

describe('one word for the bin', () => {
  const later = set('2025-11-21', [43, 42, 44, 43, 52, 42, 44, 43, 42]);

  it('calls an even cold bin settled', () => {
    expect(binCondition(settled)).toBe('settled');
  });

  it('calls a bin with a spot but no history a watch', () => {
    expect(binCondition(hotSpot)).toBe('watch');
  });

  it('calls a climbing bin with a spot going off', () => {
    expect(binCondition(later, settled)).toBe('going off');
  });

  it('calls an even bin that is climbing warming', () => {
    const warmer = set('2025-11-21', [50, 49, 51, 50, 48, 49, 51, 50, 49]);
    expect(binCondition(warmer, settled)).toBe('warming');
  });
});

describe('printing', () => {
  it('says the shape and lists the spots', () => {
    const text = renderProfile(hotSpot);
    expect(text).toContain('B-1 on 2025-11-14: 9 sensors, 41 to 55, middle 42');
    expect(text).toContain('over middle');
  });

  it('says so when there is nothing over the margin', () => {
    expect(renderProfile(settled)).toContain('Nothing over the margin.');
  });
});
