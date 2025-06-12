import { isArray, isPlainObject } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatBushels } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { hedgeGap, totalNet } from './position.js';

/**
 * The daily position report.
 *
 * One sheet, every commodity, and it goes to the manager and the lender the
 * same morning. The lender reads two columns: net position and unhedged, and
 * the second one is why the report exists. Everything else on the page is there
 * so the two numbers can be traced back to something.
 */

export function buildDpr(input) {
  isPlainObject(input, 'report');
  const positions = isArray(input.positions, 'positions', { minLength: 1 });
  return {
    day: assertDay(input.day, 'day'),
    house: input.house ?? 'unnamed house',
    positions,
    rows: positions.map((position) => {
      const gap = hedgeGap(position);
      return {
        commodity: position.commodity,
        inventory: formatBushels(position.inventory),
        growerOwned: formatBushels(position.openStorage + position.receipts),
        houseOwned: formatBushels(position.houseOwned),
        purchases: formatBushels(position.purchasesOpen),
        sales: formatBushels(position.salesOpen),
        net: formatBushels(position.netBushels),
        hedged: formatBushels(position.hedgedBushels),
        unhedged: formatBushels(position.unhedgedBushels),
        action: gap.action === 'none' ? 'square' : `${gap.action} ${gap.contracts}`,
      };
    }),
    totals: {
      net: totalNet(positions),
      unhedged: positions.reduce((sum, position) => sum + position.unhedgedBushels, 0),
      inventory: positions.reduce((sum, position) => sum + position.inventory, 0),
    },
  };
}

const COLUMNS = [
  { header: 'grain', key: 'commodity' },
  { header: 'in house', key: 'inventory', align: 'right' },
  { header: 'grower', key: 'growerOwned', align: 'right' },
  { header: 'owned', key: 'houseOwned', align: 'right' },
  { header: 'bought', key: 'purchases', align: 'right' },
  { header: 'sold', key: 'sales', align: 'right' },
  { header: 'net', key: 'net', align: 'right' },
  { header: 'hedged', key: 'hedged', align: 'right' },
  { header: 'unhedged', key: 'unhedged', align: 'right' },
  { header: 'do', key: 'action' },
];

export function renderDpr(report) {
  return [
    heading(`${report.house} daily position ${report.day}`),
    '',
    renderTable(COLUMNS, report.rows),
    '',
    keyValue([
      ['Net across the house', formatBushels(report.totals.net)],
      ['Unhedged', formatBushels(report.totals.unhedged)],
      ['In the house', formatBushels(report.totals.inventory)],
    ]),
  ].join('\n');
}

export function dprFor(input) {
  return renderDpr(buildDpr(input));
}

/** The one line a lender covenant actually tests. */
export function unhedgedExceeds(report, limitBushels) {
  return Math.abs(report.totals.unhedged) > limitBushels;
}
