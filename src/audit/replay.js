import { ConfigError } from '../core/errors.js';
import { isPlainObject } from '../core/assert.js';
import { assertDay, compareDays } from '../core/dates.js';
import { formatBushels, formatMoney } from '../core/money.js';
import { renderTable } from '../core/text.js';
import { assertSound } from './journal.js';

/**
 * Replaying the journal.
 *
 * The journal is the only record that cannot have been edited without leaving a
 * mark, so an audit works forwards from it rather than backwards from a report.
 * Replay rebuilds the position out of the entries and then the reports get
 * compared to it, which is the opposite of how everybody does it by hand and
 * the reason doing it by hand takes a week.
 */

const HANDLERS = {
  ticket: (state, entry) => {
    const detail = entry.detail;
    const commodity = commodityRow(state, detail.commodity);
    commodity.tickets += 1;
    if (detail.direction === 'out') commodity.shipped += detail.grossBushels ?? 0;
    else commodity.received += detail.grossBushels ?? 0;
  },
  received: (state, entry) => {
    const commodity = commodityRow(state, entry.detail.commodity);
    commodity.tickets += 1;
    commodity.received += entry.detail.bushels ?? 0;
  },
  shipped: (state, entry) => {
    const commodity = commodityRow(state, entry.detail.commodity);
    commodity.tickets += 1;
    commodity.shipped += entry.detail.bushels ?? 0;
  },
  settlement: (state, entry) => {
    state.settlements += 1;
    state.settledBushels += entry.detail.settlementBushels ?? 0;
    state.paidCents += entry.detail.netCents ?? 0;
    const account = state.accounts.get(entry.detail.account) ?? {
      account: entry.detail.account,
      loads: 0,
      cents: 0,
    };
    account.loads += 1;
    account.cents += entry.detail.netCents ?? 0;
    state.accounts.set(entry.detail.account, account);
  },
};

function commodityRow(state, commodity) {
  const key = commodity ?? 'unknown';
  if (!state.commodities.has(key)) {
    state.commodities.set(key, { commodity: key, tickets: 0, received: 0, shipped: 0 });
  }
  return state.commodities.get(key);
}

export function replay(journal, { through } = {}) {
  isPlainObject(journal, 'journal');
  assertSound(journal);
  const limit = through === undefined ? null : assertDay(through, 'through');
  const state = {
    entries: 0,
    skipped: [],
    settlements: 0,
    settledBushels: 0,
    paidCents: 0,
    commodities: new Map(),
    accounts: new Map(),
    days: new Set(),
  };
  for (const entry of journal.entries) {
    if (limit !== null && compareDays(entry.day, limit) > 0) continue;
    state.entries += 1;
    state.days.add(entry.day);
    const handler = HANDLERS[entry.event];
    if (!handler) {
      state.skipped.push(entry.event);
      continue;
    }
    handler(state, entry);
  }
  return {
    house: journal.house,
    entries: state.entries,
    days: [...state.days].sort(),
    settlements: state.settlements,
    settledBushels: state.settledBushels,
    paidCents: state.paidCents,
    commodities: [...state.commodities.values()].sort((a, b) =>
      a.commodity.localeCompare(b.commodity)
    ),
    accounts: [...state.accounts.values()].sort((a, b) => b.cents - a.cents),
    unhandled: [...new Set(state.skipped)],
  };
}

/** Compare a replayed journal against a register built the ordinary way. */
export function agreesWithRegister(replayed, register) {
  const problems = [];
  const ticketsInJournal = replayed.commodities.reduce((sum, row) => sum + row.tickets, 0);
  if (ticketsInJournal !== register.totals.tickets) {
    problems.push(
      `the journal holds ${ticketsInJournal} tickets and the register holds ${register.totals.tickets}`
    );
  }
  if (replayed.paidCents !== register.totals.netCents) {
    problems.push(
      `the journal paid ${formatMoney(replayed.paidCents)} and the register paid ${formatMoney(register.totals.netCents)}`
    );
  }
  return { ok: problems.length === 0, problems };
}

export function assertAgrees(replayed, register) {
  const result = agreesWithRegister(replayed, register);
  if (!result.ok) {
    throw new ConfigError('JOURNAL_DISAGREES', result.problems.join('; '), {
      problems: result.problems,
    });
  }
  return true;
}

export function renderReplay(replayed) {
  return [
    `${replayed.house}: ${replayed.entries} entries over ${replayed.days.length} days`,
    renderTable(
      [
        { header: 'grain', key: 'commodity' },
        { header: 'tickets', key: 'tickets', align: 'right' },
        { header: 'received', value: (row) => formatBushels(row.received), align: 'right' },
        { header: 'shipped', value: (row) => formatBushels(row.shipped), align: 'right' },
      ],
      replayed.commodities
    ),
    '',
    `${replayed.settlements} settlements, ${formatBushels(replayed.settledBushels)} bushels, ${formatMoney(replayed.paidCents)} paid`,
  ].join('\n');
}
