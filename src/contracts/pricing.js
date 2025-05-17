import { ContractError } from '../core/errors.js';
import { isInteger, isPlainObject, isString } from '../core/assert.js';
import { assertDay, compareDays } from '../core/dates.js';
import { formatContract, isExpired, parseContract } from '../pricing/board.js';
import { isPriced, openLegs, priceOf } from './types.js';

/**
 * Pricing an open leg.
 *
 * A basis contract prices its board leg when the grower calls and says sell.
 * A hedged to arrive prices its basis leg the same way. Delayed price has to
 * price both before the house will cut a cheque.
 *
 * Two things get recorded every time: the day, because the service charge runs
 * off it, and who called it in, because a grower who prices at the low of the
 * year will want to know exactly what was said.
 */

export function pricingHistory(contract) {
  return contract.pricings ?? [];
}

function record(contract, entry) {
  return Object.freeze([...pricingHistory(contract), Object.freeze(entry)]);
}

function assertOpen(contract, leg) {
  if (!openLegs(contract).includes(leg)) {
    throw new ContractError('LEG_ALREADY_PRICED', `${contract.id} priced its ${leg} leg already`, {
      id: contract.id,
      leg,
    });
  }
}

export function priceFuturesLeg(contract, input) {
  isPlainObject(input, 'pricing');
  assertOpen(contract, 'futures');
  const day = assertDay(input.day, 'day');
  const month = parseContract(isString(input.futuresContract, 'futuresContract'));
  if (isExpired(month, day, input.holidays ?? [])) {
    throw new ContractError(
      'CONTRACT_EXPIRED',
      `${formatContract(month)} stopped trading before ${day}`,
      {
        id: contract.id,
        day,
        contract: formatContract(month),
      }
    );
  }
  return Object.freeze({
    ...contract,
    futuresPoints: isInteger(input.points, 'points'),
    futuresContract: month,
    pricings: record(contract, {
      leg: 'futures',
      day,
      points: input.points,
      contract: formatContract(month),
      takenBy: input.takenBy ?? null,
    }),
  });
}

export function priceBasisLeg(contract, input) {
  isPlainObject(input, 'pricing');
  assertOpen(contract, 'basis');
  const day = assertDay(input.day, 'day');
  if (compareDays(day, contract.signedOn) < 0) {
    throw new ContractError(
      'PRICED_BEFORE_SIGNED',
      `${contract.id} was not signed until ${contract.signedOn}`,
      {
        id: contract.id,
        day,
        signedOn: contract.signedOn,
      }
    );
  }
  return Object.freeze({
    ...contract,
    basisPoints: isInteger(input.points, 'points'),
    pricings: record(contract, {
      leg: 'basis',
      day,
      points: input.points,
      takenBy: input.takenBy ?? null,
    }),
  });
}

/** Price whatever is still open, in one call, the way a delayed price gets closed out. */
export function priceContract(contract, input) {
  isPlainObject(input, 'pricing');
  let priced = contract;
  if (openLegs(priced).includes('futures')) {
    priced = priceFuturesLeg(priced, {
      day: input.day,
      points: input.futuresPoints,
      futuresContract: input.futuresContract,
      takenBy: input.takenBy,
      holidays: input.holidays,
    });
  }
  if (openLegs(priced).includes('basis')) {
    priced = priceBasisLeg(priced, {
      day: input.day,
      points: input.basisPoints,
      takenBy: input.takenBy,
    });
  }
  return priced;
}

export function isFullyPriced(contract) {
  return isPriced(contract);
}

export function pricedOn(contract) {
  const history = pricingHistory(contract);
  if (history.length === 0) return contract.signedOn;
  return history
    .map((entry) => entry.day)
    .sort()
    .at(-1);
}

export function finalPrice(contract) {
  if (!isPriced(contract)) {
    throw new ContractError(
      'NOT_PRICED',
      `${contract.id} still has ${openLegs(contract).join(' and ')} open`,
      {
        id: contract.id,
        open: openLegs(contract),
      }
    );
  }
  return priceOf(contract);
}
