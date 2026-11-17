import type { SharedLocationOwnSnapshot } from '@meeshy/shared/types/shared-location';

import type { SharedLocationFix, SharedLocationStartPayload, SharedLocationVerdict } from '@/lib/shared-locations/shared-location-sending';
import {
  createSharedLocationSharingCenter,
  type SharedLocationEmitter,
  type SharedLocationFixResult,
  type SharedLocationFixSource,
} from '@/lib/shared-locations/shared-location-sharing';
import { decodeSharedLocationRoster } from '@/lib/shared-locations/shared-location-roster';

/**
 * Le monde des témoins du centre de partage (#18345, #18389) : un émetteur dont chaque
 * réponse se met en file, une horloge, des minuteurs qu'on avance, un stockage en mémoire
 * et le partage que la passerelle sert (`served`, `null` = la relecture n'a rien rendu).
 */

export const AMI = 'a'.repeat(24);
export const AUTRE = 'b'.repeat(24);
export const OWNER = 'c'.repeat(24);
export const T0 = Date.parse('2026-11-14T08:00:00.000Z');
export const HOUR = 3_600_000;
export const PARIS: SharedLocationFix = { latitude: 48.8566, longitude: 2.3522, accuracy: 12 };
export const STARTED: SharedLocationVerdict = { kind: 'started', expiresAt: T0 + HOUR };

export type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
export const deferred = <T,>(): Deferred<T> => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

export const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

/** Le verrou entre onglets d'un même compte (`navigator.locks` en vrai) : un FIFO partagé par les mondes qui le reçoivent. */
export type AcrossTabs = <T>(run: () => Promise<T>) => Promise<T>;
export const makeAcrossTabs = (): AcrossTabs => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(run: () => Promise<T>): Promise<T> => {
    const turn = tail.then(run);
    tail = turn.catch(() => undefined);
    return turn;
  };
};

export function makeWorld({
  fix = { kind: 'fix', fix: PARIS } as SharedLocationFixResult,
  stored = null as string | null,
  granted = true,
  memory = new Map<string, string>(),
  served = null as SharedLocationOwnSnapshot | null,
  acrossTabs = undefined as AcrossTabs | undefined,
}: {
  readonly fix?: SharedLocationFixResult;
  readonly stored?: string | null;
  readonly granted?: boolean;
  readonly memory?: Map<string, string>;
  readonly served?: SharedLocationOwnSnapshot | null;
  readonly acrossTabs?: AcrossTabs;
} = {}) {
  const clock = { now: T0 };
  const account = { current: OWNER as string | null };
  const starts: SharedLocationStartPayload[] = [];
  const updates: SharedLocationFix[] = [];
  let stops = 0;
  const startQueue: Array<() => Promise<SharedLocationVerdict>> = [];
  const stopQueue: Array<() => Promise<boolean>> = [];
  const updateQueue: Array<() => Promise<SharedLocationVerdict>> = [];
  const emitter: SharedLocationEmitter = {
    start: (payload) => {
      starts.push(payload);
      return (startQueue.shift() ?? (async () => STARTED))();
    },
    update: (next) => {
      updates.push(next);
      return (updateQueue.shift() ?? (async () => STARTED))();
    },
    stop: () => {
      stops += 1;
      return (stopQueue.shift() ?? (async () => true))();
    },
  };
  const source = { result: fix, pending: null as Promise<SharedLocationFixResult> | null, granted, prompts: 0, following: 0, listener: null as ((fix: SharedLocationFix) => void) | null };
  const fixes: SharedLocationFixSource = {
    isGranted: async () => source.granted,
    currentFix: async () => {
      source.prompts += 1;
      return source.pending ?? source.result;
    },
    follow: (onFix) => {
      source.following += 1;
      source.listener = onFix;
      return () => {
        source.following -= 1;
        source.listener = null;
      };
    },
  };
  if (stored !== null) memory.set('roster', stored);
  const server = { served, reads: 0 };
  const timers: Array<{ at: number; run: () => void; cancelled: boolean }> = [];
  const center = createSharedLocationSharingCenter({
    emitter,
    fixes,
    storage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    },
    storageKey: 'roster',
    now: () => clock.now,
    schedule: (delay, run) => {
      const timer = { at: clock.now + delay, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    owner: OWNER,
    currentAccount: () => account.current,
    served: async () => {
      server.reads += 1;
      return server.served;
    },
    ...(acrossTabs === undefined ? {} : { acrossTabs }),
  });
  const advance = async (ms: number): Promise<void> => {
    clock.now += ms;
    const due = timers.filter((t) => !t.cancelled && t.at <= clock.now);
    due.forEach((t) => {
      t.cancelled = true;
      t.run();
    });
    await flush();
  };
  return {
    center,
    clock,
    account,
    starts,
    updates,
    stops: () => stops,
    startQueue,
    stopQueue,
    updateQueue,
    source,
    memory,
    stored: () => decodeSharedLocationRoster(memory.get('roster') ?? null, memory.get('roster.withdrawals') ?? null),
    advance,
    server,
  };
}

