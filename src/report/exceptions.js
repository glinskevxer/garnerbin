import { isPlainObject } from '../core/assert.js';
import { assertDay, compareDays, daysBetween } from '../core/dates.js';
import { formatBushels } from '../core/money.js';
import { renderTable } from '../core/text.js';
import { overMeterCeiling } from '../weights/moisture.js';
import { gradeSample } from '../grading/special.js';
import { SAMPLE_GRADE } from '../grading/standards.js';
import { capacityOf } from '../inventory/bins.js';
import { reconcile, withinTolerance } from '../weights/reconcile.js';

/**
 * The exception report.
 *
 * Nobody reads a report that lists everything that is fine. This lists the
 * things that are not, ranked, and it is the first thing on the manager's desk
 * because every one of these costs money if it sits for a week.
 *
 * A stop is something that should not have been allowed to happen. A warn is
 * something that will cost money if nobody acts. A note is worth knowing.
 */

export const SEVERITIES = Object.freeze(['stop', 'warn', 'note']);

const RANK = Object.fromEntries(SEVERITIES.map((severity, index) => [severity, index]));

function exception(severity, code, subject, message) {
  return { severity, code, subject, message };
}

export function findExceptions(desk, asOf, options = {}) {
  isPlainObject(desk, 'desk');
  assertDay(asOf, 'asOf');
  const unsettledDays = options.unsettledDays ?? 3;
  const unhedgedLimit = options.unhedgedLimit ?? Infinity;
  const found = [];

  const samples = new Map((desk.samples ?? []).map((sample) => [sample.id, sample]));
  const settled = new Set((desk.settlements ?? []).map((settlement) => settlement.ticket));

  for (const ticket of desk.tickets ?? []) {
    if (ticket.direction !== 'in') continue;
    const sample = ticket.sampleId ? samples.get(ticket.sampleId) : null;
    if (!sample) {
      found.push(exception('stop', 'NO_SAMPLE', ticket.number, 'came in without a graded sample'));
    } else {
      const graded = gradeSample(ticket.commodity, sample);
      if (graded.grade === SAMPLE_GRADE) {
        found.push(
          exception(
            'stop',
            'SAMPLE_GRADE',
            ticket.number,
            `graded sample grade: ${graded.sampleGradeReasons.join(', ') || 'on the numbers'}`
          )
        );
      }
      if (
        typeof sample.moisture === 'number' &&
        overMeterCeiling(ticket.commodity, sample.moisture)
      ) {
        found.push(
          exception(
            'warn',
            'OVER_METER',
            ticket.number,
            `moisture of ${sample.moisture} is over the meter ceiling`
          )
        );
      }
    }
    if (!settled.has(ticket.number)) {
      const age = daysBetween(ticket.day, asOf);
      if (age > unsettledDays) {
        found.push(
          exception('warn', 'UNSETTLED', ticket.number, `has sat unsettled for ${age} days`)
        );
      }
    }
  }

  for (const position of desk.contracts ?? []) {
    const contract = position.contract;
    const remaining = contract.bushels - position.appliedBushels;
    if (remaining > 0 && compareDays(asOf, contract.deliveryTo) > 0) {
      found.push(
        exception(
          'warn',
          'CONTRACT_SHORT',
          contract.id,
          `closed with ${formatBushels(remaining)} bushels undelivered`
        )
      );
    }
  }

  for (const position of desk.positions ?? []) {
    if (Math.abs(position.unhedgedBushels) > unhedgedLimit) {
      found.push(
        exception(
          'stop',
          'UNHEDGED',
          position.commodity,
          `${formatBushels(position.unhedgedBushels)} bushels unhedged`
        )
      );
    }
  }

  for (const holding of Object.values(desk.house?.holdings ?? {})) {
    if (holding.bushels > capacityOf(holding.bin)) {
      found.push(
        exception('stop', 'BIN_OVERFULL', holding.bin.id, 'is carrying more than it holds')
      );
    }
  }

  for (const receipt of desk.receipts ?? []) {
    if (receipt.status !== 'open') continue;
    const age = daysBetween(receipt.issuedOn, asOf);
    if (age > 365) {
      found.push(exception('note', 'OLD_RECEIPT', receipt.number, `has been open ${age} days`));
    }
  }

  if (desk.reconciliation) {
    const result = reconcile(desk.reconciliation);
    if (!withinTolerance(result, options.tolerancePercent)) {
      found.push(
        exception(
          'warn',
          'OUT_OF_TOLERANCE',
          'inventory',
          `is ${result.variancePercent} percent ${result.direction}`
        )
      );
    }
  }

  return found.sort((a, b) => RANK[a.severity] - RANK[b.severity] || a.code.localeCompare(b.code));
}

export function countBySeverity(exceptions) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const entry of exceptions) counts[entry.severity] += 1;
  return counts;
}

export function renderExceptions(exceptions) {
  if (exceptions.length === 0) return 'Nothing to look at.';
  return renderTable(
    [
      { header: 'level', key: 'severity' },
      { header: 'what', key: 'code' },
      { header: 'on', key: 'subject' },
      { header: 'why', key: 'message' },
    ],
    exceptions
  );
}
