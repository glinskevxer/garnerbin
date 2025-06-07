import { InventoryError } from '../core/errors.js';
import { isPlainObject, isString, nonNegative, oneOf, positive } from '../core/assert.js';
import { percentOf, roundHalfUp } from '../core/numbers.js';
import { bushelsToDecimal, formatBushels } from '../core/money.js';
import { cubicFeetToBushels } from '../core/units.js';
import { assertCommodityId } from '../commodity/registry.js';

/**
 * Bins.
 *
 * Capacity comes off the geometry rather than off a number somebody typed,
 * because the number somebody typed is always the manufacturer's rating and the
 * manufacturer's rating assumes a level fill with no peak and no hopper. The
 * ring, the peak and the hopper are three separate volumes and this adds them
 * up separately so a half filled hopper bin reads honestly.
 */

export const BIN_KINDS = Object.freeze(['upright', 'hopper', 'flat']);

export function createBin(input) {
  isPlainObject(input, 'bin');
  const kind = oneOf(input.kind ?? 'upright', 'kind', BIN_KINDS);
  const bin = {
    id: isString(input.id, 'id'),
    kind,
    diameterFeet: kind === 'flat' ? null : positive(input.diameterFeet, 'diameterFeet'),
    lengthFeet: kind === 'flat' ? positive(input.lengthFeet, 'lengthFeet') : null,
    widthFeet: kind === 'flat' ? positive(input.widthFeet, 'widthFeet') : null,
    eaveHeightFeet: positive(input.eaveHeightFeet, 'eaveHeightFeet'),
    peakHeightFeet: nonNegative(input.peakHeightFeet ?? 0, 'peakHeightFeet'),
    hopperHeightFeet: nonNegative(input.hopperHeightFeet ?? 0, 'hopperHeightFeet'),
    aerationCfm: nonNegative(input.aerationCfm ?? 0, 'aerationCfm'),
    commodity: input.commodity === undefined ? null : assertCommodityId(input.commodity),
  };
  if (kind !== 'hopper' && bin.hopperHeightFeet > 0) {
    throw new InventoryError(
      'HOPPER_ON_A_FLAT_BOTTOM',
      `${bin.id} is a ${kind} bin with a hopper`,
      {
        id: bin.id,
        kind,
      }
    );
  }
  return Object.freeze(bin);
}

function footprintSquareFeet(bin) {
  if (bin.kind === 'flat') return bin.lengthFeet * bin.widthFeet;
  const radius = bin.diameterFeet / 2;
  return Math.PI * radius * radius;
}

/** The three volumes, kept apart so a partly filled bin can be read off the ring alone. */
export function volumes(bin) {
  const footprint = footprintSquareFeet(bin);
  return {
    ring: roundHalfUp(footprint * bin.eaveHeightFeet, 2),
    peak: roundHalfUp((footprint * bin.peakHeightFeet) / 3, 2),
    hopper: roundHalfUp((footprint * bin.hopperHeightFeet) / 3, 2),
  };
}

export function cubicFeet(bin) {
  const parts = volumes(bin);
  return roundHalfUp(parts.ring + parts.peak + parts.hopper, 2);
}

export function capacityOf(bin) {
  return cubicFeetToBushels(cubicFeet(bin));
}

/** Capacity with nothing above the eave, which is what a bin holds when it is not peaked. */
export function levelCapacityOf(bin) {
  const parts = volumes(bin);
  return cubicFeetToBushels(parts.ring + parts.hopper);
}

export function headroom(bin, bushels) {
  nonNegative(bushels, 'bushels');
  return Math.max(0, capacityOf(bin) - bushels);
}

export function fillPercent(bin, bushels) {
  return percentOf(bushelsToDecimal(bushels), bushelsToDecimal(capacityOf(bin)), 1);
}

export function isOverfull(bin, bushels) {
  return bushels > capacityOf(bin);
}

/**
 * Whether a load can go in. Commodity first: putting beans on top of corn is a
 * cleanout and a downgrade, not an inventory adjustment.
 */
export function canAccept(bin, { commodity, bushels, holding = 0 }) {
  assertCommodityId(commodity);
  nonNegative(bushels, 'bushels');
  const problems = [];
  if (bin.commodity !== null && bin.commodity !== commodity) {
    problems.push(`${bin.id} is holding ${bin.commodity}`);
  }
  const room = headroom(bin, holding);
  if (bushels > room) {
    problems.push(
      `${bin.id} has room for ${formatBushels(room)} and the load is ${formatBushels(bushels)}`
    );
  }
  return { ok: problems.length === 0, problems, room };
}

/** Cubic feet a minute for each bushel in the bin, which is what sets the cooling time. */
export function aerationRate(bin, bushels) {
  if (bushels === 0) return 0;
  return roundHalfUp(bin.aerationCfm / bushelsToDecimal(bushels), 4);
}

/** A cooling front moves through in roughly fifteen hours for each tenth of a cfm. */
export function coolingHours(bin, bushels) {
  const rate = aerationRate(bin, bushels);
  if (rate === 0) {
    throw new InventoryError('NO_AERATION', `${bin.id} has no fan`, { id: bin.id });
  }
  return roundHalfUp(1.5 / rate, 1);
}
