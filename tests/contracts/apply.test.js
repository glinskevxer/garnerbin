import { describe, expect, it } from 'vitest';
import { createContract } from '../../src/contracts/types.js';
import {
  applyLoad,
  ceilingBushels,
  closePosition,
  deliveredInWindow,
  isComplete,
  openPosition,
  overBushels,
  remainingBushels,
  spillover,
  summarise,
} from '../../src/contracts/apply.js';

const contract = createContract({
  id: 'C-1001',
  kind: 'forward',
  account: 'HALVORSEN',
  commodity: 'corn',
  bushels: 500_000,
  signedOn: '2025-06-02',
  deliveryFrom: '2025-10-01',
  deliveryTo: '2025-11-30',
  futuresPoints: 46_250,
  futuresContract: 'ZCZ25',
  basisPoints: -3000,
});

function load(overrides = {}) {
  return { ticket: 'T-1', day: '2025-10-15', bushels: 100_000, ...overrides };
}

describe('opening a position', () => {
  it('starts empty', () => {
    const position = openPosition(contract);
    expect(position.appliedBushels).toBe(0);
    expect(remainingBushels(position)).toBe(500_000);
    expect(ceilingBushels(position)).toBe(510_000);
    expect(isComplete(position)).toBe(false);
  });
});

describe('applying loads', () => {
  it('adds bushels without touching the position it was given', () => {
    const first = openPosition(contract);
    const second = applyLoad(first, load());
    expect(first.appliedBushels).toBe(0);
    expect(second.appliedBushels).toBe(100_000);
    expect(second.applications).toHaveLength(1);
  });

  it('fills a contract over several loads', () => {
    let position = openPosition(contract);
    for (let index = 0; index < 5; index += 1) {
      position = applyLoad(position, load({ ticket: `T-${index}` }));
    }
    expect(isComplete(position)).toBe(true);
    expect(remainingBushels(position)).toBe(0);
    expect(summarise(position).loads).toBe(5);
  });

  it('refuses a load before the window opens', () => {
    expect(() => applyLoad(openPosition(contract), load({ day: '2025-09-30' }))).toThrow(
      /does not open until 2025-10-01/
    );
  });

  it('refuses a load after the window closes unless told otherwise', () => {
    expect(() => applyLoad(openPosition(contract), load({ day: '2025-12-01' }))).toThrow(
      /closed on 2025-11-30/
    );
    const late = applyLoad(openPosition(contract), load({ day: '2025-12-01', allowLate: true }));
    expect(late.applications[0].late).toBe(true);
  });

  it('refuses the wrong grain', () => {
    expect(() => applyLoad(openPosition(contract), load({ commodity: 'soybeans' }))).toThrow(
      /is a corn contract/
    );
  });

  it('refuses to apply to a closed position', () => {
    const closed = closePosition(openPosition(contract), 'cancelled');
    expect(() => applyLoad(closed, load())).toThrow(/is closed/);
    expect(closed.closedBecause).toBe('cancelled');
  });
});

describe('the tolerance and the spillover', () => {
  it('lets the last load run two percent over', () => {
    let position = openPosition(contract);
    for (let index = 0; index < 4; index += 1) {
      position = applyLoad(position, load({ ticket: `T-${index}` }));
    }
    const filled = applyLoad(position, load({ ticket: 'T-last', bushels: 105_000 }));
    expect(filled.appliedBushels).toBe(505_000);
    expect(overBushels(filled)).toBe(5000);
    expect(filled.applications[4].toSpot).toBe(0);
  });

  it('sends everything past the ceiling to the spot market', () => {
    let position = openPosition(contract);
    for (let index = 0; index < 5; index += 1) {
      position = applyLoad(position, load({ ticket: `T-${index}` }));
    }
    const last = applyLoad(position, load({ ticket: 'T-spill', bushels: 30_000 }));
    expect(last.appliedBushels).toBe(510_000);
    expect(last.applications[5].bushels).toBe(10_000);
    expect(last.applications[5].toSpot).toBe(20_000);
  });

  it('splits a load without applying it', () => {
    const position = openPosition(contract);
    expect(spillover(position, 600_000)).toEqual({ onContract: 510_000, toSpot: 90_000 });
    expect(spillover(position, 100_000)).toEqual({ onContract: 100_000, toSpot: 0 });
  });

  it('refuses a load once the contract is full to the ceiling', () => {
    let position = openPosition(contract);
    position = applyLoad(position, load({ bushels: 510_000 }));
    expect(() => applyLoad(position, load({ ticket: 'T-9' }))).toThrow(/has no room left/);
  });
});

describe('summarising', () => {
  it('reports where the contract stands', () => {
    const position = applyLoad(openPosition(contract), load());
    const summary = summarise(position);
    expect(summary.applied).toBe(100_000);
    expect(summary.remaining).toBe(400_000);
    expect(summary.line).toBe('C-1001 1,000.00 of 5,000.00');
  });

  it('separates the loads that landed in the window', () => {
    let position = applyLoad(openPosition(contract), load());
    position = applyLoad(position, load({ ticket: 'T-2', day: '2025-12-05', allowLate: true }));
    expect(position.applications).toHaveLength(2);
    expect(deliveredInWindow(position)).toHaveLength(1);
  });
});
