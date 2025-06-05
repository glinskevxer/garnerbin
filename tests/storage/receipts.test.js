import { describe, expect, it } from 'vitest';
import { formatBushels } from '../../src/core/money.js';
import {
  cancelReceipt,
  isOpen,
  issueReceipt,
  openBushels,
  openReceipts,
  receiptsFor,
  splitReceipt,
  transferReceipt,
} from '../../src/storage/receipts.js';

function build(overrides = {}) {
  return issueReceipt({
    number: 'WR-4401',
    account: 'HALVORSEN',
    commodity: 'corn',
    bushels: 500_000,
    grade: 2,
    bin: 'B-3',
    issuedOn: '2025-10-15',
    ...overrides,
  });
}

describe('issuing', () => {
  it('opens with the issue on the history', () => {
    const receipt = build();
    expect(receipt.status).toBe('open');
    expect(isOpen(receipt)).toBe(true);
    expect(receipt.history).toEqual([{ event: 'issued', day: '2025-10-15' }]);
    expect(Object.isFrozen(receipt)).toBe(true);
  });

  it('dates the storage from the issue unless told otherwise', () => {
    expect(build().storedFrom).toBe('2025-10-15');
    expect(build({ storedFrom: '2025-10-01' }).storedFrom).toBe('2025-10-01');
  });

  it('refuses a receipt for nothing', () => {
    expect(() => build({ bushels: 0 })).toThrow(/greater than zero/);
  });
});

describe('transferring', () => {
  it('moves the title and records both ends', () => {
    const moved = transferReceipt(build(), { to: 'FIRST-STATE-BANK', day: '2025-11-02' });
    expect(moved.account).toBe('FIRST-STATE-BANK');
    expect(moved.history.at(-1)).toEqual({
      event: 'transferred',
      day: '2025-11-02',
      from: 'HALVORSEN',
      to: 'FIRST-STATE-BANK',
    });
  });

  it('refuses a transfer to the holder it already has', () => {
    expect(() => transferReceipt(build(), { to: 'HALVORSEN', day: '2025-11-02' })).toThrow(
      /already held by/
    );
  });

  it('refuses to transfer a cancelled receipt', () => {
    const dead = cancelReceipt(build(), { day: '2025-11-01' });
    expect(() => transferReceipt(dead, { to: 'ANYONE', day: '2025-11-02' })).toThrow(
      /is cancelled/
    );
  });
});

describe('splitting', () => {
  it('cuts one receipt into several that add up', () => {
    const parts = splitReceipt(
      build(),
      [{ bushels: 200_000 }, { bushels: 300_000, account: 'DRAKE-TRUST' }],
      '2025-11-05'
    );
    expect(parts.map((part) => part.number)).toEqual(['WR-4401-1', 'WR-4401-2']);
    expect(formatBushels(parts[0].bushels)).toBe('2,000.00');
    expect(parts[1].account).toBe('DRAKE-TRUST');
    expect(parts[0].history.at(-1).parent).toBe('WR-4401');
  });

  it('refuses parts that do not add up', () => {
    expect(() =>
      splitReceipt(build(), [{ bushels: 200_000 }, { bushels: 200_000 }], '2025-11-05')
    ).toThrow(/add to 4,000.00, not 5,000.00/);
  });

  it('refuses a split into one piece', () => {
    expect(() => splitReceipt(build(), [{ bushels: 500_000 }], '2025-11-05')).toThrow(/at least 2/);
  });
});

describe('cancelling', () => {
  it('closes the receipt with a reason', () => {
    const dead = cancelReceipt(build(), { day: '2026-02-01', reason: 'shipped on unit train' });
    expect(dead.status).toBe('cancelled');
    expect(dead.cancelledOn).toBe('2026-02-01');
    expect(dead.history.at(-1).reason).toBe('shipped on unit train');
  });

  it('refuses to cancel twice', () => {
    const dead = cancelReceipt(build(), { day: '2026-02-01' });
    expect(() => cancelReceipt(dead, { day: '2026-02-02' })).toThrow(/is cancelled/);
  });
});

describe('the register', () => {
  const receipts = [
    build(),
    build({ number: 'WR-4402', account: 'DRAKE-TRUST', bushels: 300_000 }),
    cancelReceipt(build({ number: 'WR-4403' }), { day: '2026-01-05' }),
    build({ number: 'WR-4404', commodity: 'soybeans', bushels: 100_000 }),
  ];

  it('counts only the open ones', () => {
    expect(openReceipts(receipts)).toHaveLength(3);
    expect(formatBushels(openBushels(receipts))).toBe('9,000.00');
  });

  it('counts by commodity', () => {
    expect(formatBushels(openBushels(receipts, 'corn'))).toBe('8,000.00');
    expect(formatBushels(openBushels(receipts, 'soybeans'))).toBe('1,000.00');
  });

  it('pulls one holder out of the register', () => {
    expect(receiptsFor(receipts, 'DRAKE-TRUST')).toHaveLength(1);
  });
});
