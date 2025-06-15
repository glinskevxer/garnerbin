import { ContractError } from '../core/errors.js';
import { isInteger, isPlainObject, isString, oneOf, positive } from '../core/assert.js';
import { extend } from '../core/money.js';
import { assertDay, compareDays } from '../core/dates.js';
import { assertCommodityId, getCommodity } from '../commodity/registry.js';
import { formatContract, parseContract } from '../pricing/board.js';

/**
 * Hedge lots.
 *
 * The desk sells futures against grain it owns and buys them back when the
 * grain is sold. A lot is one of those trades, and it is open until it is
 * offset. Nothing here nets lots together on its own: a short December and a
 * long December are two lots that happen to cancel, and the broker statement
 * shows both, so the book does too.
 */

export const SIDES = Object.freeze(['short', 'long']);

export function openLot(input) {
  isPlainObject(input, 'lot');
  const commodity = assertCommodityId(input.commodity);
  return Object.freeze({
    id: isString(input.id, 'id'),
    commodity,
    contract: parseContract(isString(input.contract, 'contract')),
    side: oneOf(input.side, 'side', SIDES),
    contracts: positive(isInteger(input.contracts, 'contracts'), 'contracts'),
    pricePoints: isInteger(input.pricePoints, 'pricePoints'),
    openedOn: assertDay(input.openedOn, 'openedOn'),
    broker: input.broker ?? null,
    status: 'open',
  });
}

export function isOpen(lot) {
  return lot.status === 'open';
}

export function lotBushels(lot) {
  return lot.contracts * getCommodity(lot.commodity).contractBushels * 100;
}

export function closeLot(lot, { pricePoints, day }) {
  if (!isOpen(lot)) {
    throw new ContractError('LOT_ALREADY_CLOSED', `lot ${lot.id} was closed on ${lot.closedOn}`, {
      id: lot.id,
      closedOn: lot.closedOn,
    });
  }
  const closedOn = assertDay(day, 'day');
  if (compareDays(closedOn, lot.openedOn) < 0) {
    throw new ContractError('CLOSED_BEFORE_OPENED', `${closedOn} is before ${lot.openedOn}`, {
      id: lot.id,
      openedOn: lot.openedOn,
      closedOn,
    });
  }
  return Object.freeze({
    ...lot,
    status: 'closed',
    closePricePoints: isInteger(pricePoints, 'pricePoints'),
    closedOn,
  });
}

/** Points made on a closed lot. A short makes money when the board falls. */
export function realisedPoints(lot) {
  if (isOpen(lot)) {
    throw new ContractError('LOT_STILL_OPEN', `lot ${lot.id} has not been offset`, { id: lot.id });
  }
  const move = lot.closePricePoints - lot.pricePoints;
  return lot.side === 'short' ? -move : move;
}

export function realisedCents(lot) {
  return extend(realisedPoints(lot), lotBushels(lot));
}

export function commissionCents(lot, perContractCents) {
  isInteger(perContractCents, 'perContractCents');
  return lot.contracts * perContractCents * (isOpen(lot) ? 1 : 2);
}

export function openLots(lots) {
  return lots.filter((lot) => isOpen(lot));
}

/** Net contracts across the open book, short counted positive. */
export function netContracts(lots, commodity) {
  return openLots(lots)
    .filter((lot) => commodity === undefined || lot.commodity === commodity)
    .reduce((sum, lot) => sum + (lot.side === 'short' ? lot.contracts : -lot.contracts), 0);
}

export function netHedgeBushels(lots, commodity) {
  return openLots(lots)
    .filter((lot) => commodity === undefined || lot.commodity === commodity)
    .reduce((sum, lot) => sum + (lot.side === 'short' ? lotBushels(lot) : -lotBushels(lot)), 0);
}

export function byMonth(lots) {
  const months = new Map();
  for (const lot of openLots(lots)) {
    const key = formatContract(lot.contract);
    months.set(
      key,
      (months.get(key) ?? 0) + (lot.side === 'short' ? lot.contracts : -lot.contracts)
    );
  }
  return [...months.entries()].map(([contract, contracts]) => ({ contract, contracts }));
}
