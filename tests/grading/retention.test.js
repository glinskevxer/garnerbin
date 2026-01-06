import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETENTION_DAYS,
  DISPUTED_RETENTION_DAYS,
  daysLeft,
  dispose,
  drawerReport,
  dueForDisposal,
  fileSample,
  findByTicket,
  inFile,
  inspect,
  isDisposable,
  keepUntil,
  markDisputed,
  retentionDays,
} from '../../src/grading/retention.js';

function record(overrides = {}) {
  return fileSample({
    sample: 'S-4471',
    ticket: 'T-10441',
    filedOn: '2025-10-09',
    drawer: 'A-3',
    by: 'D Ohara',
    ...overrides,
  });
}

describe('filing a sample', () => {
  it('opens in the file with the filing on the history', () => {
    const filed = record();
    expect(filed.pulledOn).toBeNull();
    expect(filed.events).toHaveLength(1);
    expect(filed.events[0].by).toBe('D Ohara');
    expect(Object.isFrozen(filed)).toBe(true);
  });

  it('defaults to a thousand grams', () => {
    expect(record().grams).toBe(1000);
  });

  it('needs a drawer to put it in', () => {
    expect(() => fileSample({ sample: 'S-1', filedOn: '2025-10-09' })).toThrow(
      /drawer is required/
    );
  });
});

describe('how long it is held', () => {
  it('holds an ordinary sample two months', () => {
    expect(DEFAULT_RETENTION_DAYS).toBe(60);
    expect(retentionDays(record())).toBe(60);
    expect(keepUntil(record())).toBe('2025-12-08');
  });

  it('holds a disputed one a year from the dispute', () => {
    expect(DISPUTED_RETENTION_DAYS).toBe(365);
    const disputed = markDisputed(record(), { day: '2025-11-20', by: 'the grower' });
    expect(retentionDays(disputed)).toBe(365);
    expect(keepUntil(disputed)).toBe('2026-11-20');
  });

  it('counts the days left', () => {
    expect(daysLeft(record(), '2025-11-08')).toBe(30);
    expect(daysLeft(record(), '2025-12-18')).toBe(-10);
  });

  it('is disposable once the window is past', () => {
    expect(isDisposable(record(), '2025-12-08')).toBe(false);
    expect(isDisposable(record(), '2025-12-09')).toBe(true);
  });
});

describe('handling a filed sample', () => {
  it('records an inspection and leaves it in the file', () => {
    const looked = inspect(record(), { day: '2025-11-02', by: 'R Pelz', why: 'grower called' });
    expect(looked.pulledOn).toBeNull();
    expect(looked.events.at(-1)).toEqual({
      event: 'inspected',
      day: '2025-11-02',
      by: 'R Pelz',
      why: 'grower called',
    });
  });

  it('disposes of it once the window is past', () => {
    const gone = dispose(record(), { day: '2025-12-15', by: 'R Pelz' });
    expect(gone.pulledOn).toBe('2025-12-15');
    expect(gone.events.at(-1).event).toBe('disposed');
  });

  it('refuses to dispose of it early', () => {
    expect(() => dispose(record(), { day: '2025-11-01' })).toThrow(/held until 2025-12-08/);
  });

  it('refuses to dispose of it twice', () => {
    const gone = dispose(record(), { day: '2025-12-15' });
    expect(() => dispose(gone, { day: '2025-12-16' })).toThrow(/was pulled on 2025-12-15/);
  });

  it('refuses to inspect or dispute one that is gone', () => {
    const gone = dispose(record(), { day: '2025-12-15' });
    expect(() => inspect(gone, { day: '2025-12-16' })).toThrow(/came out of the file/);
    expect(() => markDisputed(gone, { day: '2025-12-16' })).toThrow(/not in the file any more/);
  });
});

describe('the drawer', () => {
  const records = [
    record(),
    record({ sample: 'S-4472', ticket: 'T-10442' }),
    record({ sample: 'S-4400', ticket: 'T-10400', filedOn: '2025-09-01' }),
    dispose(record({ sample: 'S-4300', ticket: 'T-10300', filedOn: '2025-08-01' }), {
      day: '2025-10-15',
    }),
  ];

  it('counts only what is still in it', () => {
    expect(inFile(records)).toHaveLength(3);
  });

  it('lists what is due out, oldest first', () => {
    const due = dueForDisposal(records, '2025-12-09');
    expect(due.map((entry) => entry.sample)).toEqual(['S-4400', 'S-4471', 'S-4472']);
  });

  it('lists nothing due before the window', () => {
    expect(dueForDisposal(records, '2025-10-20')).toEqual([]);
  });

  it('finds a sample by its ticket', () => {
    expect(findByTicket(records, 'T-10441')).toHaveLength(1);
    expect(findByTicket(records, 'T-99999')).toEqual([]);
  });

  it('prints the drawer with the status of each', () => {
    const text = drawerReport(records, '2025-12-09');
    expect(text).toContain('S-4471');
    expect(text).toContain('due out');
    expect(text).not.toContain('S-4300');
  });

  it('marks a disputed sample as held whatever the date', () => {
    const disputed = [markDisputed(record(), { day: '2025-11-20' })];
    expect(drawerReport(disputed, '2026-06-01')).toContain('disputed');
  });
});
