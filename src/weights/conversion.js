import { isPlainObject, nonNegative } from '../core/assert.js';
import { formatBushels } from '../core/money.js';
import { assertCommodityId, legalWeight, marketMoisture } from '../commodity/registry.js';
import { poundsToBushels } from '../core/units.js';
import { applyDockage, reportedDockage } from '../grading/dockage.js';
import { applyShrink, DEFAULT_SHRINK_FACTOR, shrinkPercent } from './shrink.js';

/**
 * Net pounds to settlement bushels, in the one order that is defensible.
 *
 * Dockage comes off first, on the gross weight, because dockage is not grain
 * and the house never owned it. Shrink comes off what is left, because shrink
 * is water leaving the grain that is actually there. Doing it the other way
 * round takes shrink on the weed seed, which is small, wrong, and impossible to
 * explain to a grower who has worked it out on the back of the ticket.
 */

export function settlementWeights(input) {
  isPlainObject(input, 'input');
  const commodity = assertCommodityId(input.commodity);
  const netPounds = nonNegative(input.netPounds, 'netPounds');
  const moisture = nonNegative(input.moisture ?? marketMoisture(commodity), 'moisture');
  const target = input.targetMoisture ?? marketMoisture(commodity);
  const factor = input.shrinkFactor ?? DEFAULT_SHRINK_FACTOR;
  const handling = nonNegative(input.handlingPercent ?? 0, 'handlingPercent');

  const grossBushels = poundsToBushels(netPounds, legalWeight(commodity));
  const docked = applyDockage(grossBushels, reportedDockage(input.dockagePercent ?? 0));
  const moisturePercent = shrinkPercent({ from: moisture, to: target, factor });
  const shrunk = applyShrink(docked.netBushels, moisturePercent + handling);

  return {
    commodity,
    netPounds,
    moisture,
    targetMoisture: target,
    shrinkFactor: factor,
    grossBushels,
    dockagePercent: docked.dockagePercent,
    dockageBushels: docked.dockageBushels,
    cleanBushels: docked.netBushels,
    moistureShrinkPercent: moisturePercent,
    handlingShrinkPercent: handling,
    shrinkPercent: shrunk.shrinkPercent,
    shrinkBushels: shrunk.shrinkBushels,
    netBushels: shrunk.netBushels,
  };
}

/** The lines the settlement statement prints, in the order the deductions happened. */
export function weightSteps(result) {
  const steps = [
    { label: 'Gross bushels', bushels: result.grossBushels },
    {
      label: `Dockage at ${result.dockagePercent.toFixed(1)} percent`,
      bushels: -result.dockageBushels,
    },
    { label: 'Clean bushels', bushels: result.cleanBushels },
    {
      label: `Shrink at ${result.shrinkPercent.toFixed(2)} percent`,
      bushels: -result.shrinkBushels,
    },
    { label: 'Settlement bushels', bushels: result.netBushels },
  ];
  return steps.filter((step) => step.bushels !== 0 || step.label.startsWith('Settlement'));
}

export function explainWeights(result) {
  return weightSteps(result)
    .map((step) => `${step.label.padEnd(34)}${formatBushels(step.bushels).padStart(12)}`)
    .join('\n');
}

/** What the house keeps: the dockage it will sell and the shrink it took. */
export function houseKeeps(result) {
  return result.dockageBushels + result.shrinkBushels;
}
