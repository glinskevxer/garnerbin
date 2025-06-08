import { InventoryError } from '../core/errors.js';
import { isArray, isInteger, isPlainObject, isString, positive } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatBushels } from '../core/money.js';
import { assertCommodityId } from '../commodity/registry.js';
import { canAccept, capacityOf } from './bins.js';

/**
 * The bin ledger.
 *
 * Every move is recorded and no state is edited in place, because the question
 * the manager asks is never what is in bin four, it is what was in bin four on
 * the ninth and where did it go. A house that only keeps current holdings
 * cannot answer that, and the answer is what settles the argument when a buyer
 * rejects a car.
 */

export function createHouse(bins, { day } = {}) {
  isArray(bins, 'bins', { minLength: 1 });
  const holdings = {};
  for (const bin of bins) {
    if (holdings[bin.id]) {
      throw new InventoryError('DUPLICATE_BIN', `${bin.id} is in the house twice`, { id: bin.id });
    }
    holdings[bin.id] = Object.freeze({ bin, bushels: 0, commodity: bin.commodity });
  }
  return Object.freeze({
    day: day === undefined ? null : assertDay(day, 'day'),
    holdings: Object.freeze(holdings),
    log: Object.freeze([]),
  });
}

export function holdingOf(house, binId) {
  const holding = house.holdings[isString(binId, 'bin')];
  if (!holding) {
    throw new InventoryError('NO_SUCH_BIN', `there is no bin ${binId} in this house`, {
      bin: binId,
      bins: Object.keys(house.holdings),
    });
  }
  return holding;
}

function withHoldings(house, changes, entry) {
  return Object.freeze({
    ...house,
    holdings: Object.freeze({ ...house.holdings, ...changes }),
    log: Object.freeze([...house.log, Object.freeze(entry)]),
  });
}

export function receive(house, move) {
  isPlainObject(move, 'move');
  const holding = holdingOf(house, move.bin);
  const commodity = assertCommodityId(move.commodity);
  const bushels = positive(isInteger(move.bushels, 'bushels'), 'bushels');
  const check = canAccept(holding.bin, { commodity, bushels, holding: holding.bushels });
  if (!check.ok) {
    throw new InventoryError('BIN_WILL_NOT_TAKE_IT', check.problems.join('; '), {
      bin: move.bin,
      problems: check.problems,
    });
  }
  return withHoldings(
    house,
    {
      [move.bin]: Object.freeze({
        bin: holding.bin,
        bushels: holding.bushels + bushels,
        commodity,
      }),
    },
    {
      event: 'receive',
      day: assertDay(move.day, 'day'),
      bin: move.bin,
      commodity,
      bushels,
      ticket: move.ticket ?? null,
    }
  );
}

export function ship(house, move) {
  isPlainObject(move, 'move');
  const holding = holdingOf(house, move.bin);
  const bushels = positive(isInteger(move.bushels, 'bushels'), 'bushels');
  if (bushels > holding.bushels) {
    throw new InventoryError(
      'NOT_ENOUGH_IN_THE_BIN',
      `${move.bin} holds ${formatBushels(holding.bushels)}`,
      {
        bin: move.bin,
        holding: holding.bushels,
        asked: bushels,
      }
    );
  }
  const left = holding.bushels - bushels;
  return withHoldings(
    house,
    {
      [move.bin]: Object.freeze({
        bin: holding.bin,
        bushels: left,
        commodity: left === 0 ? holding.bin.commodity : holding.commodity,
      }),
    },
    {
      event: 'ship',
      day: assertDay(move.day, 'day'),
      bin: move.bin,
      commodity: holding.commodity,
      bushels,
      ticket: move.ticket ?? null,
    }
  );
}

export function transfer(house, move) {
  isPlainObject(move, 'move');
  const from = holdingOf(house, move.from);
  if (move.from === move.to) {
    throw new InventoryError('TRANSFER_TO_SELF', `${move.from} cannot transfer to itself`, {
      bin: move.from,
    });
  }
  const drawn = ship(house, { bin: move.from, bushels: move.bushels, day: move.day });
  return receive(drawn, {
    bin: move.to,
    commodity: from.commodity,
    bushels: move.bushels,
    day: move.day,
  });
}

export function totalByCommodity(house) {
  const totals = {};
  for (const holding of Object.values(house.holdings)) {
    if (holding.bushels === 0 || holding.commodity === null) continue;
    totals[holding.commodity] = (totals[holding.commodity] ?? 0) + holding.bushels;
  }
  return totals;
}

export function houseBushels(house) {
  return Object.values(house.holdings).reduce((sum, holding) => sum + holding.bushels, 0);
}

export function spaceLeft(house, commodity) {
  return Object.values(house.holdings)
    .filter((holding) => holding.commodity === null || holding.commodity === commodity)
    .reduce((sum, holding) => sum + Math.max(0, capacityOf(holding.bin) - holding.bushels), 0);
}

export function movementsOn(house, day) {
  return house.log.filter((entry) => entry.day === day);
}
