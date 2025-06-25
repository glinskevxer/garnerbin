import { ConfigError } from '../core/errors.js';
import { isInteger, isPlainObject, isString, oneOf, positive } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatBushels } from '../core/money.js';
import { assertCommodityId } from '../commodity/registry.js';
import { getFactor } from '../grading/factors.js';
import { gradeSample } from '../grading/special.js';
import { meetsContractGrade } from '../grading/grade.js';
import { readingsOf } from '../grading/sample.js';

/**
 * Shipping orders.
 *
 * The buyer says what he wants and the house has to load to it. A spec is not
 * the same thing as a grade: a mill will take number two wheat but hold protein
 * to eleven and a half, and the protein is not in the federal table at all.
 *
 * So the spec carries the grade and a set of extra limits, and a load is
 * checked against both before it goes on the car rather than after.
 */

export const MODES = Object.freeze(['truck', 'rail', 'barge']);

export function createShippingOrder(input) {
  isPlainObject(input, 'order');
  const spec = isPlainObject(input.spec ?? {}, 'spec');
  const limits = {};
  for (const [factorId, limit] of Object.entries(spec.limits ?? {})) {
    getFactor(factorId);
    limits[factorId] = limit;
  }
  return Object.freeze({
    number: isString(input.number, 'number'),
    buyer: isString(input.buyer, 'buyer'),
    commodity: assertCommodityId(input.commodity),
    bushels: positive(isInteger(input.bushels, 'bushels'), 'bushels'),
    mode: oneOf(input.mode ?? 'rail', 'mode', MODES),
    destination:
      input.destination === undefined ? null : isString(input.destination, 'destination'),
    shipFrom: assertDay(input.shipFrom, 'shipFrom'),
    shipTo: assertDay(input.shipTo, 'shipTo'),
    pricePoints:
      input.pricePoints === undefined ? null : isInteger(input.pricePoints, 'pricePoints'),
    spec: Object.freeze({
      grade: spec.grade ?? null,
      rejectSpecialGrades: spec.rejectSpecialGrades ?? true,
      limits: Object.freeze(limits),
    }),
  });
}

/**
 * Check a sample against the order. Everything that fails comes back, not just
 * the first thing, because the loader wants to know whether it is one problem
 * or four before he decides to blend.
 */
export function checkAgainstSpec(order, sample) {
  const graded = gradeSample(order.commodity, sample);
  const failures = [];
  if (order.spec.grade !== null && !meetsContractGrade(graded.grade, order.spec.grade)) {
    failures.push(`graded ${graded.label} against a US No. ${order.spec.grade} order`);
  }
  if (order.spec.rejectSpecialGrades && graded.specialGrades.length > 0) {
    failures.push(`carries ${graded.specialGrades.join(', ')}`);
  }
  const readings = readingsOf(sample);
  for (const [factorId, limit] of Object.entries(order.spec.limits)) {
    const value = readings[factorId];
    const factor = getFactor(factorId);
    if (typeof value !== 'number') {
      failures.push(`nobody measured ${factor.label.toLowerCase()}`);
      continue;
    }
    const inside = factor.direction === 'min' ? value >= limit : value <= limit;
    if (!inside) {
      failures.push(`${factor.label.toLowerCase()} is ${value} against a limit of ${limit}`);
    }
  }
  return { ok: failures.length === 0, grade: graded.grade, failures };
}

export function openOrder(order) {
  return Object.freeze({ order, shippedBushels: 0, shipments: Object.freeze([]) });
}

export function applyShipment(position, shipment) {
  isPlainObject(shipment, 'shipment');
  const order = position.order;
  const day = assertDay(shipment.day, 'day');
  const bushels = positive(isInteger(shipment.bushels, 'bushels'), 'bushels');
  if (position.shippedBushels + bushels > order.bushels) {
    throw new ConfigError(
      'OVER_SHIPPED',
      `${order.number} is for ${formatBushels(order.bushels)}`,
      {
        number: order.number,
        shipped: position.shippedBushels,
        bushels,
      }
    );
  }
  return Object.freeze({
    order,
    shippedBushels: position.shippedBushels + bushels,
    shipments: Object.freeze([
      ...position.shipments,
      Object.freeze({
        ticket: isString(shipment.ticket, 'ticket'),
        day,
        bushels,
        car: shipment.car ?? null,
      }),
    ]),
  });
}

export function remainingBushels(position) {
  return position.order.bushels - position.shippedBushels;
}

export function isComplete(position) {
  return remainingBushels(position) === 0;
}

export function orderStatus(position) {
  return {
    number: position.order.number,
    buyer: position.order.buyer,
    ordered: position.order.bushels,
    shipped: position.shippedBushels,
    remaining: remainingBushels(position),
    cars: position.shipments.length,
    complete: isComplete(position),
  };
}
