/**
 * LE PARTAGE TEMPORAIRE EN COURS d'un compte (#14109, #16980) — COMPLET, scellé au repos.
 *
 * Décision du porteur (2026-11-07) : le serveur garde la position entière et la liste
 * des destinataires avec leur précision, pour qu'une remontée de lien fasse revenir la
 * dernière position sans nouvel envoi, et il tronque au service. Ce qui est rangé dans
 * le cache partagé est SCELLÉ par `secret-at-rest` (AES-256-GCM), lié au compte comme
 * données authentifiées : une valeur recopiée sous la clé d'un autre ne s'ouvre pas.
 * Jamais de coordonnée ni de destinataire en clair, en cache ou en journal.
 *
 * Rien n'est gardé au-delà du terme du partage : la durée de vie de la clé EST le
 * temps restant, et `location:share-stop` l'efface. Aucun historique. Une valeur
 * illisible ou échue vaut « rien ».
 */
import {
  SHARED_LOCATION_PRECISIONS,
  type SharedLocationPosition,
  type SharedLocationPrecision,
} from '@meeshy/shared/types/shared-location';
import type { CacheStore } from '../CacheStore';
import { hasValidSecretsKey, isSealedSecret, openSecret, sealSecret } from '../../utils/secret-at-rest';

export type SharedLocationRecipient = { readonly userId: string; readonly precision: SharedLocationPrecision };

export type SharedLocationState = {
  /** Le partage auquel cet état appartient : chaque `start` en ouvre un nouveau, que seul le pointeur rend courant. */
  readonly sessionId: string;
  readonly recipients: readonly SharedLocationRecipient[];
  readonly position: SharedLocationPosition;
  readonly updatedAt: string;
  readonly expiresAt: string;
};

export type SharedLocationCache = Pick<CacheStore, 'get' | 'set' | 'del'>;

const keyOf = (userId: string, sessionId: string): string => `shared-location:${userId.toLowerCase()}:${sessionId}`;
const currentKeyOf = (userId: string, generation: string): string => `shared-location-current:${userId.toLowerCase()}:${generation}`;
/** La génération d'un compte qui n'a jamais arrêté de partage. */
const GENESIS = 'genesis';
const SESSION_ID = /^[0-9a-f-]{36}$/;
const contextOf = (userId: string): string => `SharedLocation.state:${userId.toLowerCase()}`;

const isPrecision = (value: unknown): value is SharedLocationPrecision =>
  typeof value === 'string' && (SHARED_LOCATION_PRECISIONS as readonly string[]).includes(value);

const isCoordinate = (value: unknown, bound: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= bound;

function parseRecipient(value: unknown): SharedLocationRecipient | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  return typeof row.userId === 'string' && isPrecision(row.precision) ? { userId: row.userId, precision: row.precision } : null;
}

function parsePosition(value: unknown): SharedLocationPosition | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!isCoordinate(row.latitude, 90) || !isCoordinate(row.longitude, 180)) return null;
  const accuracy = typeof row.accuracy === 'number' && Number.isFinite(row.accuracy) && row.accuracy >= 0 ? row.accuracy : undefined;
  return { latitude: row.latitude, longitude: row.longitude, ...(accuracy === undefined ? {} : { accuracy }) };
}

function parseState(raw: string): SharedLocationState | null {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const position = parsePosition(row.position);
  if (!position || !Array.isArray(row.recipients) || typeof row.sessionId !== 'string') return null;
  if (typeof row.updatedAt !== 'string' || typeof row.expiresAt !== 'string') return null;
  const recipients = row.recipients.map(parseRecipient);
  if (recipients.some((recipient) => recipient === null)) return null;
  return { sessionId: row.sessionId, recipients: recipients as SharedLocationRecipient[], position, updatedAt: row.updatedAt, expiresAt: row.expiresAt };
}

const ttlOf = (state: Pick<SharedLocationState, 'expiresAt'>, now: number): number =>
  Math.max(1, Math.ceil((Date.parse(state.expiresAt) - now) / 1000));

/**
 * Range le partage COMPLET, scellé, jusqu'à son terme, sous la clé de SA session : un geste en vol
 * ne peut écrire que dans le partage qu'il a lu, jamais dans celui qui l'a remplacé. Sans clé de
 * scellement dans un environnement servi, LÈVE : rien n'est rangé en clair.
 */
export async function storeSharedLocation(cache: SharedLocationCache, userId: string, state: SharedLocationState, now: number): Promise<void> {
  await cache.set(keyOf(userId, state.sessionId), sealSecret(JSON.stringify(state), contextOf(userId)), ttlOf(state, now));
}

const stopKeyOf = (userId: string): string => `shared-location-stop:${userId.toLowerCase()}`;
/** Le plus long partage : l'arrêt n'a pas à être retenu au-delà. */
const STOP_MEMORY_SECONDS = 480 * 60;

/**
 * La GÉNÉRATION du partage : la marque du dernier arrêt, unique par arrêt. Le pointeur de session
 * vit SOUS elle : un arrêt change de génération, et tout ce qu'un démarrage en vol écrit ensuite
 * sous l'ancienne n'est plus jamais lu — sans écriture conditionnelle, sans horloge.
 */
export async function sharedLocationGeneration(cache: SharedLocationCache, userId: string): Promise<string> {
  return (await cache.get(stopKeyOf(userId))) ?? GENESIS;
}

/** Rend `state` courant DANS la génération `generation` (lue avant l'écriture). */
export async function claimSharedLocation(cache: SharedLocationCache, userId: string, generation: string, state: SharedLocationState, now: number): Promise<void> {
  await cache.set(currentKeyOf(userId, generation), state.sessionId, ttlOf(state, now));
}

const sessionUnder = async (cache: SharedLocationCache, userId: string, generation: string): Promise<string | null> => {
  const current = await cache.get(currentKeyOf(userId, generation));
  return current !== null && SESSION_ID.test(current) ? current : null;
};

/** La session courante, ou `null` (aucune, arrêtée, illisible). */
export async function currentSharedLocationSession(cache: SharedLocationCache, userId: string): Promise<string | null> {
  return sessionUnder(cache, userId, await sharedLocationGeneration(cache, userId));
}

/** Le partage en cours, ou `null` (absent, arrêté, échu, illisible, scellé pour un autre compte). */
export async function readSharedLocation(cache: SharedLocationCache, userId: string, now: number): Promise<SharedLocationState | null> {
  const sessionId = await currentSharedLocationSession(cache, userId);
  if (sessionId === null) return null;
  const stored = await cache.get(keyOf(userId, sessionId));
  if (stored === null) return null;
  if (hasValidSecretsKey() && !isSealedSecret(stored)) return null;
  try {
    const state = parseState(openSecret(stored, contextOf(userId)));
    return state && state.sessionId === sessionId && Date.parse(state.expiresAt) > now ? state : null;
  } catch {
    return null;
  }
}

/**
 * Arrête : une génération NOUVELLE (`mark`, unique), puis l'effacement de ce que l'ancienne
 * portait — son pointeur et la session qu'il désigne, relue APRÈS le changement de génération
 * pour attraper aussi un démarrage qui s'y serait posé pendant l'arrêt.
 */
export async function markSharedLocationStopped(cache: SharedLocationCache, userId: string, stopped: { readonly mark: string; readonly generation: string; readonly sessionId: string | null }): Promise<void> {
  await cache.set(stopKeyOf(userId), stopped.mark, STOP_MEMORY_SECONDS);
  const late = await sessionUnder(cache, userId, stopped.generation);
  await cache.del(currentKeyOf(userId, stopped.generation));
  const sessions = new Set([stopped.sessionId, late].filter((id): id is string => id !== null));
  await Promise.all([...sessions].map((sessionId) => cache.del(keyOf(userId, sessionId))));
}

/** Efface le pointeur d'une génération MORTE (un arrêt l'a remplacée) : plus rien ne s'y lira jamais. */
export async function forgetSharedLocationGeneration(cache: SharedLocationCache, userId: string, generation: string): Promise<void> {
  if ((await sharedLocationGeneration(cache, userId)) !== generation) await cache.del(currentKeyOf(userId, generation));
}

/** Efface l'état d'une session qui n'est plus (ou ne sera jamais) courante. */
export async function dropSharedLocationSession(cache: SharedLocationCache, userId: string, sessionId: string): Promise<void> {
  await cache.del(keyOf(userId, sessionId));
}
