import { ConfigError } from '../core/errors.js';
import { isArray, isInteger, nonNegative, oneOf, positive } from '../core/assert.js';
import { formatBushels } from '../core/money.js';
import { cubicFeetToBushels, poundsToBushels } from '../core/units.js';
import { assertCommodityId, legalWeight } from '../commodity/registry.js';

/**
 * Loading rail.
 *
 * A covered hopper is limited two ways and only one of them binds at a time.
 * The gross rail load is what the track will take, and the cube is what the car
 * will hold. Corn in a 4750 runs out of room before it runs out of weight;
 * soybeans in the same car run out of weight first. Loading to the wrong one is
 * either a light car the buyer pays freight on or an overloaded car the
 * railroad sets out.
 */

export const CAR_TYPES = Object.freeze({
  hopper4650: { id: 'hopper4650', label: '4650 covered hopper', cubicFeet: 4650, tareLb: 62_000 },
  hopper4750: { id: 'hopper4750', label: '4750 covered hopper', cubicFeet: 4750, tareLb: 65_000 },
  hopper5200: { id: 'hopper5200', label: '5200 covered hopper', cubicFeet: 5200, tareLb: 68_000 },
});

export const CAR_IDS = Object.freeze(Object.keys(CAR_TYPES));
export const GROSS_RAIL_LOAD_LB = 286_000;
export const SHUTTLE_CARS = 110;
export const UNIT_TRAIN_CARS = 75;

export function getCar(id) {
  oneOf(id, 'car', CAR_IDS);
  return CAR_TYPES[id];
}

export function ladingPounds(carId, { tareLb, grossLb = GROSS_RAIL_LOAD_LB } = {}) {
  const car = getCar(carId);
  const tare = tareLb ?? car.tareLb;
  nonNegative(tare, 'tareLb');
  positive(grossLb, 'grossLb');
  if (tare >= grossLb) {
    throw new ConfigError('CAR_OVER_TARE', `a ${car.label} tares at ${tare} against ${grossLb}`, {
      car: carId,
      tareLb: tare,
      grossLb,
    });
  }
  return grossLb - tare;
}

export function weightLimitBushels(carId, commodityId, options = {}) {
  assertCommodityId(commodityId);
  return poundsToBushels(ladingPounds(carId, options), legalWeight(commodityId));
}

export function volumeLimitBushels(carId) {
  return cubicFeetToBushels(getCar(carId).cubicFeet);
}

/** Which limit bites first, and how much the car will actually take. */
export function carCapacity(carId, commodityId, options = {}) {
  const byWeight = weightLimitBushels(carId, commodityId, options);
  const byVolume = volumeLimitBushels(carId);
  const binding = byVolume <= byWeight ? 'volume' : 'weight';
  return {
    car: carId,
    commodity: commodityId,
    byWeight,
    byVolume,
    bushels: Math.min(byWeight, byVolume),
    binding,
  };
}

/** How many cars a shipment needs, and what is left in the last one. */
export function planCars(bushels, carId, commodityId, options = {}) {
  positive(isInteger(bushels, 'bushels'), 'bushels');
  const capacity = carCapacity(carId, commodityId, options);
  const full = Math.floor(bushels / capacity.bushels);
  const remainder = bushels - full * capacity.bushels;
  return {
    ...capacity,
    fullCars: full,
    partialCarBushels: remainder,
    cars: remainder > 0 ? full + 1 : full,
  };
}

/** Whether a string of cars makes a rate the railroad will actually quote. */
export function trainCheck(carCount, { size = SHUTTLE_CARS } = {}) {
  isInteger(carCount, 'carCount');
  const short = size - carCount;
  return {
    cars: carCount,
    size,
    qualifies: carCount >= size,
    carsShort: short > 0 ? short : 0,
  };
}

export function describePlan(plan) {
  const partial =
    plan.partialCarBushels > 0 ? ` and ${formatBushels(plan.partialCarBushels)} in a partial` : '';
  return `${plan.fullCars} full cars${partial}, limited by ${plan.binding}`;
}

export function totalBushels(cars) {
  isArray(cars, 'cars');
  return cars.reduce((sum, car) => sum + car.bushels, 0);
}
