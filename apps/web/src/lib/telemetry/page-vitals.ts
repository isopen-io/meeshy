import type { DeviceTier as PlaybackDeviceTier } from '@meeshy/shared/types/social-events-v2';

import type { DeviceTier } from '@/lib/device/capability-tier';

/**
 * **LES WEB VITALS ET LES LONGUES IMAGES DE LA PAGE** (W11, #11317) — LCP,
 * CLS, INP et les longues images (Long Animation Frames) lus par
 * `PerformanceObserver`, sans dépendance : l'accumulateur est PUR (il reçoit
 * des entrées déjà lues), `observePageVitals` est le seul site qui touche au
 * navigateur. Rien ne part d'ici : une séance de lecture emporte ce qu'elle a
 * vu dans son résumé (`playbackPageProbe`), à sa fin, comme le reste.
 */
export type VitalEntry =
  | { readonly kind: 'lcp'; readonly startTime: number }
  | { readonly kind: 'shift'; readonly startTime: number; readonly value: number; readonly hadRecentInput: boolean }
  | { readonly kind: 'interaction'; readonly interactionId: number; readonly duration: number }
  | { readonly kind: 'frame'; readonly duration: number; readonly blockingDuration: number };

export type PageVitals = { readonly lcpMs?: number; readonly cls?: number; readonly inpMs?: number };

export type LongFramesTotal = { readonly count: number; readonly blockingMs: number; readonly worstMs: number };

export type SessionLongFrames = { readonly longFrames: number; readonly longFramesBlockingMs: number; readonly longFrameWorstMs: number };

export type VitalsAccumulator = {
  readonly record: (entry: VitalEntry) => void;
  readonly vitals: () => PageVitals;
  readonly frames: () => LongFramesTotal;
  readonly framesSince: (since: LongFramesTotal) => SessionLongFrames;
};

const SHIFT_GAP_MS = 1_000;
const SHIFT_WINDOW_MS = 5_000;
const INTERACTIONS_PER_DISCARD = 50;
/** Les dernières durées gardées pour la pire image d'une séance : une mémoire BORNÉE. */
const RECENT_FRAMES = 256;

const roundCls = (value: number): number => Math.round(value * 10_000) / 10_000;

export function createVitalsAccumulator(): VitalsAccumulator {
  let lcp: number | null = null;
  let worstWindow: number | null = null;
  let windowValue = 0;
  let windowStart = -Infinity;
  let lastShift = -Infinity;
  const interactions = new Map<number, number>();
  let total: LongFramesTotal = { count: 0, blockingMs: 0, worstMs: 0 };
  const recent: number[] = [];
  let forgotten = 0;

  const shift = (entry: Extract<VitalEntry, { kind: 'shift' }>): void => {
    if (entry.hadRecentInput) return;
    const fresh = entry.startTime - lastShift > SHIFT_GAP_MS || entry.startTime - windowStart > SHIFT_WINDOW_MS;
    windowValue = fresh ? entry.value : windowValue + entry.value;
    if (fresh) windowStart = entry.startTime;
    lastShift = entry.startTime;
    worstWindow = Math.max(worstWindow ?? 0, windowValue);
  };

  const frame = (entry: Extract<VitalEntry, { kind: 'frame' }>): void => {
    total = { count: total.count + 1, blockingMs: total.blockingMs + entry.blockingDuration, worstMs: Math.max(total.worstMs, entry.duration) };
    recent.push(entry.duration);
    if (recent.length > RECENT_FRAMES) {
      recent.shift();
      forgotten += 1;
    }
  };

  const record = (entry: VitalEntry): void => {
    if (entry.kind === 'lcp') lcp = entry.startTime;
    if (entry.kind === 'shift') shift(entry);
    if (entry.kind === 'interaction' && entry.interactionId > 0) interactions.set(entry.interactionId, Math.max(interactions.get(entry.interactionId) ?? 0, entry.duration));
    if (entry.kind === 'frame') frame(entry);
  };

  const inp = (): number | null => {
    const sorted = [...interactions.values()].sort((a, b) => b - a);
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length / INTERACTIONS_PER_DISCARD));
    return sorted[index] ?? null;
  };

  const vitals = (): PageVitals => {
    const interaction = inp();
    return {
      ...(lcp === null ? {} : { lcpMs: Math.round(lcp) }),
      ...(worstWindow === null ? {} : { cls: roundCls(worstWindow) }),
      ...(interaction === null ? {} : { inpMs: Math.round(interaction) }),
    };
  };

  const frames = (): LongFramesTotal => total;

  const framesSince = (since: LongFramesTotal): SessionLongFrames => {
    const worst = recent.slice(Math.max(0, since.count - forgotten)).reduce((max, duration) => Math.max(max, duration), 0);
    return {
      longFrames: total.count - since.count,
      longFramesBlockingMs: Math.round(total.blockingMs - since.blockingMs),
      longFrameWorstMs: Math.round(worst),
    };
  };

  return { record, vitals, frames, framesSince };
}

type ObserverList = { getEntries(): readonly unknown[] };
type ObserverCtor = {
  readonly supportedEntryTypes?: readonly string[];
  new (callback: (list: ObserverList) => void): { observe(options: { type: string; buffered: boolean; durationThreshold?: number }): void };
};

export type VitalsObserverHost = { readonly PerformanceObserver?: ObserverCtor };

const numberOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const field = (entry: unknown, name: string): unknown => (typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>)[name] : undefined);

const READERS: Readonly<Record<string, (entry: unknown) => VitalEntry>> = {
  'largest-contentful-paint': (entry) => ({ kind: 'lcp', startTime: numberOf(field(entry, 'startTime')) }),
  'layout-shift': (entry) => ({
    kind: 'shift',
    startTime: numberOf(field(entry, 'startTime')),
    value: numberOf(field(entry, 'value')),
    hadRecentInput: field(entry, 'hadRecentInput') === true,
  }),
  event: (entry) => ({ kind: 'interaction', interactionId: numberOf(field(entry, 'interactionId')), duration: numberOf(field(entry, 'duration')) }),
  'long-animation-frame': (entry) => ({ kind: 'frame', duration: numberOf(field(entry, 'duration')), blockingDuration: numberOf(field(entry, 'blockingDuration')) }),
};

const INTERACTION_THRESHOLD_MS = 40;

export function observePageVitals(host: VitalsObserverHost): VitalsAccumulator {
  const accumulator = createVitalsAccumulator();
  const Observer = host.PerformanceObserver;
  if (Observer === undefined) return accumulator;
  const supported = Observer.supportedEntryTypes ?? [];
  Object.entries(READERS)
    .filter(([type]) => supported.includes(type))
    .forEach(([type, read]) => {
      try {
        const observer = new Observer((list) => list.getEntries().forEach((entry) => accumulator.record(read(entry))));
        observer.observe(type === 'event' ? { type, buffered: true, durationThreshold: INTERACTION_THRESHOLD_MS } : { type, buffered: true });
      } catch {
        return;
      }
    });
  return accumulator;
}

export type PlaybackPageContext = PageVitals & SessionLongFrames & { readonly deviceTier: PlaybackDeviceTier };

/** Le vocabulaire de la télémétrie (S25) s'arrête à `high` : `pro` n'y monte qu'une marche que le web seul n'atteint pas. */
const playbackTier = (tier: DeviceTier): PlaybackDeviceTier => (tier === 'pro' ? 'high' : tier);

export type PlaybackPageProbe = { readonly open: () => { readonly close: () => PlaybackPageContext } };

export function playbackPageProbe(params: { readonly vitals: VitalsAccumulator; readonly tier: () => DeviceTier }): PlaybackPageProbe {
  return {
    open: () => {
      const deviceTier = playbackTier(params.tier());
      const since = params.vitals.frames();
      return { close: () => ({ deviceTier, ...params.vitals.vitals(), ...params.vitals.framesSince(since) }) };
    },
  };
}

let shared: VitalsAccumulator | null = null;

/** L'observation de la page, ouverte UNE fois, à la première séance de lecture. */
export function pageVitals(): VitalsAccumulator {
  shared ??= observePageVitals(typeof PerformanceObserver === 'undefined' ? {} : { PerformanceObserver: PerformanceObserver as unknown as ObserverCtor });
  return shared;
}
