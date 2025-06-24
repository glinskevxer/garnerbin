import { ConfigError } from '../core/errors.js';
import { isArray, isInteger } from '../core/assert.js';
import { extend, formatMoney } from '../core/money.js';
import { formatContract } from '../pricing/board.js';
import { settleOf } from '../pricing/quotes.js';
import { isOpen, lotBushels, openLots } from './hedge.js';

/**
 * Marking the hedge book.
 *
 * A short that is losing money on the board is winning on the grain, and the
 * whole point of the exercise is that the two roughly cancel. What does not
 * cancel is the timing: the board settles in cash every night and the grain
 * does not settle until it ships, so a rising market takes real money out of
 * the margin account months before the grain pays it back.
 *
 * That gap is what puts elevators out of business, so the margin call figure
 * here is worked out on the open book alone and never netted against grain.
 */

export const MARGIN_PER_CONTRACT = Object.freeze({
  corn: { initial: 120_000, maintenance: 100_000 },
  soybeans: { initial: 280_000, maintenance: 240_000 },
  hrw: { initial: 220_000, maintenance: 190_000 },
  srw: { initial: 200_000, maintenance: 175_000 },
  sorghum: { initial: 120_000, maintenance: 100_000 },
});

export function markLot(lot, marketPoints) {
  isInteger(marketPoints, 'marketPoints');
  if (!isOpen(lot)) {
    throw new ConfigError('LOT_CLOSED', `lot ${lot.id} is closed and does not mark`, {
      id: lot.id,
    });
  }
  const move = marketPoints - lot.pricePoints;
  const points = lot.side === 'short' ? -move : move;
  return { id: lot.id, points, cents: extend(points, lotBushels(lot)) };
}

export function markBook(lots, board) {
  isArray(lots, 'lots');
  const marks = openLots(lots).map((lot) =>
    markLot(lot, settleOf(board, formatContract(lot.contract)))
  );
  return {
    day: board.day,
    marks,
    unrealisedCents: marks.reduce((sum, mark) => sum + mark.cents, 0),
  };
}

export function marginFor(commodityId) {
  const found = MARGIN_PER_CONTRACT[commodityId];
  if (!found) {
    throw new ConfigError('NO_MARGIN_TABLE', `no margin posted for ${commodityId}`, {
      commodity: commodityId,
    });
  }
  return found;
}

export function marginRequirement(lots) {
  let initial = 0;
  let maintenance = 0;
  for (const lot of openLots(lots)) {
    const rate = marginFor(lot.commodity);
    initial += rate.initial * lot.contracts;
    maintenance += rate.maintenance * lot.contracts;
  }
  return { initialCents: initial, maintenanceCents: maintenance };
}

export function accountEquity({ cashCents, unrealisedCents }) {
  isInteger(cashCents, 'cashCents');
  isInteger(unrealisedCents, 'unrealisedCents');
  return cashCents + unrealisedCents;
}

/**
 * The call. Equity under maintenance has to be topped back to initial, not to
 * maintenance, which is the part that surprises people the first time.
 */
export function marginCall({ equityCents, initialCents, maintenanceCents }) {
  if (equityCents >= maintenanceCents) {
    return { called: false, cents: 0, cushionCents: equityCents - maintenanceCents };
  }
  return {
    called: true,
    cents: initialCents - equityCents,
    cushionCents: equityCents - maintenanceCents,
  };
}

export function bookStatus(lots, board, cashCents) {
  const marked = markBook(lots, board);
  const requirement = marginRequirement(lots);
  const equityCents = accountEquity({ cashCents, unrealisedCents: marked.unrealisedCents });
  const call = marginCall({ equityCents, ...requirement });
  return {
    ...marked,
    ...requirement,
    equityCents,
    call,
    line: call.called
      ? `call for ${formatMoney(call.cents)}`
      : `cushion of ${formatMoney(call.cushionCents)}`,
  };
}
