import { isInteger, isPlainObject } from '../core/assert.js';
import { percentOf } from '../core/numbers.js';
import { bushelsToDecimal, formatBushels } from '../core/money.js';
import { assertCommodityId, getCommodity } from '../commodity/registry.js';

/**
 * The company position.
 *
 * Grain in the house is not the same as grain the house owns. Open storage and
 * warehouse receipts belong to the grower and have to come out before anything
 * is hedged. Delayed price grain does not: title passed at the pit, so the
 * house owns it and carries the market risk on it, which is exactly what the
 * service charge is for.
 *
 * Long is what the house owns plus what it has bought and not yet received.
 * Short is what it has sold and not yet shipped. The difference is the exposure
 * and the futures are supposed to cancel it.
 */

export function buildPosition(input) {
  isPlainObject(input, 'position');
  const commodity = assertCommodityId(input.commodity);
  const field = (name) => isInteger(input[name] ?? 0, name);

  const inventory = field('inventory');
  const openStorage = field('openStorage');
  const receipts = field('receipts');
  const houseOwned = inventory - openStorage - receipts;
  const purchasesOpen = field('purchasesOpen');
  const salesOpen = field('salesOpen');
  const longBushels = houseOwned + purchasesOpen;
  const shortBushels = salesOpen;
  const netBushels = longBushels - shortBushels;
  const futuresShort = field('futuresShort');
  const futuresLong = field('futuresLong');
  const hedgedBushels = futuresShort - futuresLong;
  const unhedgedBushels = netBushels - hedgedBushels;

  return {
    commodity,
    inventory,
    openStorage,
    receipts,
    houseOwned,
    purchasesOpen,
    salesOpen,
    longBushels,
    shortBushels,
    netBushels,
    direction: netBushels === 0 ? 'flat' : netBushels > 0 ? 'long' : 'short',
    futuresShort,
    futuresLong,
    hedgedBushels,
    unhedgedBushels,
    hedgeRatio: percentOf(bushelsToDecimal(hedgedBushels), bushelsToDecimal(netBushels), 1),
  };
}

/** How many board contracts a bushel figure works out to, and what is left over. */
export function contractsFor(bushelHundredths, commodityId) {
  const size = getCommodity(commodityId).contractBushels * 100;
  const whole = Math.trunc(bushelHundredths / size);
  return { contracts: whole, remainder: bushelHundredths - whole * size, contractBushels: size };
}

/**
 * What the desk has to do to be square. A long position sells futures, a short
 * one buys them back, and the odd lot under a contract stays uncovered because
 * there is nothing smaller to cover it with.
 */
export function hedgeGap(position) {
  const { contracts, remainder } = contractsFor(
    Math.abs(position.unhedgedBushels),
    position.commodity
  );
  if (position.unhedgedBushels === 0) {
    return { action: 'none', contracts: 0, uncoveredBushels: 0 };
  }
  return {
    action: position.unhedgedBushels > 0 ? 'sell' : 'buy',
    contracts,
    uncoveredBushels: remainder,
  };
}

export function isSquare(position, toleranceBushels = 0) {
  return Math.abs(position.unhedgedBushels) <= toleranceBushels;
}

export function positionLine(position) {
  return [
    position.commodity.padEnd(9),
    formatBushels(position.netBushels).padStart(14),
    position.direction.padEnd(6),
    formatBushels(position.unhedgedBushels).padStart(14),
  ].join('  ');
}

export function totalNet(positions) {
  return positions.reduce((sum, position) => sum + position.netBushels, 0);
}
