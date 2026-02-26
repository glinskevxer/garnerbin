import { describe, expect, it } from 'vitest';
import {
  createPit,
  hourlyCapacity,
  renderDay,
  serviceMinutes,
  simulateDay,
  wouldAnotherPitHelp,
} from '../../src/loadout/scheduling.js';

const pit = createPit({ pits: 1, unloadBushelsPerHour: 6000, turnaroundMinutes: 4 });

function arrivals(count, everyMinutes, bushels = 90_000) {
  return Array.from({ length: count }, (_, index) => ({
    truck: `T-${index + 1}`,
    arrivesAt: index * everyMinutes,
    bushels,
  }));
}

describe('the pit', () => {
  it('takes a load in the time the leg needs plus the turnaround', () => {
    expect(serviceMinutes(pit, 90_000)).toBe(13);
    expect(serviceMinutes(pit, 60_000)).toBe(10);
  });

  it('treats a dryer of null the same as one nobody named', () => {
    expect(
      createPit({ unloadBushelsPerHour: 6000, dryerBushelsPerHour: null }).dryerBushelsPerHour
    ).toBeNull();
  });

  it('refuses a rate of nothing and a negative turnaround', () => {
    expect(() => createPit({ unloadBushelsPerHour: 0 })).toThrow(/greater than zero/);
    expect(() => createPit({ unloadBushelsPerHour: 6000, turnaroundMinutes: -1 })).toThrow(
      /cannot be negative/
    );
  });

  it('says what is holding the house up', () => {
    expect(hourlyCapacity(pit).limitedBy).toBe('the pit');
    const dryerBound = createPit({ unloadBushelsPerHour: 6000, dryerBushelsPerHour: 2000 });
    expect(hourlyCapacity(dryerBound).limitedBy).toBe('the dryer');
  });

  it('adds the pits up for the hourly rate', () => {
    expect(
      hourlyCapacity(createPit({ pits: 2, unloadBushelsPerHour: 6000 })).unloadBushelsPerHour
    ).toBe(12_000);
  });
});

describe('a day at the pit', () => {
  it('lets trucks straight in when they come slowly enough', () => {
    const day = simulateDay(pit, arrivals(5, 20));
    expect(day.longestWait).toBe(0);
    expect(day.loads).toBe(5);
  });

  it('backs the line up when they come faster than the leg', () => {
    const day = simulateDay(pit, arrivals(6, 5));
    expect(day.longestWait).toBeGreaterThan(30);
    expect(day.rows[0].waitedMinutes).toBe(0);
    expect(day.rows.at(-1).waitedMinutes).toBe(day.longestWait);
  });

  it('serves them in the order they arrived whatever order they were given in', () => {
    const shuffled = [...arrivals(4, 10)].reverse();
    const day = simulateDay(pit, shuffled);
    expect(day.rows.map((row) => row.truck)).toEqual(['T-1', 'T-2', 'T-3', 'T-4']);
  });

  it('spreads the trucks across two pits', () => {
    const wide = createPit({ pits: 2, unloadBushelsPerHour: 6000 });
    const day = simulateDay(wide, arrivals(6, 5));
    expect(new Set(day.rows.map((row) => row.pit))).toEqual(new Set([1, 2]));
    expect(day.longestWait).toBeLessThan(simulateDay(pit, arrivals(6, 5)).longestWait);
  });

  it('measures what the day actually moved', () => {
    const day = simulateDay(pit, arrivals(6, 5));
    expect(day.bushels).toBe(540_000);
    expect(day.bushelsPerHour).toBeGreaterThan(4000);
    expect(day.hoursWorked).toBeGreaterThan(1);
  });

  it('refuses a day with no trucks', () => {
    expect(() => simulateDay(pit, [])).toThrow(/at least 1/);
  });
});

describe('whether another pit is worth it', () => {
  it('says yes when the line is long and the pit is the problem', () => {
    const answer = wouldAnotherPitHelp(pit, arrivals(10, 5));
    expect(answer.worthIt).toBe(true);
    expect(answer.savedMinutes).toBeGreaterThan(15);
    expect(answer.limitedBy).toBe('the pit');
  });

  it('says no when nobody is waiting', () => {
    const answer = wouldAnotherPitHelp(pit, arrivals(5, 20));
    expect(answer.worthIt).toBe(false);
    expect(answer.savedMinutes).toBe(0);
  });

  it('says no when the dryer is the thing in the way', () => {
    const dryerBound = createPit({ unloadBushelsPerHour: 6000, dryerBushelsPerHour: 2000 });
    const answer = wouldAnotherPitHelp(dryerBound, arrivals(10, 5));
    expect(answer.limitedBy).toBe('the dryer');
    expect(answer.worthIt).toBe(false);
  });
});

describe('printing the day', () => {
  it('lists every truck and sums the day', () => {
    const text = renderDay(simulateDay(pit, arrivals(3, 5)));
    expect(text).toContain('T-1');
    expect(text).toContain('longest wait');
  });
});
