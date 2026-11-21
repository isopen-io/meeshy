/**
 * LES FINS DE PARTAGE D'UN ÉMETTEUR (#19202) — « Partage terminé il y a 1 h ».
 *
 * Le partage en cours ne survit pas à son terme (`sharedLocationStore.ts`) : rien ne disait au
 * lecteur qu'un partage qui le visait venait de finir. L'émetteur garde donc, UNE clé par compte,
 * l'échéance de chaque personne qu'un partage a SERVIE : le terme ou son échéance propre, ramenée
 * à l'instant de l'arrêt ou du remplacement qui l'a retirée. Une fin passée reste lisible un jour
 * (`SHARED_LOCATION_ENDED_WINDOW_HOURS`), puis sort de la liste et la clé expire.
 *
 * Jamais de position : qui, jusqu'à quand, à quelle précision (pour arrondir l'heure d'un lecteur
 * flouté). La valeur est SCELLÉE, liée au compte : aucun destinataire en clair dans le cache. Une
 * valeur illisible vaut « aucune fin ». La purge du compte efface la clé.
 */
import { SHARED_LOCATION_ENDED_WINDOW_HOURS, SHARED_LOCATION_PRECISIONS, type SharedLocationPrecision } from '@meeshy/shared/types/shared-location';
import { hasValidSecretsKey, isSealedSecret, openSecret, sealSecret } from '../../utils/secret-at-rest';
import type { SharedLocationKv } from './sharedLocationKv';

export type SharedLocationEnd = { readonly userId: string; readonly endsAt: string; readonly precision: SharedLocationPrecision };

const WINDOW_MS = SHARED_LOCATION_ENDED_WINDOW_HOURS * 3_600_000;

const endsKeyOf = (userId: string): string => `shared-location-ends:{${userId.toLowerCase()}}`;
const contextOf = (userId: string): string => `SharedLocation.ends:${userId.toLowerCase()}`;

const isPrecision = (value: unknown): value is SharedLocationPrecision =>
  typeof value === 'string' && (SHARED_LOCATION_PRECISIONS as readonly string[]).includes(value);

function parseEnd(value: unknown): SharedLocationEnd | null {
  if (typeof value !== 'object' || value === null) return null;
  const { userId, endsAt, precision } = value as Record<string, unknown>;
  if (typeof userId !== 'string' || typeof endsAt !== 'string' || !Number.isFinite(Date.parse(endsAt)) || !isPrecision(precision)) return null;
  return { userId, endsAt, precision };
}

function openEnds(emitterId: string, stored: string | null): readonly SharedLocationEnd[] {
  if (stored === null || (hasValidSecretsKey() && !isSealedSecret(stored))) return [];
  try {
    const parsed: unknown = JSON.parse(openSecret(stored, contextOf(emitterId)));
    const list = Array.isArray((parsed as { ends?: unknown } | null)?.ends) ? (parsed as { ends: unknown[] }).ends : [];
    return list.flatMap((entry) => parseEnd(entry) ?? []);
  } catch {
    return [];
  }
}

/** Les fins encore dans la fenêtre d'un jour (futures comprises : un partage en cours). */
const keptAt = (ends: readonly SharedLocationEnd[], now: number): readonly SharedLocationEnd[] =>
  ends.filter((end) => Date.parse(end.endsAt) > now - WINDOW_MS);

async function rewrite(cache: SharedLocationKv, emitterId: string, next: (previous: readonly SharedLocationEnd[]) => readonly SharedLocationEnd[], now: number): Promise<void> {
  const ends = keptAt(next(openEnds(emitterId, await cache.get(endsKeyOf(emitterId)))), now);
  if (ends.length === 0) {
    await cache.del(endsKeyOf(emitterId));
    return;
  }
  const last = Math.max(...ends.map((end) => Date.parse(end.endsAt)));
  const ttlSeconds = Math.max(1, Math.ceil((last + WINDOW_MS - now) / 1000));
  await cache.set(endsKeyOf(emitterId), sealSecret(JSON.stringify({ ends }), contextOf(emitterId)), ttlSeconds);
}

const sameUser = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const endedAt = (end: SharedLocationEnd, now: number): SharedLocationEnd =>
  Date.parse(end.endsAt) > now ? { ...end, endsAt: new Date(now).toISOString() } : end;

/**
 * Un partage DEVIENT courant et sert `served` : chacun prend son échéance ; toute autre fin encore
 * à venir (un partage remplacé) se termine maintenant.
 */
export async function noteSharedLocationServed(cache: SharedLocationKv, emitterId: string, served: readonly SharedLocationEnd[], now: number): Promise<void> {
  await rewrite(cache, emitterId, (previous) => [
    ...previous.filter((end) => !served.some((entry) => sameUser(entry.userId, end.userId))).map((end) => endedAt(end, now)),
    ...served,
  ], now);
}

/**
 * Le partage COURANT se met à servir un lecteur de plus (une relation montée pendant le partage) :
 * lui seul prend son échéance, les autres fins ne bougent pas.
 */
export async function noteSharedLocationReaderServed(cache: SharedLocationKv, emitterId: string, end: SharedLocationEnd, now: number): Promise<void> {
  await noteSharedLocationReadersServed(cache, emitterId, [end], now);
}

/** Plusieurs lecteurs de plus, en UNE réécriture : eux seuls prennent leur échéance. */
export async function noteSharedLocationReadersServed(cache: SharedLocationKv, emitterId: string, ends: readonly SharedLocationEnd[], now: number): Promise<void> {
  await rewrite(cache, emitterId, (previous) => [...previous.filter((entry) => !ends.some((end) => sameUser(entry.userId, end.userId))), ...ends], now);
}

/** Le partage s'arrête : toute fin encore à venir se termine maintenant. */
export async function noteSharedLocationStopped(cache: SharedLocationKv, emitterId: string, now: number): Promise<void> {
  await rewrite(cache, emitterId, (previous) => previous.map((end) => endedAt(end, now)), now);
}

/** La fin, déjà passée et de moins d'un jour, du dernier partage de chaque émetteur qui servait `readerId`, en UNE lecture groupée. */
export async function sharedLocationEndsFor(cache: SharedLocationKv, readerId: string, emitterIds: readonly string[], now: number): Promise<ReadonlyMap<string, SharedLocationEnd>> {
  if (emitterIds.length === 0) return new Map();
  const stored = await cache.mget(emitterIds.map(endsKeyOf));
  return new Map(emitterIds.flatMap((emitterId, index) => {
    const end = openEnds(emitterId, stored[index] ?? null).find((entry) => sameUser(entry.userId, readerId));
    const at = end ? Date.parse(end.endsAt) : Number.NaN;
    return end && at <= now && at > now - WINDOW_MS ? [[emitterId, end] as const] : [];
  }));
}

/** La purge du compte : ses fins partent avec lui. */
export async function forgetSharedLocationEnds(cache: SharedLocationKv, emitterId: string): Promise<void> {
  await cache.del(endsKeyOf(emitterId));
}

/** L'export RGPD de l'émetteur : à qui ses partages récents ont servi sa position, jusqu'à quand, à quelle précision. */
export async function exportSharedLocationEnds(cache: SharedLocationKv, emitterId: string, now: number): Promise<readonly SharedLocationEnd[]> {
  return keptAt(openEnds(emitterId, await cache.get(endsKeyOf(emitterId))), now);
}
