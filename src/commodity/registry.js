import { ConfigError } from '../core/errors.js';
import { isString, oneOf } from '../core/assert.js';

/**
 * The five things this house takes in.
 *
 * legalWeight is the statutory pounds per bushel used for settlement.
 * marketMoisture is where the discount schedule and the shrink table start.
 * safeMoisture is where the grain will hold through a summer in a steel bin.
 *
 * Milo has no futures contract of its own. The desk hedges it on corn and the
 * basis carries the difference, so hedgeSymbol is not always futuresSymbol.
 */

const REGISTRY = {
  corn: {
    id: 'corn',
    name: 'Yellow corn',
    legalWeight: 56,
    standardTestWeight: 54,
    marketMoisture: 15.0,
    safeMoisture: 14.0,
    cropYearStartMonth: 9,
    futuresSymbol: 'ZC',
    hedgeSymbol: 'ZC',
    contractBushels: 5000,
    deliveryMonths: ['F', 'H', 'K', 'N', 'U', 'Z'],
    checkoff: { kind: 'perBushel', points: 100 },
  },
  soybeans: {
    id: 'soybeans',
    name: 'Yellow soybeans',
    legalWeight: 60,
    standardTestWeight: 54,
    marketMoisture: 13.0,
    safeMoisture: 12.0,
    cropYearStartMonth: 9,
    futuresSymbol: 'ZS',
    hedgeSymbol: 'ZS',
    contractBushels: 5000,
    deliveryMonths: ['F', 'H', 'K', 'N', 'Q', 'U', 'X'],
    checkoff: { kind: 'percentOfValue', rate: 0.005 },
  },
  hrw: {
    id: 'hrw',
    name: 'Hard red winter wheat',
    legalWeight: 60,
    standardTestWeight: 58,
    marketMoisture: 13.5,
    safeMoisture: 12.5,
    cropYearStartMonth: 6,
    futuresSymbol: 'KE',
    hedgeSymbol: 'KE',
    contractBushels: 5000,
    deliveryMonths: ['H', 'K', 'N', 'U', 'Z'],
    checkoff: { kind: 'perBushel', points: 100 },
  },
  srw: {
    id: 'srw',
    name: 'Soft red winter wheat',
    legalWeight: 60,
    standardTestWeight: 58,
    marketMoisture: 13.5,
    safeMoisture: 12.5,
    cropYearStartMonth: 6,
    futuresSymbol: 'ZW',
    hedgeSymbol: 'ZW',
    contractBushels: 5000,
    deliveryMonths: ['H', 'K', 'N', 'U', 'Z'],
    checkoff: { kind: 'perBushel', points: 100 },
  },
  sorghum: {
    id: 'sorghum',
    name: 'Grain sorghum',
    legalWeight: 56,
    standardTestWeight: 54,
    marketMoisture: 14.0,
    safeMoisture: 13.0,
    cropYearStartMonth: 9,
    futuresSymbol: null,
    hedgeSymbol: 'ZC',
    contractBushels: 5000,
    deliveryMonths: ['F', 'H', 'K', 'N', 'U', 'Z'],
    checkoff: { kind: 'perBushel', points: 60 },
  },
};

for (const entry of Object.values(REGISTRY)) Object.freeze(entry);
Object.freeze(REGISTRY);

export const COMMODITY_IDS = Object.freeze(Object.keys(REGISTRY));

export function getCommodity(id) {
  isString(id, 'commodity');
  const found = REGISTRY[id.toLowerCase()];
  if (!found) {
    throw new ConfigError('NO_SUCH_COMMODITY', `this house does not take ${id}`, {
      commodity: id,
      known: COMMODITY_IDS,
    });
  }
  return found;
}

export function listCommodities() {
  return COMMODITY_IDS.map((id) => REGISTRY[id]);
}

export function assertCommodityId(id) {
  return oneOf(String(id).toLowerCase(), 'commodity', COMMODITY_IDS);
}

export function legalWeight(id) {
  return getCommodity(id).legalWeight;
}

export function marketMoisture(id) {
  return getCommodity(id).marketMoisture;
}

/** Wheat is the only thing here that rolls its crop year in June. */
export function cropYearStartMonth(id) {
  return getCommodity(id).cropYearStartMonth;
}

export function isWheat(id) {
  return getCommodity(id).cropYearStartMonth === 6;
}

/** Milo answers false. It gets hedged on the corn board instead. */
export function hasOwnFutures(id) {
  return getCommodity(id).futuresSymbol !== null;
}

export function hedgeSymbol(id) {
  return getCommodity(id).hedgeSymbol;
}

/** Will it keep in an unaerated bin through August at this moisture. */
export function willStore(id, moisture) {
  return moisture <= getCommodity(id).safeMoisture;
}

/** How far the load sits above or below the moisture the schedule starts at. */
export function moisturePointsOver(id, moisture) {
  return Number((moisture - getCommodity(id).marketMoisture).toFixed(2));
}
