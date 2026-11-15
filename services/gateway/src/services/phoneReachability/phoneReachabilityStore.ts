/**
 * L'ÉTAT DE JOIGNABILITÉ d'un émetteur, au repos (#18737) — sur le modèle de `battery/batteryStore.ts`.
 *
 * - l'horloge (dernier signe de vie, sondes, injoignable depuis, cause), SCELLÉE par
 *   `secret-at-rest` et liée au compte, avec les lecteurs à qui l'état a été servi ;
 * - la mémoire « a reçu le push d'injoignabilité », lecteur par lecteur, le temps de l'état ;
 * - l'ENSEMBLE des émetteurs que le balayage relit — un SET Redis, jamais `KEYS` ;
 * - le verrou court qui sérialise les pas d'un émetteur (signe de vie, balayage).
 *
 * Tout vit `PHONE_REACHABILITY_CONFIG.stateTtlSeconds` (72 h) au plus : AUCUN historique.
 */
import { PHONE_REACHABILITY_CONFIG, PHONE_UNREACHABLE_CAUSES, type PhoneUnreachableCause } from '@meeshy/shared/types/phone-reachability';
import type { PhoneReachabilityRecord } from '@meeshy/shared/utils/phone-reachability';
import { openSecret, sealSecret } from '../../utils/secret-at-rest';
import type { BatteryCache } from '../battery/batteryStore';

export type ReachabilityCache = BatteryCache;

export type StoredReachability = PhoneReachabilityRecord & {
  /** Les lecteurs à qui l'état injoignable a été servi : qui en sort reçoit son effacement. */
  readonly servedTo: readonly string[];
};

const id = (userId: string): string => userId.toLowerCase();
const stateKey = (userId: string): string => `reach:state:${id(userId)}`;
const contextOf = (userId: string): string => `PhoneReachability.state:${id(userId)}`;
const pushedKey = (userId: string): string => `reach:pushed:${id(userId)}`;
const lockKey = (userId: string): string => `reach:lock:${id(userId)}`;
const WATCH_SET = 'reach:watched';
const TTL = PHONE_REACHABILITY_CONFIG.stateTtlSeconds;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const cause = (value: unknown): PhoneUnreachableCause | null =>
  typeof value === 'string' && (PHONE_UNREACHABLE_CAUSES as readonly string[]).includes(value) ? (value as PhoneUnreachableCause) : null;

function parse(raw: string): StoredReachability | null {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) return null;
  return {
    lastSeenAt: text(value.lastSeenAt),
    probesSent: typeof value.probesSent === 'number' ? value.probesSent : 0,
    lastProbeAt: text(value.lastProbeAt),
    lastAnsweredAt: text(value.lastAnsweredAt),
    unreachableSince: text(value.unreachableSince),
    cause: cause(value.cause),
    servedTo: Array.isArray(value.servedTo) ? value.servedTo.filter((v): v is string => text(v) !== null) : [],
  };
}

/** Sans clé de scellement dans un environnement servi, LÈVE : rien n'est rangé en clair. */
export async function storeReachability(cache: ReachabilityCache, userId: string, record: StoredReachability): Promise<void> {
  await cache.set(stateKey(userId), sealSecret(JSON.stringify(record), contextOf(userId)), TTL);
}

/** L'état courant, ou `null` (absent, expiré, illisible, scellé pour un autre compte). */
export async function readReachability(cache: ReachabilityCache, userId: string): Promise<StoredReachability | null> {
  const stored = await cache.get(stateKey(userId));
  if (stored === null) return null;
  try {
    return parse(openSecret(stored, contextOf(userId)));
  } catch {
    return null;
  }
}

export async function clearReachability(cache: ReachabilityCache, userId: string): Promise<void> {
  await cache.del(stateKey(userId));
}

export async function readPushedReaders(cache: ReachabilityCache, emitterId: string): Promise<ReadonlySet<string>> {
  const raw = await cache.get(pushedKey(emitterId));
  if (raw === null) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter((v): v is string => text(v) !== null) : []);
  } catch {
    return new Set();
  }
}

export async function rememberPushedReaders(cache: ReachabilityCache, emitterId: string, readerIds: readonly string[]): Promise<void> {
  if (readerIds.length === 0) return;
  const known = await readPushedReaders(cache, emitterId);
  await cache.set(pushedKey(emitterId), JSON.stringify([...new Set([...known, ...readerIds])]), TTL);
}

export async function forgetPushedReaders(cache: ReachabilityCache, emitterId: string): Promise<void> {
  await cache.del(pushedKey(emitterId));
}

export async function watchReachability(cache: ReachabilityCache, emitterId: string, watched: boolean): Promise<void> {
  if (watched) await cache.addMember(WATCH_SET, id(emitterId));
  else await cache.removeMember(WATCH_SET, id(emitterId));
}

export async function watchedReachability(cache: ReachabilityCache): Promise<readonly string[]> {
  return cache.members(WATCH_SET);
}

const LOCK_SECONDS = 10;
const LOCK_ATTEMPTS = 40;
const LOCK_PAUSE_MS = 25;

export class ReachabilityBusyError extends Error {
  constructor() {
    super('phone reachability busy');
  }
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Sérialise les pas d'UN émetteur à travers la flotte (verrou `SET NX` court). LÈVE quand il reste pris. */
export async function withReachabilityLock<T>(cache: ReachabilityCache, emitterId: string, run: () => Promise<T>): Promise<T> {
  const key = lockKey(emitterId);
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    if (await cache.setnx(key, token, LOCK_SECONDS)) {
      try {
        return await run();
      } finally {
        if ((await cache.get(key)) === token) await cache.del(key);
      }
    }
    await pause(LOCK_PAUSE_MS);
  }
  throw new ReachabilityBusyError();
}
