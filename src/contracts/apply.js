import { ContractError } from '../core/errors.js';
import { isInteger, isPlainObject, isString, positive } from '../core/assert.js';
import { assertDay, compareDays } from '../core/dates.js';
import { formatBushels } from '../core/money.js';
import { isLate, toleranceBushels, withinWindow } from './types.js';

/**
 * Applying loads to a contract.
 *
 * A contract is for a number of bushels in a window, and the loads that come in
 * against it never add up to the number exactly. The tolerance says how far
 * out the last load is allowed to be before the extra rolls to the spot market
 * instead, which is the only fair way to handle a grower whose last truck holds
 * nine hundred bushels against a contract with six hundred left on it.
 *
 * A position is never edited. Applying a load returns a new one, so the
 * register can keep every state the contract passed through.
 */

export function openPosition(contract) {
  return Object.freeze({
    contract,
    appliedBushels: 0,
    applications: Object.freeze([]),
    closed: false,
  });
}

export function remainingBushels(position) {
  return Math.max(0, position.contract.bushels - position.appliedBushels);
}

export function ceilingBushels(position) {
  return position.contract.bushels + toleranceBushels(position.contract);
}

export function isComplete(position) {
  return position.appliedBushels >= position.contract.bushels;
}

export function overBushels(position) {
  return Math.max(0, position.appliedBushels - position.contract.bushels);
}

/**
 * Split a load between the contract and the spot market. Everything up to the
 * ceiling goes on the contract, the rest is a cash sale at whatever the board
 * is that day.
 */
export function spillover(position, bushels) {
  positive(isInteger(bushels, 'bushels'), 'bushels');
  const room = Math.max(0, ceilingBushels(position) - position.appliedBushels);
  const onContract = Math.min(bushels, room);
  return { onContract, toSpot: bushels - onContract };
}

export function applyLoad(position, load) {
  isPlainObject(load, 'load');
  const contract = position.contract;
  const day = assertDay(load.day, 'day');
  const bushels = positive(isInteger(load.bushels, 'bushels'), 'bushels');
  if (position.closed) {
    throw new ContractError('CONTRACT_CLOSED', `${contract.id} is closed`, { id: contract.id });
  }
  if (load.commodity !== undefined && load.commodity !== contract.commodity) {
    throw new ContractError(
      'WRONG_COMMODITY',
      `${contract.id} is a ${contract.commodity} contract`,
      {
        id: contract.id,
        commodity: contract.commodity,
        delivered: load.commodity,
      }
    );
  }
  if (compareDays(day, contract.deliveryFrom) < 0) {
    throw new ContractError(
      'TOO_EARLY',
      `${contract.id} does not open until ${contract.deliveryFrom}`,
      {
        id: contract.id,
        day,
        deliveryFrom: contract.deliveryFrom,
      }
    );
  }
  if (isLate(contract, day) && load.allowLate !== true) {
    throw new ContractError('TOO_LATE', `${contract.id} closed on ${contract.deliveryTo}`, {
      id: contract.id,
      day,
      deliveryTo: contract.deliveryTo,
    });
  }
  const split = spillover(position, bushels);
  if (split.onContract === 0) {
    throw new ContractError('CONTRACT_FULL', `${contract.id} has no room left`, {
      id: contract.id,
      applied: position.appliedBushels,
      ceiling: ceilingBushels(position),
    });
  }
  const application = Object.freeze({
    ticket: isString(load.ticket, 'ticket'),
    day,
    bushels: split.onContract,
    toSpot: split.toSpot,
    late: isLate(contract, day),
  });
  return Object.freeze({
    contract,
    appliedBushels: position.appliedBushels + split.onContract,
    applications: Object.freeze([...position.applications, application]),
    closed: false,
  });
}

export function closePosition(position, reason = 'filled') {
  return Object.freeze({ ...position, closed: true, closedBecause: reason });
}

export function summarise(position) {
  const contract = position.contract;
  return {
    id: contract.id,
    kind: contract.kind,
    account: contract.account,
    commodity: contract.commodity,
    contracted: contract.bushels,
    applied: position.appliedBushels,
    remaining: remainingBushels(position),
    over: overBushels(position),
    loads: position.applications.length,
    complete: isComplete(position),
    line: `${contract.id} ${formatBushels(position.appliedBushels)} of ${formatBushels(contract.bushels)}`,
  };
}

export function deliveredInWindow(position) {
  return position.applications.filter((application) =>
    withinWindow(position.contract, application.day)
  );
}
