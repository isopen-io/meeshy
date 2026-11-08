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
import { openSecret, sealSecret } from '../../utils/secret-at-rest';

export type SharedLocationRecipient = { readonly userId: string; readonly precision: SharedLocationPrecision };

export type SharedLocationState = {
  readonly recipients: readonly SharedLocationRecipient[];
  readonly position: SharedLocationPosition;
  readonly updatedAt: string;
  readonly expiresAt: string;
};

export type SharedLocationCache = Pick<CacheStore, 'get' | 'set' | 'del'>;

const keyOf = (userId: string): string => `shared-location:${userId.toLowerCase()}`;
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
  if (!position || !Array.isArray(row.recipients) || typeof row.updatedAt !== 'string' || typeof row.expiresAt !== 'string') return null;
  const recipients = row.recipients.map(parseRecipient);
  if (recipients.some((recipient) => recipient === null)) return null;
  return { recipients: recipients as SharedLocationRecipient[], position, updatedAt: row.updatedAt, expiresAt: row.expiresAt };
}

/** Range le partage COMPLET, scellé, jusqu'à son terme. Sans clé de scellement dans un environnement servi, LÈVE : rien n'est rangé en clair. */
export async function storeSharedLocation(cache: SharedLocationCache, userId: string, state: SharedLocationState, now: number): Promise<void> {
  const ttlSeconds = Math.max(1, Math.ceil((Date.parse(state.expiresAt) - now) / 1000));
  await cache.set(keyOf(userId), sealSecret(JSON.stringify(state), contextOf(userId)), ttlSeconds);
}

/** Le partage en cours, ou `null` (absent, échu, illisible, scellé pour un autre compte). */
export async function readSharedLocation(cache: SharedLocationCache, userId: string, now: number): Promise<SharedLocationState | null> {
  const stored = await cache.get(keyOf(userId));
  if (stored === null) return null;
  try {
    const state = parseState(openSecret(stored, contextOf(userId)));
    return state && Date.parse(state.expiresAt) > now ? state : null;
  } catch {
    return null;
  }
}

export async function clearSharedLocation(cache: SharedLocationCache, userId: string): Promise<void> {
  await cache.del(keyOf(userId));
}
