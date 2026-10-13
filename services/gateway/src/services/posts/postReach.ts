import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { NOT_DELETED } from './postIncludes';
import { creditPostView } from './postViewCredit';
import type { ViewContext } from './viewProvenance';
import { incrementPostCounters } from './postCounters';
import { engagementAggregateIncrements } from './engagementIncrements';
import { consumeReferenceView, resolveReferenceAccess } from './referenceAccess';
import { creditStoryViewed } from './postEngagementCredits';
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
  context: ViewContext = {},
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
 * - Agrégation dénormalisée alimentée UNIQUEMENT à l'INSERT d'une nouvelle ligne
 *   (jamais aux updates/retries idempotents) : `postOpenCount`, `playCount`,
 *   `qualifiedViewCount`. N'altère NI `viewCount` NI `PostView`.
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

      const completed = s.completed === true;
      const data = {
        postId: s.postId,
        userId,
        contentType: s.contentType,
        surface: s.surface,
        startedAt: new Date(s.startedAt),
        dwellMs,
        watchMs,
        mediaDurationMs,
        completed,
        truncated: s.truncated === true,
        consent: s.consent,
        actions: (s.actions ?? []) as Prisma.InputJsonValue,
        watchSamples: (s.watchSamples ?? []) as Prisma.InputJsonValue,
      };

      const before = await prisma.postEngagement.findUnique({
        where: { sessionId: s.sessionId },
        select: { id: true },
      });
      const isInsert = !before;

      await prisma.postEngagement.upsert({
        where: { sessionId: s.sessionId },
        update: data,
        create: { sessionId: s.sessionId, ...data },
      });

      if (isInsert) {
        await incrementPostCounters(prisma, [s.postId], engagementAggregateIncrements({
          surface: s.surface,
          contentType: s.contentType,
          dwellMs,
          watchMs,
          mediaDurationMs,
          completed,
          watchSamples: s.watchSamples ?? [],
        }));
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
