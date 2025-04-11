import { InventoryError } from '../core/errors.js';
import { isArray, isInteger, isPlainObject, nonNegative } from '../core/assert.js';
import { percentOf, roundHalfUp } from '../core/numbers.js';
import { bushelsToDecimal, formatBushels } from '../core/money.js';

/**
 * Over and short.
 *
 * Book inventory is what the tickets say should be in the house. Measured
 * inventory is what the tape and the bin charts say is actually in it. They
 * never agree exactly, and the gap has a name depending on which way it runs.
 *
 * A house that runs consistently over is taking too much shrink from its
 * growers. A house that runs short is either giving grain away at the loadout
 * scale or has a hole somewhere. Both readings are worth having.
 */

export const DEFAULT_TOLERANCE_PERCENT = 0.5;

export function reconcile(input) {
  isPlainObject(input, 'input');
  const opening = isInteger(input.opening ?? 0, 'opening');
  const receipts = nonNegative(isInteger(input.receipts ?? 0, 'receipts'), 'receipts');
  const shipments = nonNegative(isInteger(input.shipments ?? 0, 'shipments'), 'shipments');
  const adjustments = isInteger(input.adjustments ?? 0, 'adjustments');
  const measured = isInteger(input.measured, 'measured');
  const book = opening + receipts - shipments + adjustments;
  const variance = measured - book;
  const basis = input.varianceBasis === 'handled' ? receipts + shipments : receipts;
  return {
    opening,
    receipts,
    shipments,
    adjustments,
    book,
    measured,
    variance,
    variancePercent: percentOf(bushelsToDecimal(variance), bushelsToDecimal(basis), 3),
    direction: variance === 0 ? 'flat' : variance > 0 ? 'over' : 'short',
  };
}

export function withinTolerance(result, tolerancePercent = DEFAULT_TOLERANCE_PERCENT) {
  nonNegative(tolerancePercent, 'tolerancePercent');
  return Math.abs(result.variancePercent) <= tolerancePercent;
}

export function describeVariance(result) {
  if (result.direction === 'flat') return 'book and measured agree';
  const size = formatBushels(Math.abs(result.variance));
  return `${size} bushels ${result.direction} at ${Math.abs(result.variancePercent).toFixed(3)} percent`;
}

/**
 * How much shrink the house actually captured on receipts, against how much it
 * charged. The difference is the number the manager wants at the end of the
 * season, because that is the margin the shrink factor was supposed to earn.
 */
export function shrinkCaptured({ grossReceipts, settledReceipts, measuredReceipts }) {
  isInteger(grossReceipts, 'grossReceipts');
  isInteger(settledReceipts, 'settledReceipts');
  const charged = grossReceipts - settledReceipts;
  if (measuredReceipts === undefined) {
    return { charged, actual: null, margin: null };
  }
  isInteger(measuredReceipts, 'measuredReceipts');
  const actual = grossReceipts - measuredReceipts;
  return { charged, actual, margin: charged - actual };
}

/**
 * Run the reconciliation forward through a season, carrying each day's measured
 * figure as the next day's opening so a single bad measurement does not poison
 * every day after it.
 */
export function reconcileSeries(days, { opening = 0, carry = 'measured' } = {}) {
  isArray(days, 'days', { minLength: 1 });
  const rows = [];
  let carried = opening;
  for (const day of days) {
    const result = reconcile({ ...day, opening: carried });
    rows.push({ day: day.day, ...result });
    carried = carry === 'measured' ? result.measured : result.book;
  }
  return rows;
}

export function worstVariance(rows) {
  if (rows.length === 0) {
    throw new InventoryError('NOTHING_TO_RANK', 'no reconciliation rows were given', {});
  }
  return rows.reduce((worst, row) =>
    Math.abs(row.variancePercent) > Math.abs(worst.variancePercent) ? row : worst
  );
}

export function seasonVariance(rows) {
  const variance = rows.reduce((sum, row) => sum + row.variance, 0);
  const receipts = rows.reduce((sum, row) => sum + row.receipts, 0);
  return {
    variance,
    receipts,
    variancePercent: percentOf(bushelsToDecimal(variance), bushelsToDecimal(receipts), 3),
    days: rows.length,
    meanVariance: roundHalfUp(variance / rows.length, 0),
  };
}
