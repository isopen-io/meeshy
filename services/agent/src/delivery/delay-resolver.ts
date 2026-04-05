type DelayConfig = {
  minDelayMinutes: number;
  maxDelayMinutes: number;
};

type DelayCategory = 'immediate' | 'short' | 'medium' | 'long';

const CATEGORY_RANGES: Record<DelayCategory, [number, number]> = {
  immediate: [0, 0.1],
  short: [0.1, 0.3],
  medium: [0.3, 0.7],
  long: [0.7, 1.0],
};

function jitter(value: number, percent = 0.2): number {
  return Math.max(1, value + value * (Math.random() * 2 * percent - percent));
}

export function resolveDelaySeconds(
  category: DelayCategory,
  config: DelayConfig & { spreadOverDayEnabled?: boolean; actionIndex?: number; totalActions?: number },
): number {
  const minS = config.minDelayMinutes * 60;
  const maxS = config.maxDelayMinutes * 60;
  const range = maxS - minS;

  if (config.spreadOverDayEnabled && config.actionIndex !== undefined && config.totalActions && config.totalActions > 1) {
    const slotFraction = config.actionIndex / (config.totalActions - 1);
    const base = minS + range * slotFraction;
    return Math.round(jitter(base, 0.15));
  }

  const [lo, hi] = CATEGORY_RANGES[category];
  const lower = minS + range * lo;
  const upper = minS + range * hi;

  const base = lower + Math.random() * (upper - lower);
  return Math.round(jitter(base));
}
