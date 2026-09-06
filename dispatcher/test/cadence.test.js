import { describe, it, expect } from 'vitest';
import { shouldDispatchDb001 } from '../worker.js';

const at = (h, m) => Date.UTC(2026, 8, 6, h, m, 0);

describe('shouldDispatchDb001', () => {
  it('fires at :00 :15 :30 :45', () => {
    for (const m of [0, 15, 30, 45]) {
      expect(shouldDispatchDb001(at(10, m))).toBe(true);
    }
  });

  it('skips the other 5-min ticks', () => {
    for (const m of [5, 10, 20, 25, 35, 40, 50, 55]) {
      expect(shouldDispatchDb001(at(10, m))).toBe(false);
    }
  });

  it('is false for an undefined scheduledTime (dev only)', () => {
    expect(shouldDispatchDb001(undefined)).toBe(false);
  });
});
