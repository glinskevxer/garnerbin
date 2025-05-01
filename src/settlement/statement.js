import { isPlainObject } from '../core/assert.js';
import { formatBushels, formatMoney, formatPrice } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { getCommodity } from '../commodity/registry.js';
import { getFactor } from '../grading/factors.js';
import { weightSteps } from '../weights/conversion.js';

/**
 * The settlement statement.
 *
 * This is the piece of paper that goes in the envelope with the cheque, and the
 * test it has to pass is that a grower with a calculator can get from the top
 * of it to the bottom without phoning the office. Every deduction shows its
 * rate and its basis, and the bushel column and the money column never mix.
 */

export function buildStatement(settlement, { house = 'Rush Creek Grain', number } = {}) {
  isPlainObject(settlement, 'settlement');
  return {
    number: number ?? `ST-${settlement.ticket}`,
    house,
    account: settlement.account,
    day: settlement.day,
    commodity: getCommodity(settlement.commodity),
    grade: settlement.grade.label,
    weightRows: weightSteps(settlement.weights).map((step) => ({
      label: step.label,
      bushels: formatBushels(step.bushels),
    })),
    priceRows: priceRows(settlement),
    chargeRows: chargeRows(settlement),
    netCents: settlement.netCents,
  };
}

function priceRows(settlement) {
  const rows = [{ label: 'Posted bid', rate: formatPrice(settlement.bidPoints), amount: '' }];
  for (const line of settlement.discountLines) {
    rows.push({
      label: `${getFactor(line.factor).label} at ${line.value}`,
      rate: `-${formatPrice(line.points)}`,
      amount: '',
    });
  }
  rows.push({ label: 'Net price', rate: formatPrice(settlement.netPricePoints), amount: '' });
  rows.push({
    label: `Value on ${formatBushels(settlement.weights.netBushels)} bushels`,
    rate: '',
    amount: formatMoney(settlement.valueCents),
  });
  return rows;
}

function chargeRows(settlement) {
  const rows = [];
  if (settlement.drying.cents > 0) {
    rows.push({
      label: `Drying, ${settlement.drying.points} points`,
      rate: formatPrice(Math.round(settlement.drying.ratePoints)),
      amount: `-${formatMoney(settlement.drying.cents)}`,
    });
  }
  for (const line of settlement.assessments.lines) {
    if (line.cents === 0) continue;
    rows.push({
      label: line.refundable ? `${line.label} (refundable)` : line.label,
      rate: '',
      amount: `-${formatMoney(line.cents)}`,
    });
  }
  return rows;
}

export function renderStatement(statement) {
  const parts = [
    heading(`${statement.house} settlement ${statement.number}`),
    keyValue([
      ['Account', statement.account],
      ['Date', statement.day],
      ['Grain', statement.commodity.name],
      ['Grade', statement.grade],
    ]),
    '',
    renderTable(
      [
        { header: 'weights', key: 'label' },
        { header: 'bushels', key: 'bushels', align: 'right' },
      ],
      statement.weightRows
    ),
    '',
    renderTable(
      [
        { header: 'price', key: 'label' },
        { header: 'rate', key: 'rate', align: 'right' },
        { header: 'amount', key: 'amount', align: 'right' },
      ],
      statement.priceRows
    ),
  ];
  if (statement.chargeRows.length > 0) {
    parts.push(
      '',
      renderTable(
        [
          { header: 'charges', key: 'label' },
          { header: 'rate', key: 'rate', align: 'right' },
          { header: 'amount', key: 'amount', align: 'right' },
        ],
        statement.chargeRows
      )
    );
  }
  parts.push('', `Net due ${formatMoney(statement.netCents)}`);
  return parts.join('\n');
}

export function statementFor(settlement, options = {}) {
  return renderStatement(buildStatement(settlement, options));
}
