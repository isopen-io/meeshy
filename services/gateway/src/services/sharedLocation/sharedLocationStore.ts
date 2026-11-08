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
import { createHmac } from 'node:crypto';
import type { SharedLocationKv } from './sharedLocationKv';
import { readerKeySecret } from '../posts/readerKey';
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

export type SharedLocationCache = SharedLocationKv;

const tagOf = (userId: string): string => `{${userId.toLowerCase()}}`;
const keyOf = (userId: string, sessionId: string): string => `shared-location:${tagOf(userId)}:${sessionId}`;
const pointerKeyOf = (userId: string): string => `shared-location-current:${tagOf(userId)}`;
/** Sans durée de vie : une génération ne revient jamais en arrière (une par compte). */
const generationKeyOf = (userId: string): string => `shared-location-gen:${tagOf(userId)}`;
const retiringKeyOf = (userId: string): string => `shared-location-retiring:${tagOf(userId)}`;
const seenKeyOf = (userId: string, sessionId: string): string => `shared-location-seen:${tagOf(userId)}:${sessionId}`;
const pointerKeys = (userId: string) => ({ generation: generationKeyOf(userId), pointer: pointerKeyOf(userId), retiring: retiringKeyOf(userId) });

/**
 * L'empreinte d'un lecteur dans l'ensemble des servis d'UNE session : HMAC à clé secrète,
 * salée par la session — aucun identifiant en clair, et deux sessions ne se relient pas.
 */
const seenMemberOf = (sessionId: string, readerId: string): string =>
  createHmac('sha256', readerKeySecret()).update(`shared-location-seen:${sessionId}:${readerId.toLowerCase()}`).digest('hex');
const SESSION_ID = /^[0-9a-f-]{36}$/;
const validSession = (value: string | null): string | null => (value !== null && SESSION_ID.test(value) ? value : null);
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

const sealed = (userId: string, state: SharedLocationState): string => sealSecret(JSON.stringify(state), contextOf(userId));

/** La génération courante : un arrêt l'avance, et un démarrage ne prend le pointeur que dans celle qu'il a lue. */
export async function sharedLocationGeneration(cache: SharedLocationCache, userId: string): Promise<string> {
  return (await cache.get(generationKeyOf(userId))) ?? '0';
}

/**
 * Range le partage COMPLET, scellé, jusqu'à son terme, sous la clé de SA session, AVANT de le
 * rendre courant. Sans clé de scellement dans un environnement servi, LÈVE : rien n'est rangé en clair.
 */
export async function storeSharedLocation(cache: SharedLocationCache, userId: string, state: SharedLocationState, now: number): Promise<void> {
  await cache.set(keyOf(userId, state.sessionId), sealed(userId, state), ttlOf(state, now));
}

/** Rend `state` courant si la génération est encore `generation` ; rend la session REMPLACÉE (atomique). */
export async function claimSharedLocation(
  cache: SharedLocationCache,
  userId: string,
  generation: string,
  state: SharedLocationState,
  now: number,
): Promise<{ readonly claimed: boolean; readonly displaced: string | null }> {
  const result = await cache.claim(
    pointerKeys(userId),
    { generation, session: state.sessionId, ttlSeconds: ttlOf(state, now) },
  );
  return { claimed: result.claimed, displaced: validSession(result.displaced) };
}

/** Une nouvelle position, écrite SEULEMENT si sa session est encore courante (atomique). */
export async function storeSharedLocationIfCurrent(cache: SharedLocationCache, userId: string, state: SharedLocationState, now: number): Promise<boolean> {
  return cache.setIfCurrent(
    { pointer: pointerKeyOf(userId), state: keyOf(userId, state.sessionId) },
    { session: state.sessionId, value: sealed(userId, state), ttlSeconds: ttlOf(state, now) },
  );
}

/** Arrête : la génération avance, le pointeur part, et la session qu'il désignait est rendue (atomique). */
export async function advanceSharedLocationGeneration(cache: SharedLocationCache, userId: string): Promise<string | null> {
  return validSession(await cache.advance(pointerKeys(userId)));
}

/** Les sessions remplacées ou arrêtées dont le retrait n'est pas encore fait. */
export async function retiringSharedLocationSessions(cache: SharedLocationCache, userId: string): Promise<readonly string[]> {
  return (await cache.retiring(retiringKeyOf(userId))).filter((session) => validSession(session) !== null);
}

/** Efface une session retirée : son état, ses servis, et sa place dans l'ensemble « à retirer » (en dernier). */
export async function forgetRetiredSharedLocationSession(cache: SharedLocationCache, userId: string, sessionId: string): Promise<void> {
  await cache.del(keyOf(userId, sessionId));
  await cache.del(seenKeyOf(userId, sessionId));
  await cache.retired(retiringKeyOf(userId), sessionId);
}

/** Note, AVANT de les servir, ceux qu'une session sert ; l'ensemble vit jusqu'au terme du partage. */
export async function markSharedLocationSeen(cache: SharedLocationCache, userId: string, state: SharedLocationState, readerIds: readonly string[], now: number): Promise<void> {
  await cache.markSeen(seenKeyOf(userId, state.sessionId), readerIds.map((id) => seenMemberOf(state.sessionId, id)), ttlOf(state, now));
}

/** Parmi `readerIds`, ceux que la session `sessionId` a servis (et à qui la fin n'est pas encore partie). */
export async function sharedLocationSeenAmong(cache: SharedLocationCache, userId: string, sessionId: string, readerIds: readonly string[]): Promise<readonly string[]> {
  const flags = await cache.seenAmong(seenKeyOf(userId, sessionId), readerIds.map((id) => seenMemberOf(sessionId, id)));
  return readerIds.filter((_, index) => flags[index] === true);
}

/** Ceux à qui la fin vient de partir ne sont plus des servis de la session. */
export async function unmarkSharedLocationSeen(cache: SharedLocationCache, userId: string, sessionId: string, readerIds: readonly string[]): Promise<void> {
  await cache.unmarkSeen(seenKeyOf(userId, sessionId), readerIds.map((id) => seenMemberOf(sessionId, id)));
}

/** La session courante, ou `null`. */
export async function currentSharedLocationSession(cache: SharedLocationCache, userId: string): Promise<string | null> {
  return validSession(await cache.get(pointerKeyOf(userId)));
}

/** L'état rangé de la session `sessionId`, courante ou non, ou `null` (absent, échu, illisible, scellé pour un autre compte). */
export async function readSharedLocationSession(cache: SharedLocationCache, userId: string, sessionId: string, now: number): Promise<SharedLocationState | null> {
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

/** Le partage en cours, ou `null` (absent, arrêté, échu, illisible, scellé pour un autre compte). */
export async function readSharedLocation(cache: SharedLocationCache, userId: string, now: number): Promise<SharedLocationState | null> {
  const sessionId = await currentSharedLocationSession(cache, userId);
  return sessionId === null ? null : readSharedLocationSession(cache, userId, sessionId, now);
}

/** Efface l'état d'une session qui ne sera jamais courante (un démarrage perdu). */
export async function dropSharedLocationSession(cache: SharedLocationCache, userId: string, sessionId: string): Promise<void> {
  await cache.del(keyOf(userId, sessionId));
}
