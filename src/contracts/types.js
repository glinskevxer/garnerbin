import { ContractError } from '../core/errors.js';
import { isInteger, isPlainObject, isString, oneOf, positive } from '../core/assert.js';
import { assertDay, compareDays, isWithin } from '../core/dates.js';
import { formatPrice } from '../core/money.js';
import { assertCommodityId } from '../commodity/registry.js';
import { parseContract } from '../pricing/board.js';

/**
 * The six ways a grower can sell grain to this house.
 *
 * A cash sale prices both legs today. A forward prices both legs today for
 * delivery later. The interesting ones are the two that price half of it: a
 * basis contract fixes the basis and leaves the board open, and a hedged to
 * arrive fixes the board and leaves the basis open. Delayed price fixes
 * neither, and the house charges for carrying the risk.
 *
 * Every rule below exists because a contract with the wrong leg filled in is
 * indistinguishable from a correct one until somebody tries to price it.
 */

export const CONTRACT_KINDS = Object.freeze(['cash', 'forward', 'basis', 'hta', 'dp', 'minPrice']);

const LEGS = {
  cash: { futures: 'set', basis: 'set' },
  forward: { futures: 'set', basis: 'set' },
  basis: { futures: 'open', basis: 'set' },
  hta: { futures: 'set', basis: 'open' },
  dp: { futures: 'open', basis: 'open' },
  minPrice: { futures: 'set', basis: 'set' },
};

export function createContract(input) {
  isPlainObject(input, 'contract');
  const kind = oneOf(input.kind, 'kind', CONTRACT_KINDS);
  const legs = LEGS[kind];
  const contract = {
    id: isString(input.id, 'id'),
    kind,
    account: isString(input.account, 'account'),
    commodity: assertCommodityId(input.commodity),
    bushels: positive(isInteger(input.bushels, 'bushels'), 'bushels'),
    signedOn: assertDay(input.signedOn, 'signedOn'),
    deliveryFrom: assertDay(input.deliveryFrom, 'deliveryFrom'),
    deliveryTo: assertDay(input.deliveryTo, 'deliveryTo'),
    tolerancePercent: input.tolerancePercent ?? 2,
    futuresPoints: null,
    futuresContract: null,
    basisPoints: null,
    premiumPoints: null,
  };
  if (compareDays(contract.deliveryFrom, contract.deliveryTo) > 0) {
    throw new ContractError('WINDOW_BACKWARD', `${contract.id} opens after it closes`, {
      id: contract.id,
      deliveryFrom: contract.deliveryFrom,
      deliveryTo: contract.deliveryTo,
    });
  }
  fillLeg(contract, 'futures', legs.futures, input);
  fillLeg(contract, 'basis', legs.basis, input);
  if (kind === 'minPrice') {
    contract.premiumPoints = isInteger(input.premiumPoints, 'premiumPoints');
  }
  return Object.freeze(contract);
}

function fillLeg(contract, leg, state, input) {
  const field = leg === 'futures' ? 'futuresPoints' : 'basisPoints';
  const given = input[field];
  if (state === 'set') {
    if (typeof given !== 'number') {
      throw new ContractError('LEG_NOT_PRICED', `a ${contract.kind} contract needs ${field}`, {
        id: contract.id,
        kind: contract.kind,
        leg,
      });
    }
    contract[field] = isInteger(given, field);
    if (leg === 'futures') {
      contract.futuresContract = parseContract(isString(input.futuresContract, 'futuresContract'));
    }
    return;
  }
  if (given !== undefined && given !== null) {
    throw new ContractError('LEG_ALREADY_SET', `a ${contract.kind} contract leaves ${field} open`, {
      id: contract.id,
      kind: contract.kind,
      leg,
    });
  }
}

export function openLegs(contract) {
  const legs = [];
  if (contract.futuresPoints === null) legs.push('futures');
  if (contract.basisPoints === null) legs.push('basis');
  return legs;
}

export function isPriced(contract) {
  return openLegs(contract).length === 0;
}

export function priceOf(contract) {
  if (!isPriced(contract)) return null;
  return contract.futuresPoints + contract.basisPoints;
}

export function withinWindow(contract, day) {
  return isWithin(assertDay(day, 'day'), contract.deliveryFrom, contract.deliveryTo);
}

export function isLate(contract, day) {
  return compareDays(day, contract.deliveryTo) > 0;
}

export function toleranceBushels(contract) {
  return Math.round((contract.bushels * contract.tolerancePercent) / 100);
}

export function describeContract(contract) {
  const price = priceOf(contract);
  const priceText =
    price === null ? `${openLegs(contract).join(' and ')} open` : formatPrice(price);
  return `${contract.id} ${contract.kind} ${contract.commodity} ${contract.bushels / 100} bu at ${priceText}`;
}
