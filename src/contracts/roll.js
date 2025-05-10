import { ContractError } from '../core/errors.js';
import { isInteger, isPlainObject } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatContract, isPastFirstNotice, monthsApart, parseContract } from '../pricing/board.js';

/**
 * Rolling the futures leg.
 *
 * A grower who sold December corn in June and is not going to deliver until
 * February has to move the hedge, and moving it is not free. He buys back the
 * old month and sells the new one, so a carry market hands him the spread and
 * the house takes a fee for doing the work.
 *
 * The hard rule is that the roll has to happen before first notice day. Past
 * that a short position is a delivery obligation at a grain terminal several
 * hundred miles from here.
 */

export const DEFAULT_ROLL_FEE_POINTS = 100;

export function hasFuturesLeg(contract) {
  return contract.futuresPoints !== null;
}

export function canRoll(contract, day, holidays = []) {
  if (!hasFuturesLeg(contract)) return false;
  return !isPastFirstNotice(contract.futuresContract, assertDay(day, 'day'), holidays);
}

export function rollCost(spreadPoints, feePoints = DEFAULT_ROLL_FEE_POINTS) {
  isInteger(spreadPoints, 'spreadPoints');
  isInteger(feePoints, 'feePoints');
  return spreadPoints - feePoints;
}

export function rollContract(contract, input) {
  isPlainObject(input, 'roll');
  const day = assertDay(input.day, 'day');
  if (!hasFuturesLeg(contract)) {
    throw new ContractError('NO_FUTURES_LEG', `${contract.id} has no futures leg to roll`, {
      id: contract.id,
      kind: contract.kind,
    });
  }
  if (!canRoll(contract, day, input.holidays ?? [])) {
    throw new ContractError(
      'PAST_FIRST_NOTICE',
      `${formatContract(contract.futuresContract)} is already in notice on ${day}`,
      { id: contract.id, day, contract: formatContract(contract.futuresContract) }
    );
  }
  const target = parseContract(input.to);
  const distance = monthsApart(contract.futuresContract, target);
  if (distance <= 0) {
    throw new ContractError('ROLL_BACKWARD', `${input.to} is not later than the month it is in`, {
      id: contract.id,
      from: formatContract(contract.futuresContract),
      to: input.to,
    });
  }
  if (target.symbol !== contract.futuresContract.symbol) {
    throw new ContractError(
      'ROLL_ACROSS_BOARDS',
      `${contract.id} cannot roll onto ${target.symbol}`,
      {
        id: contract.id,
        from: contract.futuresContract.symbol,
        to: target.symbol,
      }
    );
  }
  const feePoints = input.feePoints ?? DEFAULT_ROLL_FEE_POINTS;
  const gain = rollCost(isInteger(input.spreadPoints, 'spreadPoints'), feePoints);
  const entry = Object.freeze({
    day,
    from: formatContract(contract.futuresContract),
    to: formatContract(target),
    months: distance,
    spreadPoints: input.spreadPoints,
    feePoints,
    netPoints: gain,
  });
  return Object.freeze({
    ...contract,
    futuresContract: target,
    futuresPoints: contract.futuresPoints + gain,
    rolls: Object.freeze([...(contract.rolls ?? []), entry]),
  });
}

export function rollHistory(contract) {
  return contract.rolls ?? [];
}

export function totalRollPoints(contract) {
  return rollHistory(contract).reduce((sum, entry) => sum + entry.netPoints, 0);
}

export function totalRollFees(contract) {
  return rollHistory(contract).reduce((sum, entry) => sum + entry.feePoints, 0);
}
