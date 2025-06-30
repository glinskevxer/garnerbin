import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  CAR_IDS,
  carCapacity,
  describePlan,
  getCar,
  GROSS_RAIL_LOAD_LB,
  ladingPounds,
  planCars,
  SHUTTLE_CARS,
  totalBushels,
  trainCheck,
  UNIT_TRAIN_CARS,
  volumeLimitBushels,
  weightLimitBushels,
} from '../../src/loadout/rail.js';

describe('cars', () => {
  it('knows the three hoppers on this line', () => {
    expect(CAR_IDS).toEqual(['hopper4650', 'hopper4750', 'hopper5200']);
    expect(getCar('hopper4750').cubicFeet).toBe(4750);
    expect(GROSS_RAIL_LOAD_LB).toBe(286_000);
  });

  it('refuses a car it does not know', () => {
    expect(() => getCar('boxcar')).toThrow(/must be one of/);
  });

  it('works the lading out of gross less tare', () => {
    expect(ladingPounds('hopper4750')).toBe(221_000);
    expect(ladingPounds('hopper4750', { tareLb: 63_500 })).toBe(222_500);
    expect(ladingPounds('hopper4750', { grossLb: 263_000 })).toBe(198_000);
  });

  it('refuses a car that tares out over the limit', () => {
    expect(() => ladingPounds('hopper4750', { grossLb: 60_000 })).toThrow(/tares at 65000/);
  });
});

describe('the two limits', () => {
  it('works the weight limit off the legal weight', () => {
    expect(formatBushels(weightLimitBushels('hopper4750', 'corn'))).toBe('3,946.42');
    expect(formatBushels(weightLimitBushels('hopper4750', 'soybeans'))).toBe('3,683.33');
  });

  it('works the volume limit off the cube', () => {
    expect(formatBushels(volumeLimitBushels('hopper4750'))).toBe('3,816.93');
  });

  it('lets the cube bind on corn and the weight bind on beans', () => {
    expect(carCapacity('hopper4750', 'corn').binding).toBe('volume');
    expect(carCapacity('hopper4750', 'soybeans').binding).toBe('weight');
  });

  it('takes the smaller of the two', () => {
    const corn = carCapacity('hopper4750', 'corn');
    expect(corn.bushels).toBe(Math.min(corn.byWeight, corn.byVolume));
  });

  it('lets a bigger car take more of both', () => {
    expect(carCapacity('hopper5200', 'corn').bushels).toBeGreaterThan(
      carCapacity('hopper4650', 'corn').bushels
    );
  });
});

describe('planning cars', () => {
  it('splits a shipment into full cars and a partial', () => {
    const plan = planCars(40_000_000, 'hopper4750', 'corn');
    expect(plan.fullCars).toBe(104);
    expect(plan.cars).toBe(105);
    expect(plan.partialCarBushels).toBeGreaterThan(0);
  });

  it('leaves no partial when it comes out even', () => {
    const capacity = carCapacity('hopper4750', 'corn').bushels;
    const plan = planCars(capacity * 10, 'hopper4750', 'corn');
    expect(plan.cars).toBe(10);
    expect(plan.partialCarBushels).toBe(0);
  });

  it('says which limit it planned against', () => {
    expect(describePlan(planCars(40_000_000, 'hopper4750', 'corn'))).toContain('limited by volume');
  });

  it('refuses a shipment of nothing', () => {
    expect(() => planCars(0, 'hopper4750', 'corn')).toThrow(/greater than zero/);
  });
});

describe('the train', () => {
  it('knows what a shuttle takes', () => {
    expect(SHUTTLE_CARS).toBe(110);
    expect(UNIT_TRAIN_CARS).toBe(75);
    expect(trainCheck(110).qualifies).toBe(true);
    expect(trainCheck(109).qualifies).toBe(false);
    expect(trainCheck(109).carsShort).toBe(1);
  });

  it('takes a smaller string when the rate is a unit train', () => {
    expect(trainCheck(80, { size: UNIT_TRAIN_CARS }).qualifies).toBe(true);
  });

  it('never reports a negative shortfall', () => {
    expect(trainCheck(120).carsShort).toBe(0);
  });

  it('adds a string of cars up', () => {
    expect(totalBushels([{ bushels: 100 }, { bushels: 200 }])).toBe(300);
  });
});
