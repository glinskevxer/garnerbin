import { ConfigError } from '../core/errors.js';
import { inRange, isInteger, isPlainObject, nonNegative, positive } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { formatBushels } from '../core/money.js';
import { poundsToBushels } from '../core/units.js';
import { assertCommodityId, legalWeight } from '../commodity/registry.js';

/**
 * Loading a truck legally.
 *
 * Three limits apply at once and the smallest wins. The gross limit is eighty
 * thousand pounds. The axle limits are twenty thousand on a single and thirty
 * four on a tandem. The bridge formula limits any group of axles by how far
 * apart the outer two are, which is the one that catches people: a short
 * wheelbase truck can be under eighty thousand, under every axle limit, and
 * still illegal.
 */

export const GROSS_LIMIT_LB = 80_000;
export const SINGLE_AXLE_LB = 20_000;
export const TANDEM_AXLE_LB = 34_000;
export const TRIDEM_AXLE_LB = 42_000;

/**
 * The federal bridge formula, in pounds, for a group of axles. The published
 * table rounds to the nearest five hundred, so this does too: a five axle rig
 * at fifty one feet works out to 79,875 and the table says eighty thousand.
 */
export function bridgeFormulaWeight(axles, spacingFeet) {
  isInteger(axles, 'axles');
  inRange(axles, 'axles', 2, 9);
  positive(spacingFeet, 'spacingFeet');
  const weight = 500 * ((spacingFeet * axles) / (axles - 1) + 12 * axles + 36);
  return Math.min(GROSS_LIMIT_LB, Math.round(weight / 500) * 500);
}

export function axleGroupLimit(axles) {
  isInteger(axles, 'axles');
  if (axles === 1) return SINGLE_AXLE_LB;
  if (axles === 2) return TANDEM_AXLE_LB;
  if (axles === 3) return TRIDEM_AXLE_LB;
  throw new ConfigError('NO_AXLE_LIMIT', `there is no posted limit for a group of ${axles}`, {
    axles,
  });
}

/**
 * The lowest of the three limits, and which one it was. The reason matters
 * because a driver who is bridge limited can fix it by sliding the tandems and
 * one who is gross limited cannot.
 */
export function legalGross(rig) {
  isPlainObject(rig, 'rig');
  const axles = isInteger(rig.axles, 'axles');
  const spacing = positive(rig.outerSpacingFeet, 'outerSpacingFeet');
  const bridge = bridgeFormulaWeight(axles, spacing);
  const groups = (rig.groups ?? []).map((group) => axleGroupLimit(group));
  const axleTotal =
    groups.length === 0 ? GROSS_LIMIT_LB : groups.reduce((sum, limit) => sum + limit, 0);
  const limits = [
    { limit: GROSS_LIMIT_LB, because: 'the gross limit' },
    { limit: bridge, because: 'the bridge formula' },
    { limit: axleTotal, because: 'the axle limits' },
  ];
  const binding = limits.reduce((lowest, entry) => (entry.limit < lowest.limit ? entry : lowest));
  return { pounds: binding.limit, because: binding.because, bridge, axleTotal };
}

export function legalPayload(rig) {
  const tare = nonNegative(rig.tarePounds, 'tarePounds');
  const gross = legalGross(rig);
  if (tare >= gross.pounds) {
    throw new ConfigError(
      'RIG_TOO_HEAVY',
      `a tare of ${tare} leaves nothing under ${gross.pounds}`,
      {
        tarePounds: tare,
        grossLimit: gross.pounds,
      }
    );
  }
  return { ...gross, payloadPounds: gross.pounds - tare };
}

export function bushelsForTruck(rig, commodityId) {
  assertCommodityId(commodityId);
  const payload = legalPayload(rig);
  return {
    ...payload,
    bushels: poundsToBushels(payload.payloadPounds, legalWeight(commodityId)),
  };
}

/** How far over a loaded truck is, and what it has to drop to be legal. */
export function overweightBy(rig, grossPounds) {
  nonNegative(grossPounds, 'grossPounds');
  const gross = legalGross(rig);
  const over = grossPounds - gross.pounds;
  if (over <= 0) return { over: 0, legal: true, because: gross.because, dropBushels: 0 };
  return {
    over,
    legal: false,
    because: gross.because,
    dropPounds: over,
  };
}

export function dropBushels(rig, grossPounds, commodityId) {
  const state = overweightBy(rig, grossPounds);
  if (state.legal) return 0;
  return poundsToBushels(state.dropPounds, legalWeight(assertCommodityId(commodityId)));
}

export function describeRig(rig, commodityId) {
  const loaded = bushelsForTruck(rig, commodityId);
  return `${roundHalfUp(loaded.payloadPounds, 0)} lb of payload, ${formatBushels(loaded.bushels)} bushels, held by ${loaded.because}`;
}
