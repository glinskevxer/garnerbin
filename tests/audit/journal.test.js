import { describe, expect, it } from 'vitest';
import {
  appendAll,
  appendEntry,
  assertSound,
  entriesOfKind,
  entriesOn,
  GENESIS,
  hashEntry,
  openJournal,
  verifyJournal,
} from '../../src/audit/journal.js';

function build() {
  return appendAll(openJournal('Rush Creek'), [
    { day: '2025-10-09', event: 'ticket', detail: { number: 'T-1', bushels: 90_000 } },
    { day: '2025-10-09', event: 'settlement', detail: { ticket: 'T-1', cents: 384_750 } },
    { day: '2025-10-10', event: 'ticket', detail: { number: 'T-2', bushels: 80_000 } },
  ]);
}

describe('opening and appending', () => {
  it('starts from the genesis hash', () => {
    const journal = openJournal('Rush Creek');
    expect(journal.head).toBe(GENESIS);
    expect(journal.entries).toEqual([]);
  });

  it('numbers the entries and chains the hashes', () => {
    const journal = build();
    expect(journal.entries.map((entry) => entry.sequence)).toEqual([1, 2, 3]);
    expect(journal.entries[1].previous).toBe(journal.entries[0].hash);
    expect(journal.head).toBe(journal.entries[2].hash);
  });

  it('leaves the journal it was given alone', () => {
    const first = openJournal('Rush Creek');
    appendEntry(first, { day: '2025-10-09', event: 'ticket' });
    expect(first.entries).toHaveLength(0);
  });

  it('refuses an entry with no day or no event', () => {
    const journal = openJournal('Rush Creek');
    expect(() => appendEntry(journal, { event: 'ticket' })).toThrow(/day is required/);
    expect(() => appendEntry(journal, { day: '2025-10-09' })).toThrow(/event is required/);
  });
});

describe('the hash', () => {
  it('does not depend on the order the fields were written in', () => {
    const one = hashEntry(GENESIS, { a: 1, b: { c: 2, d: 3 } });
    const other = hashEntry(GENESIS, { b: { d: 3, c: 2 }, a: 1 });
    expect(one).toBe(other);
  });

  it('changes when anything in the entry changes', () => {
    const one = hashEntry(GENESIS, { a: 1 });
    expect(hashEntry(GENESIS, { a: 2 })).not.toBe(one);
    expect(hashEntry('ff'.repeat(32), { a: 1 })).not.toBe(one);
  });

  it('is sixty four hex characters', () => {
    expect(hashEntry(GENESIS, { a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('verifying', () => {
  it('passes a journal nobody has touched', () => {
    expect(verifyJournal(build())).toEqual({ ok: true, brokenAt: null, reason: null });
    expect(assertSound(build()).house).toBe('Rush Creek');
  });

  it('passes an empty journal', () => {
    expect(verifyJournal(openJournal('Rush Creek')).ok).toBe(true);
  });

  it('catches an entry that was edited', () => {
    const journal = build();
    const tampered = {
      ...journal,
      entries: journal.entries.map((entry, index) =>
        index === 1 ? { ...entry, detail: { ...entry.detail, cents: 999_999 } } : entry
      ),
    };
    const result = verifyJournal(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBe(2);
    expect(result.reason).toBe('the entry does not hash to its seal');
  });

  it('catches an entry that was pulled out of the middle', () => {
    const journal = build();
    const shortened = {
      ...journal,
      entries: [journal.entries[0], journal.entries[2]],
    };
    expect(verifyJournal(shortened).ok).toBe(false);
  });

  it('catches a head that does not match the last entry', () => {
    const journal = build();
    expect(verifyJournal({ ...journal, head: GENESIS }).reason).toBe(
      'the head does not match the last entry'
    );
  });

  it('throws with the broken sequence in the message', () => {
    const journal = build();
    const tampered = { ...journal, head: GENESIS };
    expect(() => assertSound(tampered)).toThrow(/breaks at entry 3/);
  });
});

describe('reading the journal', () => {
  it('pulls a day out', () => {
    expect(entriesOn(build(), '2025-10-09')).toHaveLength(2);
    expect(entriesOn(build(), '2025-11-01')).toHaveLength(0);
  });

  it('pulls a kind out', () => {
    expect(entriesOfKind(build(), 'ticket')).toHaveLength(2);
  });
});
