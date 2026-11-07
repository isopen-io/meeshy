/**
 * L'ÉTAT COURANT de l'écoute d'un compte (#13934, #16686) — COMPLET, scellé au repos.
 *
 * Décision du porteur (2026-11-07) : le serveur garde l'état entier (catégorie, titre,
 * origine) pour qu'une montée de lien fasse remonter le détail sans nouvel envoi, et il
 * tronque au service. Ce qui est rangé dans le cache partagé est donc SCELLÉ par
 * `secret-at-rest` (AES-256-GCM), lié au compte comme données authentifiées : une valeur
 * recopiée sous la clé d'un autre ne s'ouvre pas. Jamais de clair en cache ni en journal.
 *
 * Rien n'est gardé au-delà de l'état courant : une durée de vie courte
 * (`NOW_PLAYING_TTL_SECONDS`), effacée par `now-playing:clear`. Une valeur illisible ou
 * expirée vaut « rien ».
 */
import {
  NOW_PLAYING_CATEGORIES,
  NOW_PLAYING_TTL_SECONDS,
  type NowPlayingCategory,
} from '@meeshy/shared/types/now-playing-constants';
import type { CacheStore } from '../CacheStore';
import { openSecret, sealSecret } from '../../utils/secret-at-rest';

export type NowPlayingState = {
  readonly category: NowPlayingCategory;
  readonly title?: string;
  readonly source?: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
};

export type NowPlayingCache = Pick<CacheStore, 'get' | 'set' | 'del'>;

const keyOf = (userId: string): string => `now-playing:${userId.toLowerCase()}`;
const contextOf = (userId: string): string => `NowPlaying.state:${userId.toLowerCase()}`;

const isCategory = (value: unknown): value is NowPlayingCategory =>
  typeof value === 'string' && (NOW_PLAYING_CATEGORIES as readonly string[]).includes(value);

const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);

function parseState(raw: string): NowPlayingState | null {
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  if (!isCategory(row.category) || typeof row.updatedAt !== 'string' || typeof row.expiresAt !== 'string') return null;
  const title = optionalText(row.title);
  const source = optionalText(row.source);
  return {
    category: row.category,
    ...(title ? { title } : {}),
    ...(source ? { source } : {}),
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
  };
}

/** Range l'état COMPLET, scellé. Sans clé de scellement dans un environnement servi, LÈVE : rien n'est rangé en clair. */
export async function storeNowPlaying(cache: NowPlayingCache, userId: string, state: NowPlayingState): Promise<void> {
  await cache.set(keyOf(userId), sealSecret(JSON.stringify(state), contextOf(userId)), NOW_PLAYING_TTL_SECONDS);
}

/** L'état courant, ou `null` (absent, expiré, illisible, scellé pour un autre compte). */
export async function readNowPlaying(cache: NowPlayingCache, userId: string, now: number): Promise<NowPlayingState | null> {
  const stored = await cache.get(keyOf(userId));
  if (stored === null) return null;
  try {
    const state = parseState(openSecret(stored, contextOf(userId)));
    return state && Date.parse(state.expiresAt) > now ? state : null;
  } catch {
    return null;
  }
}

export async function clearNowPlaying(cache: NowPlayingCache, userId: string): Promise<void> {
  await cache.del(keyOf(userId));
}
