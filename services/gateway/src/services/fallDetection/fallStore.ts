/**
 * L'ÉPISODE DE CHUTE d'une personne, au repos (#18748) : l'instant de la chute, SCELLÉ par
 * `secret-at-rest` et lié au compte, avec les Sangs à qui l'alerte a été servie et ceux qui l'ont
 * vraiment reçue. Vit jusqu'à l'expiration de l'épisode, et pas une minute de plus : AUCUN historique.
 */
import { FALL_DETECTION_CONFIG } from '@meeshy/shared/types/fall-detection';
import { fallExpiresAt, type FallRecord } from '@meeshy/shared/utils/fall-detection';
import { openSecret, sealSecret } from '../../utils/secret-at-rest';
import { withCacheLock, type ReachabilityCache } from '../phoneReachability/phoneReachabilityStore';

export type FallCache = ReachabilityCache;

export type StoredFall = FallRecord & {
  /** Les Sangs à qui l'épisode est servi : eux seuls reçoivent son effacement. */
  readonly servedTo: readonly string[];
  /** Ceux parmi `servedTo` à qui l'alerte a VRAIMENT été émise : eux seuls reçoivent « a répondu ». */
  readonly deliveredTo: readonly string[];
};

const id = (userId: string): string => userId.toLowerCase();
const stateKey = (userId: string): string => `fall:state:${id(userId)}`;
const contextOf = (userId: string): string => `FallDetection.state:${id(userId)}`;
const lockKey = (userId: string): string => `fall:lock:${id(userId)}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const ids = (value: unknown): readonly string[] => (Array.isArray(value) ? value.filter((v): v is string => text(v) !== null) : []);

function parse(raw: string): StoredFall | null {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) return null;
  const detectedAt = text(value.detectedAt);
  const openedAt = text(value.openedAt);
  if (detectedAt === null || openedAt === null) return null;
  return { detectedAt, openedAt, servedTo: ids(value.servedTo), deliveredTo: ids(value.deliveredTo) };
}

const ttlSeconds = (record: FallRecord, now: number): number =>
  Math.max(1, Math.min(FALL_DETECTION_CONFIG.episodeTtlMinutes * 60, Math.ceil((Date.parse(fallExpiresAt(record)) - now) / 1000)));

/** Sans clé de scellement dans un environnement servi, LÈVE : rien n'est rangé en clair. */
export async function storeFall(cache: FallCache, userId: string, record: StoredFall, now: number): Promise<void> {
  await cache.set(stateKey(userId), sealSecret(JSON.stringify(record), contextOf(userId)), ttlSeconds(record, now));
}

/** L'épisode courant, ou `null` (absent, expiré, illisible, scellé pour un autre compte). */
export async function readFall(cache: FallCache, userId: string): Promise<StoredFall | null> {
  const stored = await cache.get(stateKey(userId));
  if (stored === null) return null;
  try {
    return parse(openSecret(stored, contextOf(userId)));
  } catch {
    return null;
  }
}

export async function clearFall(cache: FallCache, userId: string): Promise<void> {
  await cache.del(stateKey(userId));
}

export function withFallLock<T>(cache: FallCache, userId: string, run: () => Promise<T>): Promise<T> {
  return withCacheLock(cache, lockKey(userId), run);
}
