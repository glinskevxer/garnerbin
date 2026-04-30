import { describe, expect, it } from 'vitest';
import {
  countBySeverity,
  finding,
  rank,
  renderFindings,
  SEVERITIES,
  worst,
} from '../../src/report/findings.js';

const found = [
  finding('note', 'OLD_RECEIPT', 'WR-1', 'has been open 400 days'),
  finding('stop', 'NO_SAMPLE', 'T-2', 'came in without a sample'),
  finding('warn', 'UNSETTLED', 'T-3', 'has sat for a week'),
  finding('stop', 'BIN_OVERFULL', 'B-1', 'is carrying more than it holds'),
  finding('stop', 'NO_SAMPLE', 'T-1', 'came in without a sample'),
];

describe('a finding', () => {
  it('takes the three severities and no others', () => {
    expect(SEVERITIES).toEqual(['stop', 'warn', 'note']);
    expect(() => finding('urgent', 'X', 'y', 'z')).toThrow(/must be one of/);
  });

  it('needs a code and a message', () => {
    expect(() => finding('stop', undefined, 'y', 'z')).toThrow(/code is required/);
    expect(() => finding('stop', 'X', 'y', undefined)).toThrow(/message is required/);
  });

  it('takes an empty subject', () => {
    expect(finding('stop', 'X', undefined, 'why').subject).toBe('');
    expect(finding('stop', 'X', null, 'why').subject).toBe('');
  });

  it('freezes what it built', () => {
    expect(Object.isFrozen(finding('stop', 'X', 'y', 'z'))).toBe(true);
  });
});

describe('ranking', () => {
  it('puts the stops first, then by code, then by subject', () => {
    expect(rank(found).map((entry) => `${entry.code} ${entry.subject}`)).toEqual([
      'BIN_OVERFULL B-1',
      'NO_SAMPLE T-1',
      'NO_SAMPLE T-2',
      'UNSETTLED T-3',
      'OLD_RECEIPT WR-1',
    ]);
  });

  it('leaves the list it was given alone', () => {
    const before = found[0];
    rank(found);
    expect(found[0]).toBe(before);
  });

  it('counts by severity', () => {
    expect(countBySeverity(found)).toEqual({ stop: 3, warn: 1, note: 1 });
    expect(countBySeverity([])).toEqual({ stop: 0, warn: 0, note: 0 });
  });

  it('names the worst severity present', () => {
    expect(worst(found)).toBe('stop');
    expect(worst([found[0]])).toBe('note');
    expect(worst([])).toBeNull();
  });
});

describe('rendering', () => {
  it('prints a table in rank order', () => {
    const lines = renderFindings(found).split('\n');
    expect(lines[0]).toContain('level');
    expect(lines[2]).toContain('BIN_OVERFULL');
  });

  it('says so when there is nothing', () => {
    expect(renderFindings([])).toBe('Nothing to look at.');
    expect(renderFindings([], { nothing: 'All clear.' })).toBe('All clear.');
  });
});
