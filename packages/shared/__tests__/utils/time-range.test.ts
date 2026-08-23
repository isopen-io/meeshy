import { describe, it, expect } from 'vitest';
import {
  isMsRangeOrdered,
  isMsRangeStrictlyOrdered,
  MS_RANGE_REFINEMENT,
} from '../../utils/time-range';

describe('isMsRangeOrdered', () => {
  it('accepts an ordered range (endMs > startMs)', () => {
    expect(isMsRangeOrdered({ startMs: 100, endMs: 500 })).toBe(true);
  });

  it('accepts a zero-duration range (endMs === startMs)', () => {
    expect(isMsRangeOrdered({ startMs: 250, endMs: 250 })).toBe(true);
  });

  it('rejects an inverted range (endMs < startMs)', () => {
    expect(isMsRangeOrdered({ startMs: 500, endMs: 100 })).toBe(false);
  });
});

describe('isMsRangeStrictlyOrdered', () => {
  it('accepts a strictly ordered range (endMs > startMs)', () => {
    expect(isMsRangeStrictlyOrdered({ startMs: 100, endMs: 500 })).toBe(true);
  });

  it('rejects a zero-duration range (endMs === startMs) — a non-listen', () => {
    expect(isMsRangeStrictlyOrdered({ startMs: 250, endMs: 250 })).toBe(false);
  });

  it('rejects an inverted range (endMs < startMs)', () => {
    expect(isMsRangeStrictlyOrdered({ startMs: 500, endMs: 100 })).toBe(false);
  });

  it('is stricter than isMsRangeOrdered on the zero-duration boundary', () => {
    const point = { startMs: 42, endMs: 42 };
    expect(isMsRangeOrdered(point)).toBe(true);
    expect(isMsRangeStrictlyOrdered(point)).toBe(false);
  });
});

describe('MS_RANGE_REFINEMENT', () => {
  it('points its error at the endMs field with a stable message', () => {
    expect(MS_RANGE_REFINEMENT.path).toEqual(['endMs']);
    expect(MS_RANGE_REFINEMENT.message).toBe('endMs must be greater than or equal to startMs');
  });
});
