import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { POST_ENGAGEMENT_RETENTION_MS } from '../social/contentEvents';
import { NOT_DELETED } from './postIncludes';
import { creditPostView } from './postViewCredit';
import type { ViewContext } from './viewProvenance';
import { incrementPostCounters } from './postCounters';
import { engagementIncrementsAdded, mergeEngagementSessions, type MergeableEngagement } from './engagementIncrements';
import { consumeReferenceView, resolveReferenceAccess } from './referenceAccess';
import { creditStoryViewed } from './postEngagementCredits';
import { impressionImpliedByView } from '../social/viewImpressions';
import { enhancedLogger } from '../../utils/logger-enhanced';

/**
 * La PORTÉE d'un post — ce qui compte qu'un contenu a été vu (#10483).
 *
 * Extrait de `PostService` (2453 lignes, au-dessus du budget de 1200) avant
 * d'y ajouter la vue anonyme : `PostService.recordView` et
 * `recordEngagementBatch` DÉLÈGUENT ici, à comportement identique. La vue
 * anonyme vit à côté, dans `anonymousReach.ts`.
 */

const log = enhancedLogger.child({ module: 'PostService' });

export type PostReachDeps = {
  readonly prisma: PrismaClient;
  /**
   * Le filtre d'audience du lecteur. Injecté plutôt qu'importé : quatre suites
   * court-circuitent `PostService.buildVisibilityFilter` par affectation, et
   * `PostService` passe une fermeture qui le relit à chaque appel.
   */
  readonly visibilityFilter: (viewerUserId?: string) => Promise<Prisma.PostWhereInput>;
};

/** Ce que la fusion relit de la ligne déjà stockée (#10764). */
const STORED_ENGAGEMENT_SELECT = {
  id: true, surface: true, contentType: true, dwellMs: true, watchMs: true,
  mediaDurationMs: true, completed: true, actions: true, watchSamples: true, createdAt: true,
} as const;

/**
 * La fenêtre dans laquelle une AUTRE session du même lecteur sur le même post
 * rend une session muette (revue de sécurité #10764). La clé de session vient
 * du client : sans cette borne, en changer à chaque envoi ferait monter
 * ouverture, lecture et vue qualifiée autant de fois qu'on le voudrait.
 */
export const ENGAGEMENT_SESSION_DEDUP_WINDOW_MS = 10_000;

/**
 * Une session compte-t-elle ? Jamais pour l'auteur ; et pas si une autre session
 * du même lecteur sur le même post a été REÇUE (heure serveur) dans la fenêtre
 * qui précède la sienne. La réponse est stable d'une réception à l'autre : elle
 * ne dépend que de l'heure de création de la ligne et de ce qui l'a précédée.
 */
async function engagementSessionCounts(
  prisma: PrismaClient,
  params: { readonly sessionId: string; readonly postId: string; readonly userId: string; readonly authorId: string; readonly receivedAt: Date },
): Promise<boolean> {
  if (params.authorId === params.userId) return false;
  const sibling = await prisma.postEngagement.findFirst({
    where: {
      userId: params.userId,
      postId: params.postId,
      sessionId: { not: params.sessionId },
      createdAt: {
        gte: new Date(params.receivedAt.getTime() - ENGAGEMENT_SESSION_DEDUP_WINDOW_MS),
        lt: params.receivedAt,
      },
    },
    select: { id: true },
  });
  return !sibling;
}

type StoredEngagementRow = {
  readonly surface?: string | null;
  readonly contentType?: string | null;
  readonly dwellMs?: number | null;
  readonly watchMs?: number | null;
  readonly mediaDurationMs?: number | null;
  readonly completed?: boolean | null;
  readonly actions?: unknown;
  readonly watchSamples?: unknown;
};

const storedEngagementOf = (
  row: StoredEngagementRow,
  received: { readonly surface: string; readonly contentType: string },
): MergeableEngagement & { readonly surface: string; readonly contentType: string } => ({
  surface: row.surface ?? received.surface,
  contentType: row.contentType ?? received.contentType,
  dwellMs: row.dwellMs ?? 0,
  watchMs: row.watchMs ?? undefined,
  mediaDurationMs: row.mediaDurationMs ?? undefined,
  completed: row.completed === true,
  actions: Array.isArray(row.actions) ? row.actions : [],
  watchSamples: Array.isArray(row.watchSamples) ? row.watchSamples : [],
});

export type EngagementSessionInput = {
  sessionId: string; userId?: string; postId: string; contentType: string; surface: string;
  startedAt: string; dwellMs: number; watchMs?: number; mediaDurationMs?: number;
  completed?: boolean; truncated?: boolean; consent?: string;
  actions?: unknown[]; watchSamples?: unknown[];
};

/**
 * Enregistre une vue — CHAQUE vue monte `viewCount`, la première monte aussi
 * `uniqueViewCount` (#10483, `creditPostView`). Retourne `true` UNIQUEMENT lors de la première vue
 * réelle du post AFFICHÉ (création du PostView) — permet à l'appelant de ne
 * déclencher les effets de bord coûteux « une fois » (ex : marquer les
 * notifications du post comme lues) sans les rejouer à chaque impression
 * répétée du feed. Le crédit de la racine (ci-dessous) n'influence JAMAIS
 * cette valeur de retour.
 *
 * Repost (chantier reposts cohérents & watermark, tâche 1) : quand le post
 * visionné pointe vers un original (`repostOfId`), la RACINE de la chaîne
 * (`originalRepostOfId ?? repostOfId` — jamais le parent intermédiaire) est
 * créditée EN PLUS via `creditPostView`, donc avec EXACTEMENT les mêmes
 * règles de dédup que le post affiché — y compris le MÊME filtre de
 * visibilité que le post affiché (une racine FRIENDS-only repostée en
 * PUBLIC reste inaccessible à un inconnu : sans ce filtre, n'importe qui
 * pourrait créditer/exposer un original privé via son repost public).
 *
 * Chaque crédit (affiché, racine) est gardé INDÉPENDAMMENT par le même
 * invariant anti-auto-inflation : l'auteur d'UN post donné n'inflate jamais
 * SON PROPRE compteur en le consultant. Un reposteur qui revisionne son
 * propre repost ne gonfle donc pas ce repost, mais reste un viewer légitime
 * de l'ORIGINAL — dont l'auteur diffère — et crédite bien la racine.
 *
 * RÉFÉRENCES (2026-08-19) : cette route est aussi le SEUL acte qui dépense le
 * droit qu'une référence ouvre sur un contenu expiré. Elle l'est parce
 * qu'elle est DÉCLARÉE — la vue est affirmée par le client au moment où il
 * affiche. Poser la consommation sur une lecture l'aurait dépensée avant tout
 * affichage : la NSE préfetche le post à la réception de la notification, la
 * revalidation cache-first relit derrière, le pull-to-refresh relit encore.
 * Le crédit de la RACINE, lui, garde le filtre d'audience : une référence
 * posée sur un repost n'ouvre pas l'original.
 */
export async function recordView(
  deps: PostReachDeps,
  postId: string,
  userId: string,
  duration?: number,
  context: ViewContext & { readonly impliesImpression?: boolean } = {},
): Promise<boolean> {
  try {
    // Enforce visibility before recording — without this, any authenticated
    // user could increment viewCount on any private story by ID, and have
    // their userId surface in the author's `/posts/:id/views` response
    // (information disclosure + view inflation).
    const visibilityFilter = await deps.visibilityFilter(userId);
    const VIEW_SELECT = {
      id: true, authorId: true, repostOfId: true, originalRepostOfId: true,
      type: true, expiresAt: true,
    } as const;
    const post = await deps.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED, ...visibilityFilter },
      select: VIEW_SELECT,
    });

    // Un référencé HORS audience ne passe pas le filtre ci-dessus — c'est
    // pourtant lui que la référence a le droit d'amener ici. On relit sans
    // filtre, et seule la référence décide.
    const target = post ?? await deps.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      select: VIEW_SELECT,
    });
    if (!target) return false;

    const now = new Date();
    const referencePost = { id: target.id, type: target.type, expiresAt: target.expiresAt };
    const access = await resolveReferenceAccess({
      prisma: deps.prisma,
      post: referencePost,
      viewerId: userId,
      now,
    });

    // Ni membre de l'audience, ni référencé : rien à enregistrer.
    if (!post && access !== 'granted') return false;
    if (access === 'consumed') return false;

    // La vue DÉCLARÉE est le seul acte qui dépense le droit. Une lecture ne
    // consomme jamais rien — la NSE préfetche, le cache revalide, le
    // pull-to-refresh relit.
    if (access === 'granted') {
      await consumeReferenceView({
        prisma: deps.prisma,
        post: referencePost,
        viewerId: userId,
        now,
      });
    }

    // Sanitize duration: client-supplied → cap at 5 minutes (way past any
    // reasonable story).
    const safeDuration = duration !== undefined
      ? Math.max(0, Math.min(300_000, Math.round(duration)))
      : undefined;

    // Author re-opening their own story shouldn't inflate viewCount — but
    // this guards ONLY the displayed post's own credit. It must NOT abort
    // the whole call: a reposter viewing their own repost is still a
    // legitimate viewer of the ORIGINAL (see root credit below).
    const isNewView = target.authorId === userId
      ? false
      : await creditPostView(deps.prisma, { postId, userId, durationMs: safeDuration, ...context });
    creditStoryViewed(deps.prisma, { viewerId: userId, story: target, isNewView, durationMs: safeDuration });
    if (context.impliesImpression && target.authorId !== userId) {
      await impressionImpliedByView(deps.prisma, { postId, userId, surface: context.surface }).catch((error: unknown) =>
        log.warn('recordView: impression implied by the view not written', {
          postId,
          error: error instanceof Error ? error.message : String(error),
        }));
    }

    const rootId = target.originalRepostOfId ?? target.repostOfId;
    if (rootId && rootId !== postId) {
      // Même filtre de visibilité que le post affiché — pas de requête
      // supplémentaire hors périmètre, le filtre est déjà résolu ci-dessus.
      const root = await deps.prisma.post.findFirst({
        where: { id: rootId, deletedAt: NOT_DELETED, ...visibilityFilter },
        select: { id: true, authorId: true },
      });
      if (root && root.authorId !== userId) {
        await creditPostView(deps.prisma, { postId: rootId, userId, durationMs: safeDuration, ...context, surface: undefined });
      }
    }

    return isNewView;
  } catch (error) {
    // P7-2 — course double-submit : l'index unique (postId,userId) fait
    // lever P2002 sur le create concurrent. Dédup ATTENDUE → no-op
    // silencieux ; les compteurs restent exacts (l'incrément n'a pas été
    // atteint). Pattern miroir de la vue anonyme (`anonymousReach.ts`).
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return false;
    }
    // Toute AUTRE erreur (Mongo injoignable, validation) était avalée en
    // silence par l'ancien `catch {}` — loggée désormais pour ne pas
    // masquer une vraie panne sur ce chemin (initiative 6cd1a3c47).
    log.warn('recordView failed', {
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

}

/**
 * Ingestion append-only des sessions d'engagement (LOT 4 + agrégation LOT 5).
 *
 * - Upsert sur `sessionId` → idempotent : rejouer un ACK perdu après un 200 est
 *   un no-op (aucun double comptage).
 * - Skip-and-continue : un post supprimé entre `begin` et `flush` est ignoré
 *   sans faire échouer le reste du batch.
 * - Caps défensifs (300 s) sur `dwellMs`/`watchMs`.
 * - `userId` provient de la route (jamais du client) — anti spoofing.
 * - Agrégation dénormalisée (`postOpenCount`, `playCount`, `qualifiedViewCount`)
 *   créditée par ce que la session AJOUTE (#10764) : le premier contact puis la
 *   mesure arrivent sous la même clé, la ligne stockée est fusionnée sans
 *   jamais reculer, et seuls les compteurs que la fusion gagne sont montés —
 *   un rejeu idempotent n'ajoute rien. N'altère NI `viewCount` NI `PostView`.
 *
 * Retourne le nombre de sessions persistées (insert ou update).
 */
export async function recordEngagementBatch(
  prisma: PrismaClient,
  sessions: readonly EngagementSessionInput[],
  userId: string,
): Promise<number> {
  const capped = sessions.slice(0, 50);
  let recorded = 0;

  for (const s of capped) {
    try {
      const post = await prisma.post.findFirst({
        where: { id: s.postId, deletedAt: NOT_DELETED },
        select: { id: true, authorId: true },
      });
      if (!post) continue; // skip-and-continue: post deleted between begin and flush

      const dwellMs = Math.max(0, Math.min(300_000, Math.round(s.dwellMs)));
      const watchMs = s.watchMs !== undefined
        ? Math.max(0, Math.min(300_000, Math.round(s.watchMs)))
        : undefined;
      const mediaDurationMs = s.mediaDurationMs !== undefined
        ? Math.max(0, Math.round(s.mediaDurationMs))
        : undefined;

      const received = {
        surface: s.surface,
        contentType: s.contentType,
        dwellMs,
        watchMs,
        mediaDurationMs,
        completed: s.completed === true,
        actions: s.actions ?? [],
        watchSamples: s.watchSamples ?? [],
      };

      const receivedAt = new Date();
      const before = await prisma.postEngagement.findUnique({
        where: { sessionId: s.sessionId },
        select: STORED_ENGAGEMENT_SELECT,
      });
      const stored = before ? storedEngagementOf(before, received) : undefined;
      const session = stored ? mergeEngagementSessions(stored, received) : received;

      const data = {
        postId: s.postId,
        userId,
        contentType: s.contentType,
        surface: s.surface,
        startedAt: new Date(s.startedAt),
        dwellMs: session.dwellMs,
        watchMs: session.watchMs,
        mediaDurationMs: session.mediaDurationMs,
        completed: session.completed,
        truncated: s.truncated === true,
        consent: s.consent,
        actions: session.actions as Prisma.InputJsonValue,
        watchSamples: session.watchSamples as Prisma.InputJsonValue,
      };

      await prisma.postEngagement.upsert({
        where: { sessionId: s.sessionId },
        update: data,
        // Conservation du brut : 90 j (#10510, O7) — posée à la création, jamais prolongée par un rejeu.
        create: { sessionId: s.sessionId, ...data, createdAt: receivedAt, expiresAt: new Date(Date.now() + POST_ENGAGEMENT_RETENTION_MS) },
      });

      const counts = await engagementSessionCounts(prisma, {
        sessionId: s.sessionId,
        postId: s.postId,
        userId,
        authorId: post.authorId,
        receivedAt: before?.createdAt ?? receivedAt,
      });
      const added = counts ? engagementIncrementsAdded(stored, session) : {};
      if (Object.keys(added).length > 0) {
        await incrementPostCounters(prisma, [s.postId], added);
      }
      recorded += 1;
    } catch (error) {
      // Une session dont l'écriture ou l'incrément a échoué n'est PAS comptée
      // dans `recorded` (#10402) ; le lot continue, et l'échec se dit.
      log.warn('recordEngagementBatch: session not recorded', {
        postId: s.postId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return recorded;

}
