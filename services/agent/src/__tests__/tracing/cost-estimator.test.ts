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

  it('calculates cost for claude-sonnet-5-5 at 2 / 10 dollars per million', () => {
    const cost = estimateCostUsd('claude-sonnet-5-5', 1000, 500);
    // (1000 * 2.00 + 500 * 10.00) / 1_000_000 = 0.007
    expect(cost).toBeCloseTo(0.007, 5);
  });

  it('calculates cost for claude-opus-5-5 at 4 / 20 dollars per million', () => {
    // (1000 * 4.00 + 500 * 20.00) / 1_000_000 = 0.014
    expect(estimateCostUsd('claude-opus-5-5', 1000, 500)).toBeCloseTo(0.014, 5);
  });

  it('prices claude-haiku-5-5 at the long-prompt rate 0.50 / 2.50, never underestimated', () => {
    // (1000 * 0.50 + 500 * 2.50) / 1_000_000 = 0.00175
    expect(estimateCostUsd('claude-haiku-5-5', 1000, 500)).toBeCloseTo(0.00175, 6);
  });

  it('uses fallback rate for unknown models', () => {
    const cost = estimateCostUsd('unknown-model-v9', 1000, 500);
    // #10287 — tarif du plus cher (15 $ / 75 $ par million) : (1000×15 + 500×75) / 1e6.
    expect(cost).toBeCloseTo(0.0525, 6);
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
