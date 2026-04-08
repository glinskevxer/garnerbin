import { InventoryError } from '../core/errors.js';
import { isArray, isPlainObject, nonNegative, positive } from '../core/assert.js';
import { roundHalfUp } from '../core/numbers.js';
import { bushelsFromDecimal, bushelsToDecimal, formatBushels } from '../core/money.js';
import { cubicFeetToBushels } from '../core/units.js';
import { assertCommodityId } from '../commodity/registry.js';
import { capacityOf } from './bins.js';
import { renderTable } from '../core/text.js';

/**
 * Space, before harvest starts.
 *
 * Every October somebody works this out on the back of a grain ticket and gets
 * it wrong, because the bins that are free are not the bins the corn can go in.
 * A bin already holding beans is not space for corn, and neither is one holding
 * last year's wheat that nobody has sold.
 *
 * When the sums say there is not enough, the answer is a ground pile, and the
 * pile is a cone whose height is set by the angle the grain stands at rather
 * than by anything anybody chooses.
 */

export const ANGLE_OF_REPOSE = Object.freeze({
  corn: 23,
  soybeans: 25,
  hrw: 27,
  srw: 27,
  sorghum: 25,
});

export function spacePlan(input) {
  isPlainObject(input, 'plan');
  const commodity = assertCommodityId(input.commodity);
  const holdings = isArray(input.holdings, 'holdings', { minLength: 1 });
  const expected = nonNegative(input.expectedBushels ?? 0, 'expectedBushels');

  const rows = holdings.map((holding) => {
    const capacity = capacityOf(holding.bin);
    const held = nonNegative(holding.bushels ?? 0, 'bushels');
    const holdsSomethingElse = holding.commodity !== null && holding.commodity !== commodity;
    return {
      bin: holding.bin.id,
      holding: holding.commodity,
      capacity,
      held,
      free: holdsSomethingElse ? 0 : Math.max(0, capacity - held),
      usable: !holdsSomethingElse,
      reason: holdsSomethingElse ? `holding ${holding.commodity}` : null,
    };
  });

  const free = rows.reduce((sum, row) => sum + row.free, 0);
  const blocked = rows.filter((row) => !row.usable).reduce((sum, row) => sum + row.capacity, 0);

  return {
    commodity,
    expectedBushels: expected,
    capacity: rows.reduce((sum, row) => sum + row.capacity, 0),
    held: rows.reduce((sum, row) => sum + row.held, 0),
    freeBushels: free,
    blockedBushels: blocked,
    shortBushels: Math.max(0, expected - free),
    enough: expected <= free,
    rows,
  };
}

/** How many days of receipts the free space will take. */
export function daysUntilFull(freeBushels, dailyBushels) {
  positive(dailyBushels, 'dailyBushels');
  return roundHalfUp(bushelsToDecimal(freeBushels) / bushelsToDecimal(dailyBushels), 1);
}

/**
 * A conical ground pile. The height is not a choice: grain stands at its angle
 * of repose and stops.
 */
export function pileFor(commodityId, diameterFeet) {
  const commodity = assertCommodityId(commodityId);
  positive(diameterFeet, 'diameterFeet');
  const angle = ANGLE_OF_REPOSE[commodity];
  const radius = diameterFeet / 2;
  const heightFeet = roundHalfUp(radius * Math.tan((angle * Math.PI) / 180), 2);
  const cubicFeet = (Math.PI * radius * radius * heightFeet) / 3;
  return {
    commodity,
    diameterFeet,
    angleDegrees: angle,
    heightFeet,
    bushels: cubicFeetToBushels(cubicFeet),
  };
}

/** The diameter a pile has to be to hold this much. */
export function pileDiameterFor(commodityId, bushelHundredths) {
  const commodity = assertCommodityId(commodityId);
  positive(bushelHundredths, 'bushelHundredths');
  const angle = ANGLE_OF_REPOSE[commodity];
  const cubicFeet = bushelsToDecimal(bushelHundredths) * 1.2444565;
  const tangent = Math.tan((angle * Math.PI) / 180);
  const radius = Math.cbrt((3 * cubicFeet) / (Math.PI * tangent));
  return roundHalfUp(radius * 2, 1);
}

export function planFor(input) {
  const plan = spacePlan(input);
  if (plan.enough) return { ...plan, pile: null };
  return {
    ...plan,
    pile: pileFor(plan.commodity, pileDiameterFor(plan.commodity, plan.shortBushels)),
  };
}

export function renderSpace(plan) {
  const lines = [
    renderTable(
      [
        { header: 'bin', key: 'bin' },
        { header: 'holding', value: (row) => row.holding ?? 'empty' },
        { header: 'capacity', value: (row) => formatBushels(row.capacity), align: 'right' },
        { header: 'in it', value: (row) => formatBushels(row.held), align: 'right' },
        { header: 'free', value: (row) => formatBushels(row.free), align: 'right' },
        { header: 'why not', value: (row) => row.reason ?? '' },
      ],
      plan.rows
    ),
    '',
    `${formatBushels(plan.freeBushels)} free for ${plan.commodity} against ${formatBushels(plan.expectedBushels)} expected`,
  ];
  if (plan.enough) {
    lines.push('There is room.');
  } else {
    lines.push(`Short ${formatBushels(plan.shortBushels)} bushels.`);
    if (plan.pile) {
      lines.push(
        `A pile ${plan.pile.diameterFeet} feet across would stand ${plan.pile.heightFeet} feet and hold ${formatBushels(plan.pile.bushels)}.`
      );
    }
  }
  return lines.join('\n');
}

export function assertRoom(plan) {
  if (!plan.enough) {
    throw new InventoryError(
      'NOT_ENOUGH_SPACE',
      `short ${formatBushels(plan.shortBushels)} bushels`,
      {
        commodity: plan.commodity,
        shortBushels: plan.shortBushels,
      }
    );
  }
  return bushelsFromDecimal(0);
}
