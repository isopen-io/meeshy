const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-20250514': { input: 0.80, output: 4.00 },
};

const FALLBACK_RATE = { input: 3.00, output: 15.00 };

function findRate(model: string): { input: number; output: number } {
  const exact = MODEL_RATES[model];
  if (exact) return exact;
  for (const [key, rate] of Object.entries(MODEL_RATES)) {
    if (model.startsWith(key)) return rate;
  }
  return FALLBACK_RATE;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  if (inputTokens === 0 && outputTokens === 0) return 0;
  const rate = findRate(model);
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}
