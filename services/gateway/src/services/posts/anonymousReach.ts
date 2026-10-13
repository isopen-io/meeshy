import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { incrementPostCounters } from './postCounters';
import { readServableToAnonymous, type AnonymousPostBatchPrisma } from '../../routes/posts/anonymousPostGate';
import { enhancedLogger } from '../../utils/logger-enhanced';

/**
 * La PORTÉE ANONYME d'un post (#10483) — ce qu'un lecteur sans compte (invité
 * d'un lien, visiteur web, visiteur iOS d'un lien universel) fait compter.
 *
 * Un anonyme n'a pas de `userId` : il est désigné par sa CLÉ DE LECTEUR
 * (`readerKeyOf`, HMAC hex 64), jamais par la valeur de X-Session-Token.
 *
 * - **Vue** : une ligne `AnonymousPostOpen(postId, readerKey)` par lecteur,
 *   unique, qui vit 90 jours (`expiresAt`, index TTL). Au PREMIER insert, UNE
 *   écriture fait `viewCount +1`, `anonymousViewCount +1` et `postOpenCount
 *   +1` (gardé pour ses anciens lecteurs). Une vue répétée ne fait que monter
 *   la durée la plus longue. Aucune ligne `PostView`, aucun « vu par ».
 * - **Impression** : des compteurs seulement (`impressionCount +1`,
 *   `anonymousImpressionCount +1`), dédoublonnés par `(readerKey, postId)`
 *   sur 30 minutes. Aucune ligne `PostImpression`.
 *
 * La racine d'un repost est créditée par les mêmes règles, sous la même garde
 * (`readServableToAnonymous`) : on ne compte jamais ce qu'un anonyme ne peut
 * pas lire.
 */

const log = enhancedLogger.child({ module: 'anonymousReach' });

export const ANONYMOUS_VIEW_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const ANONYMOUS_IMPRESSION_WINDOW_SECONDS = 30 * 60;
const DUREE_MAX_MS = 300_000;

type ReachPrisma = PrismaClient;

/** Les ids servables d'un lot → la racine de leur repost (`null` pour un original). */
export type ServableMap = ReadonlyMap<string, string | null>;

export type AnonymousViewInput = { readonly postId: string; readonly durationMs?: number };

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002';

const boundedDuration = (durationMs: number | undefined): number | undefined =>
  durationMs === undefined ? undefined : Math.max(0, Math.min(DUREE_MAX_MS, Math.round(durationMs)));

/**
 * Ouvre (ou retrouve) la ligne d'un lecteur sur un post. `true` au premier
 * insert seulement — c'est lui, et lui seul, qui crédite les compteurs.
 */
async function openOnce(
  prisma: ReachPrisma,
  params: { readonly postId: string; readonly readerKey: string; readonly durationMs?: number; readonly now: Date },
): Promise<boolean> {
  const { postId, readerKey, durationMs, now } = params;
  try {
    await prisma.anonymousPostOpen.create({
      data: {
        postId,
        sessionKey: readerKey,
        ...(durationMs !== undefined ? { durationMs } : {}),
        expiresAt: new Date(now.getTime() + ANONYMOUS_VIEW_TTL_MS),
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    if (durationMs !== undefined) {
      await prisma.anonymousPostOpen.updateMany({
        where: {
          postId,
          sessionKey: readerKey,
          OR: [{ durationMs: { isSet: false } }, { durationMs: null }, { durationMs: { lt: durationMs } }],
        },
        data: { durationMs },
      });
    }
    return false;
  }
  await incrementPostCounters(prisma, [postId], {
    viewCount: { increment: 1 },
    anonymousViewCount: { increment: 1 },
    postOpenCount: { increment: 1 },
  });
  return true;
}

/** Les racines servables parmi celles du lot — une seule lecture pour les absentes de la carte. */
async function servableRoots(prisma: ReachPrisma, servable: ServableMap, now: Date): Promise<ReadonlySet<string>> {
  const roots = [...new Set([...servable.values()].filter((root): root is string => root !== null))];
  const unread = roots.filter((root) => !servable.has(root));
  const read = await readServableToAnonymous(prisma as unknown as AnonymousPostBatchPrisma, unread, now);
  return new Set(roots.filter((root) => servable.has(root) || read.has(root)));
}

/**
 * Crédite les vues d'un lecteur sur des posts DÉJÀ gardés (`servable` vient de
 * `readServableToAnonymous`). Rend les posts affichés dont c'est la première
 * vue — le crédit de la racine n'y entre jamais.
 */
export async function creditAnonymousViews(
  prisma: ReachPrisma,
  params: {
    readonly readerKey: string;
    readonly views: readonly AnonymousViewInput[];
    readonly servable: ServableMap;
    readonly now?: Date;
  },
): Promise<ReadonlySet<string>> {
  const now = params.now ?? new Date();
  const views = params.views.filter((view) => params.servable.has(view.postId));
  if (views.length === 0) return new Set();

  const roots = await servableRoots(prisma, params.servable, now);
  const counted = new Set<string>();

  for (const view of views) {
    const durationMs = boundedDuration(view.durationMs);
    try {
      if (await openOnce(prisma, { postId: view.postId, readerKey: params.readerKey, durationMs, now })) {
        counted.add(view.postId);
      }
      const root = params.servable.get(view.postId) ?? null;
      if (root !== null && roots.has(root)) {
        await openOnce(prisma, { postId: root, readerKey: params.readerKey, durationMs, now });
      }
    } catch (error) {
      log.warn('anonymous view not recorded', {
        postId: view.postId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return counted;
}

/** La vue anonyme d'UN post, garde comprise. `true` à la première vue du lecteur. */
export async function recordAnonymousView(
  prisma: ReachPrisma,
  params: { readonly postId: string; readonly readerKey: string; readonly durationMs?: number; readonly now?: Date },
): Promise<boolean> {
  const now = params.now ?? new Date();
  try {
    const servable = await readServableToAnonymous(prisma as unknown as AnonymousPostBatchPrisma, [params.postId], now);
    const counted = await creditAnonymousViews(prisma, {
      readerKey: params.readerKey,
      views: [{ postId: params.postId, durationMs: params.durationMs }],
      servable,
      now,
    });
    return counted.has(params.postId);
  } catch (error) {
    log.warn('recordAnonymousView failed', {
      postId: params.postId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Le dédoublonnage d'une impression anonyme : `claim` rend `true` la première
 * fois qu'une clé est vue dans la fenêtre, `false` ensuite.
 */
export type ImpressionDedup = {
  claim(key: string, ttlSeconds: number): Promise<boolean>;
};

type SetNxRedis = {
  set(key: string, value: string, mode: 'EX', ttl: number, flag: 'NX'): Promise<unknown>;
};

const MEMORY_DEDUP_MAX_ENTRIES = 50_000;

/**
 * Redis `SET NX EX` d'abord ; sans Redis (ou Redis en panne), une mémoire
 * BORNÉE dont la plus ancienne entrée part la première. Le repli ne refuse
 * jamais : au pire, un même lecteur est compté une fois par processus.
 */
export function createImpressionDedup(
  redis: () => SetNxRedis | null | undefined,
  options: { readonly maxEntries?: number; readonly now?: () => number } = {},
): ImpressionDedup {
  const maxEntries = options.maxEntries ?? MEMORY_DEDUP_MAX_ENTRIES;
  const clock = options.now ?? Date.now;
  const memory = new Map<string, number>();

  const claimInMemory = (key: string, ttlSeconds: number): boolean => {
    const now = clock();
    const expiresAt = memory.get(key);
    if (expiresAt !== undefined && expiresAt > now) return false;
    memory.delete(key);
    memory.set(key, now + ttlSeconds * 1000);
    if (memory.size > maxEntries) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
    return true;
  };

  return {
    async claim(key, ttlSeconds) {
      const client = redis();
      if (client) {
        try {
          return (await client.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
        } catch (error) {
          log.warn('impression dedup: Redis unavailable, memory fallback', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return claimInMemory(key, ttlSeconds);
    },
  };
}

export const anonymousImpressionKey = (readerKey: string, postId: string): string =>
  `reach:imp:${readerKey}:${postId}`;

const countById = (ids: readonly string[]): ReadonlyMap<string, number> =>
  ids.reduce<Map<string, number>>((acc, id) => acc.set(id, (acc.get(id) ?? 0) + 1), new Map());

const byIncrement = (counts: ReadonlyMap<string, number>): readonly (readonly [number, string[]])[] =>
  [...[...counts].reduce<Map<number, string[]>>(
    (acc, [id, n]) => acc.set(n, [...(acc.get(n) ?? []), id]),
    new Map(),
  )];

/**
 * Crédite les impressions d'un lecteur sur des posts DÉJÀ gardés. Une
 * impression par `(readerKey, postId)` et par fenêtre de 30 minutes ; la
 * racine d'un repost reçoit la même impression (`liveOnly`). Rend le nombre
 * d'impressions comptées.
 */
export async function creditAnonymousImpressions(
  prisma: ReachPrisma,
  dedup: ImpressionDedup,
  params: {
    readonly readerKey: string;
    readonly postIds: readonly string[];
    readonly servable: ServableMap;
    readonly now?: Date;
  },
): Promise<number> {
  const now = params.now ?? new Date();
  const candidates = [...new Set(params.postIds)].filter((id) => params.servable.has(id));
  if (candidates.length === 0) return 0;

  const claims = await Promise.all(candidates.map(async (postId) =>
    [postId, await dedup.claim(anonymousImpressionKey(params.readerKey, postId), ANONYMOUS_IMPRESSION_WINDOW_SECONDS)] as const));
  const claimed = claims.filter(([, fresh]) => fresh).map(([postId]) => postId);
  if (claimed.length === 0) return 0;

  const roots = await servableRoots(prisma, params.servable, now);
  const rootCredits = countById(claimed
    .map((postId) => params.servable.get(postId) ?? null)
    .filter((root): root is string => root !== null && roots.has(root)));

  const anonymousImpression = (increment: number) =>
    ({ impressionCount: { increment }, anonymousImpressionCount: { increment } });

  await Promise.all([
    incrementPostCounters(prisma, claimed, anonymousImpression(1)),
    ...byIncrement(rootCredits).map(([increment, ids]) =>
      incrementPostCounters(prisma, ids, anonymousImpression(increment), { liveOnly: true })),
  ]);
  return claimed.length;
}
