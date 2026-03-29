import { estimateCostUsd } from '../../tracing/cost-estimator';

describe('estimateCostUsd', () => {
  it('calculates cost for gpt-4o-mini', () => {
    const cost = estimateCostUsd('gpt-4o-mini', 1000, 500);
    // gpt-4o-mini: input=$0.15/1M, output=$0.60/1M
    // cost = (1000 * 0.15 + 500 * 0.60) / 1_000_000 = 0.00045 / 1 = 0.00045
    expect(cost).toBeCloseTo(0.00045, 5);
  });

  it('calculates cost for claude-sonnet-4-20250514', () => {
    const cost = estimateCostUsd('claude-sonnet-4-20250514', 1000, 500);
    // claude-sonnet: input=$3.00/1M, output=$15.00/1M
    // cost = (1000 * 3.00 + 500 * 15.00) / 1_000_000 = 10500 / 1_000_000 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it('uses fallback rate for unknown models', () => {
    const cost = estimateCostUsd('unknown-model-v9', 1000, 500);
    expect(cost).toBeGreaterThan(0);
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCostUsd('gpt-4o-mini', 0, 0)).toBe(0);
  });

  it('matches prefix for model variants', () => {
    const cost1 = estimateCostUsd('gpt-4o-mini', 1000, 500);
    const cost2 = estimateCostUsd('gpt-4o-mini-2025-03-01', 1000, 500);
    expect(cost1).toBe(cost2);
  });
});
