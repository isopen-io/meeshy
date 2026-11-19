/**
 * L'ÉPISODE DE CHUTE d'une personne, au repos (#18748) : l'instant de la chute, SCELLÉ par
 * `secret-at-rest` et lié au compte, avec les Sangs à qui l'alerte a été servie et ceux qui l'ont
 * vraiment reçue. Vit jusqu'à l'expiration de l'épisode, et pas une minute de plus : AUCUN historique.
 *
 * À côté, deux traces scellées et bornées : la PIERRE TOMBALE d'un épisode clos (son instant seul,
 * tant qu'un rapport du même instant peut encore arriver) et les OUVERTURES des dernières 24 h (le
 * plafond des alertes qui percent). Toutes les clés sont NOMMÉES par un pseudonyme (HMAC) : aucune
 * ne porte l'identifiant du compte.
 */
import { FALL_DETECTION_CONFIG } from '@meeshy/shared/types/fall-detection';
import { fallExpiresAt, fallTombstoneExpiresAt, type FallRecord, type FallTombstone } from '@meeshy/shared/utils/fall-detection';
import { openSecret, sealedPseudonym, sealSecret } from '../../utils/secret-at-rest';
import { ReachabilityBusyError, withCacheLock, type ReachabilityCache } from '../phoneReachability/phoneReachabilityStore';

export type FallCache = ReachabilityCache;

export type StoredFall = FallRecord & {
  /** Les Sangs à qui l'épisode est servi : eux seuls reçoivent son effacement. */
  readonly servedTo: readonly string[];
  /** Ceux parmi `servedTo` à qui l'alerte a VRAIMENT été émise : eux seuls reçoivent « a répondu ». */
  readonly deliveredTo: readonly string[];
};

const id = (userId: string): string => userId.toLowerCase();
const nameOf = (userId: string): string => sealedPseudonym('fall.key', userId);
const stateKey = (userId: string): string => `fall:state:${nameOf(userId)}`;
const tombstoneKey = (userId: string): string => `fall:closed:${nameOf(userId)}`;
const openingsKey = (userId: string): string => `fall:opened:${nameOf(userId)}`;
const lockKey = (userId: string): string => `fall:lock:${nameOf(userId)}`;
const contextOf = (userId: string): string => `FallDetection.state:${id(userId)}`;
const tombstoneContextOf = (userId: string): string => `FallDetection.closed:${id(userId)}`;
const openingsContextOf = (userId: string): string => `FallDetection.opened:${id(userId)}`;
const DAY_SECONDS = 24 * 60 * 60;

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

async function readSealed(cache: FallCache, key: string, context: string): Promise<unknown> {
  const stored = await cache.get(key);
  if (stored === null) return null;
  try {
    return JSON.parse(openSecret(stored, context));
  } catch {
    return null;
  }
}

/** Range la pierre tombale d'un épisode clos, jusqu'à ce qu'aucun rapport du même instant ne soit plus recevable. */
export async function storeFallTombstone(cache: FallCache, userId: string, tombstone: FallTombstone, now: number): Promise<void> {
  const ttl = Math.ceil((Date.parse(fallTombstoneExpiresAt(tombstone)) - now) / 1000);
  if (ttl <= 0) return;
  await cache.set(tombstoneKey(userId), sealSecret(JSON.stringify({ detectedAt: tombstone.detectedAt }), tombstoneContextOf(userId)), ttl);
}

export async function readFallTombstone(cache: FallCache, userId: string): Promise<FallTombstone | null> {
  const value = await readSealed(cache, tombstoneKey(userId), tombstoneContextOf(userId));
  const detectedAt = isRecord(value) ? text(value.detectedAt) : null;
  return detectedAt === null ? null : { detectedAt };
}

/** Les ouvertures d'épisode des dernières 24 h (au plus quelques instants), pour le plafond des alertes qui percent. */
export async function readFallOpenings(cache: FallCache, userId: string): Promise<readonly string[]> {
  return ids(await readSealed(cache, openingsKey(userId), openingsContextOf(userId)));
}

export async function storeFallOpenings(cache: FallCache, userId: string, openings: readonly string[]): Promise<void> {
  await cache.set(openingsKey(userId), sealSecret(JSON.stringify(openings), openingsContextOf(userId)), DAY_SECONDS);
}

/** Le verrou d'un émetteur est resté pris malgré les reprises (environ une seconde) : rien n'a été fait. */
export const isFallLockBusy = (error: unknown): boolean => error instanceof ReachabilityBusyError;

export function withFallLock<T>(cache: FallCache, userId: string, run: () => Promise<T>): Promise<T> {
  return withCacheLock(cache, lockKey(userId), run);
}
