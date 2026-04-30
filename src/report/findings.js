import { isString, oneOf } from '../core/assert.js';
import { renderTable } from '../core/text.js';
import { textColumn } from './columns.js';

/**
 * Findings.
 *
 * The exception sheet and the doctor both produce a list of things somebody
 * should look at, ranked the same way and printed the same way. They each had
 * their own copy of the severity order, the counter and the renderer, and the
 * two copies had already drifted: one sorted by code inside a severity and the
 * other did not.
 *
 * A stop is something that should not have been allowed to happen. A warn is
 * something that will cost money if nobody acts. A note is worth knowing.
 */

export const SEVERITIES = Object.freeze(['stop', 'warn', 'note']);

const RANK = Object.fromEntries(SEVERITIES.map((severity, index) => [severity, index]));

export function finding(severity, code, subject, message) {
  return Object.freeze({
    severity: oneOf(severity, 'severity', SEVERITIES),
    code: isString(code, 'code'),
    subject: subject === undefined || subject === null ? '' : String(subject),
    message: isString(message, 'message'),
  });
}

export function rank(findings) {
  return [...findings].sort(
    (a, b) =>
      RANK[a.severity] - RANK[b.severity] ||
      a.code.localeCompare(b.code) ||
      a.subject.localeCompare(b.subject)
  );
}

export function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITIES.map((severity) => [severity, 0]));
  for (const entry of findings) counts[entry.severity] += 1;
  return counts;
}

export function worst(findings) {
  if (findings.length === 0) return null;
  return rank(findings)[0].severity;
}

export function renderFindings(findings, { nothing = 'Nothing to look at.' } = {}) {
  if (findings.length === 0) return nothing;
  return renderTable(
    [
      textColumn('level', 'severity'),
      textColumn('what', 'code'),
      textColumn('on', 'subject'),
      textColumn('why', 'message'),
    ],
    rank(findings)
  );
}
