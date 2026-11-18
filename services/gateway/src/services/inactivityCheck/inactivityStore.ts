/**
 * L'ÉTAT DE LA VÉRIFICATION D'INACTIVITÉ d'une personne, au repos (#18738) — sur le modèle de
 * `phoneReachability/phoneReachabilityStore.ts` :
 *
 * - l'horloge (dernière activité, phase, heure de la question), SCELLÉE par `secret-at-rest` et
 *   liée au compte, avec les Sangs à qui l'alerte a été servie ;
 * - l'ENSEMBLE des personnes que le balayage relit — un SET Redis, jamais `KEYS` ;
 * - le verrou court qui sérialise les pas d'une personne (activité, balayage).
 *
 * Tout vit `INACTIVITY_CHECK_CONFIG.stateTtlSeconds` (72 h) au plus : AUCUN historique.
 */
import { INACTIVITY_CHECK_CONFIG } from '@meeshy/shared/types/inactivity-check';
import type { InactivityCheckRecord, InactivityPhase } from '@meeshy/shared/utils/inactivity-check';
import { openSecret, sealSecret } from '../../utils/secret-at-rest';
import { withCacheLock, type ReachabilityCache } from '../phoneReachability/phoneReachabilityStore';

export type InactivityCache = ReachabilityCache;

export type StoredInactivity = InactivityCheckRecord & {
  /** L'heure de l'alerte, posée quand elle part ; absente avant. */
  readonly alertedAt?: string | null;
  /** Les Sangs à qui l'alerte a été servie : eux seuls reçoivent le retour, ou l'effacement. */
  readonly alertedTo: readonly string[];
  /** Ceux parmi `alertedTo` à qui l'alerte a VRAIMENT été émise : eux seuls reçoivent « va bien ». */
  readonly deliveredTo?: readonly string[];
};

const id = (userId: string): string => userId.toLowerCase();
const stateKey = (userId: string): string => `inact:state:${id(userId)}`;
const contextOf = (userId: string): string => `InactivityCheck.state:${id(userId)}`;
const lockKey = (userId: string): string => `inact:lock:${id(userId)}`;
const WATCH_SET = 'inact:watched';
const TTL = INACTIVITY_CHECK_CONFIG.stateTtlSeconds;
const PHASES: readonly InactivityPhase[] = ['idle', 'asked', 'alerted'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null);
const phase = (value: unknown): InactivityPhase => (PHASES as readonly unknown[]).includes(value) ? (value as InactivityPhase) : 'idle';

function parse(raw: string): StoredInactivity | null {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) return null;
  return {
    lastActivityAt: text(value.lastActivityAt),
    phase: phase(value.phase),
    askedAt: text(value.askedAt),
    alertedAt: text(value.alertedAt),
    alertedTo: Array.isArray(value.alertedTo) ? value.alertedTo.filter((v): v is string => text(v) !== null) : [],
    deliveredTo: Array.isArray(value.deliveredTo) ? value.deliveredTo.filter((v): v is string => text(v) !== null) : [],
  };
}

/** Sans clé de scellement dans un environnement servi, LÈVE : rien n'est rangé en clair. */
export async function storeInactivity(cache: InactivityCache, userId: string, record: StoredInactivity): Promise<void> {
  await cache.set(stateKey(userId), sealSecret(JSON.stringify(record), contextOf(userId)), TTL);
}

/** L'état courant, ou `null` (absent, expiré, illisible, scellé pour un autre compte). */
export async function readInactivity(cache: InactivityCache, userId: string): Promise<StoredInactivity | null> {
  const stored = await cache.get(stateKey(userId));
  if (stored === null) return null;
  try {
    return parse(openSecret(stored, contextOf(userId)));
  } catch {
    return null;
  }
}

export async function clearInactivity(cache: InactivityCache, userId: string): Promise<void> {
  await cache.del(stateKey(userId));
}

export async function watchInactivity(cache: InactivityCache, userId: string, watched: boolean): Promise<void> {
  if (watched) await cache.addMember(WATCH_SET, id(userId));
  else await cache.removeMember(WATCH_SET, id(userId));
}

export async function watchedInactivity(cache: InactivityCache): Promise<readonly string[]> {
  return cache.members(WATCH_SET);
}

/** Sérialise les pas d'UNE personne à travers la flotte. LÈVE quand le verrou reste pris. */
export function withInactivityLock<T>(cache: InactivityCache, userId: string, run: () => Promise<T>): Promise<T> {
  return withCacheLock(cache, lockKey(userId), run);
}
