import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { incrementPostCounters } from './postCounters';
import { readServableToAnonymous, type AnonymousPostBatchPrisma } from '../../routes/posts/anonymousPostGate';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { errorIdentity } from '../../utils/error-identity';
import { isExitOfCountedOpen, noteCountedOpen, sharedViewOpenLedger, type ViewOpenLedger } from './viewOpenLedger';
import { viewBreakdowns, viewProvenanceRow, type ViewContext } from './viewProvenance';
import { creditOpens } from './contentOpens';

/**
 * La PORTÉE ANONYME d'un post (#10483) — ce qu'un lecteur sans compte (invité
 * d'un lien, visiteur web, visiteur iOS d'un lien universel) fait compter.
 *
 * Un anonyme n'a pas de `userId` : il est désigné par sa CLÉ DE LECTEUR
 * (`readerKeyOf`, HMAC hex 64), jamais par la valeur de X-Session-Token.
 *
 * Règle du porteur (2026-10-13) — chaque affichage compte :
 *
 * - **Vue** : CHAQUE vue fait, en une écriture, `viewCount +1`,
 *   `anonymousViewCount +1` et `postOpenCount +1`. La PREMIÈRE vue d'un
 *   lecteur crée sa ligne `AnonymousPostOpen(postId, readerKey)` (unique,
 *   90 jours, index TTL) et monte en plus `uniqueViewCount` et
 *   `anonymousUniqueViewCount`. Une vue répétée monte la durée la plus longue.
 *   La SORTIE d'une ouverture déjà comptée (vue avec durée qui suit une vue
 *   sans durée de la même clé, `viewOpenLedger.ts`) ne porte que la durée.
 *   Aucune ligne `PostView`, aucun « vu par ».
 * - **Impression** : des compteurs seulement (`impressionCount +1`,
 *   `anonymousImpressionCount +1`) à CHAQUE listage — aucun dédoublonnage
 *   temporel. Aucune ligne `PostImpression`.
 *
 * La racine d'un repost est créditée par les mêmes règles, sous la même garde
 * (`readServableToAnonymous`) : on ne compte jamais ce qu'un anonyme ne peut
 * pas lire.
 */

const log = enhancedLogger.child({ module: 'anonymousReach' });

export const ANONYMOUS_VIEW_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DUREE_MAX_MS = 300_000;

type ReachPrisma = PrismaClient;

/** Les ids servables d'un lot → la racine de leur repost (`null` pour un original). */
export type ServableMap = ReadonlyMap<string, string | null>;

export type AnonymousViewInput = { readonly postId: string; readonly durationMs?: number } & ViewContext;

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'P2002';

const boundedDuration = (durationMs: number | undefined): number | undefined =>
  durationMs === undefined ? undefined : Math.max(0, Math.min(DUREE_MAX_MS, Math.round(durationMs)));

/**
 * Compte UNE vue d'un lecteur sur un post. `true` quand c'est sa PREMIÈRE
 * (création de la ligne) — elle seule monte les compteurs de vues uniques.
 */
async function creditView(
  prisma: ReachPrisma,
  params: {
    readonly postId: string; readonly readerKey: string; readonly durationMs?: number; readonly now: Date;
    readonly ledger: ViewOpenLedger; readonly context: ViewContext;
  },
): Promise<boolean> {
  const view = { postId: params.postId, readerId: params.readerKey, durationMs: params.durationMs };
  const first = await openOnce(prisma, params);
  if (!first && (await isExitOfCountedOpen(params.ledger, view))) return false;
  await incrementPostCounters(prisma, [params.postId], {
    viewCount: { increment: 1 },
    anonymousViewCount: { increment: 1 },
    postOpenCount: { increment: 1 },
    ...(first ? { uniqueViewCount: { increment: 1 }, anonymousUniqueViewCount: { increment: 1 } } : {}),
    breakdowns: viewBreakdowns(params.context),
  });
  await noteCountedOpen(params.ledger, view);
  return first;
}

/** Ouvre la ligne d'un lecteur sur un post, ou y promeut la durée. `true` au premier insert. */
async function openOnce(
  prisma: ReachPrisma,
  params: {
    readonly postId: string; readonly readerKey: string; readonly durationMs?: number; readonly now: Date;
    readonly context: ViewContext;
  },
): Promise<boolean> {
  const { postId, readerKey, durationMs, now } = params;
  try {
    await prisma.anonymousPostOpen.create({
      data: {
        postId,
        sessionKey: readerKey,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...viewProvenanceRow(params.context),
        expiresAt: new Date(now.getTime() + ANONYMOUS_VIEW_TTL_MS),
      },
    });
    return true;
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
 * `readServableToAnonymous`) — chaque occurrence compte. Rend le nombre de
 * vues comptées sur les posts affichés ; le crédit de la racine n'y entre
 * jamais.
 */
export async function creditAnonymousViews(
  prisma: ReachPrisma,
  params: {
    readonly readerKey: string;
    readonly views: readonly AnonymousViewInput[];
    readonly servable: ServableMap;
    readonly now?: Date;
    readonly ledger?: ViewOpenLedger;
  },
): Promise<number> {
  const now = params.now ?? new Date();
  const ledger = params.ledger ?? sharedViewOpenLedger;
  const views = params.views.filter((view) => params.servable.has(view.postId));
  if (views.length === 0) return 0;

  const roots = await servableRoots(prisma, params.servable, now);
  let counted = 0;

  for (const view of views) {
    const durationMs = boundedDuration(view.durationMs);
    const context: ViewContext = { surface: view.surface, provenance: view.provenance, origin: view.origin };
    try {
      await creditView(prisma, { postId: view.postId, readerKey: params.readerKey, durationMs, now, ledger, context });
      counted += 1;
      const root = params.servable.get(view.postId) ?? null;
      if (root !== null && roots.has(root)) {
        await creditView(prisma, { postId: root, readerKey: params.readerKey, durationMs, now, ledger, context });
      }
    } catch (error) {
      log.warn('anonymous view not recorded', {
        postId: view.postId,
        error: errorIdentity(error),
      });
    }
  }
  return counted;
}

/** La vue anonyme d'UN post, garde comprise. `true` quand elle a été comptée. */
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
    return counted > 0;
  } catch (error) {
    log.warn('recordAnonymousView failed', {
      postId: params.postId,
      error: errorIdentity(error),
    });
    return false;
  }
}

const countById = (ids: readonly string[]): ReadonlyMap<string, number> =>
  ids.reduce<Map<string, number>>((acc, id) => acc.set(id, (acc.get(id) ?? 0) + 1), new Map());

const byIncrement = (counts: ReadonlyMap<string, number>): readonly (readonly [number, string[]])[] =>
  [...[...counts].reduce<Map<number, string[]>>(
    (acc, [id, n]) => acc.set(n, [...(acc.get(n) ?? []), id]),
    new Map(),
  )];

/**
 * Crédite les impressions d'un lecteur sur des posts DÉJÀ gardés — chaque
 * occurrence compte, sans fenêtre (règle du porteur 2026-10-13) ; la racine
 * d'un repost reçoit la même impression (`liveOnly`). Rend le nombre
 * d'impressions comptées.
 */
export async function creditAnonymousImpressions(
  prisma: ReachPrisma,
  params: {
    readonly postIds: readonly string[];
    readonly servable: ServableMap;
    readonly now?: Date;
  },
): Promise<number> {
  const now = params.now ?? new Date();
  const listed = params.postIds.filter((id) => params.servable.has(id));
  if (listed.length === 0) return 0;

  const roots = await servableRoots(prisma, params.servable, now);
  const rootCredits = countById(listed
    .map((postId) => params.servable.get(postId) ?? null)
    .filter((root): root is string => root !== null && roots.has(root)));

  const anonymousImpression = (increment: number) =>
    ({ impressionCount: { increment }, anonymousImpressionCount: { increment } });

  await Promise.all([
    ...byIncrement(countById(listed)).map(([increment, ids]) =>
      incrementPostCounters(prisma, ids, anonymousImpression(increment))),
    ...byIncrement(rootCredits).map(([increment, ids]) =>
      incrementPostCounters(prisma, ids, anonymousImpression(increment), { liveOnly: true })),
  ]);
  return listed.length;
}

/**
 * Les ENGAGEMENTS D'OUVERTURE d'un lecteur sans compte (#10483) — le tap sur un
 * contenu d'un listing, sur des posts DÉJÀ gardés. Aucune vue, aucune ligne :
 * `openCountByOrigin.<origine>` +1 par occurrence. Rend le nombre compté.
 */
export async function creditAnonymousOpens(
  prisma: ReachPrisma,
  params: { readonly opens: readonly { readonly postId: string; readonly origin?: string }[]; readonly servable: ServableMap },
): Promise<number> {
  const opens = params.opens.filter((open) => params.servable.has(open.postId));
  await creditOpens(prisma, opens);
  return opens.length;
}
