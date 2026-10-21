import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { rawReadingRetentionMs } from '../../config/raw-reading-retention';
import type { AnalyticsStanding } from '../social/eventPrivacy';
import { accountReaderKeyOf, engagementSessionKeyOf } from './readerKey';
import { NOT_DELETED } from './postIncludes';
import { creditPostView } from './postViewCredit';
import type { ViewContext } from './viewProvenance';
import { incrementPostCounters } from './postCounters';
import {
  creditsOfIncrements,
  engagementAggregateIncrements,
  incrementsNotYetCredited,
  incrementsOfCredits,
  mergeEngagementSessions,
  type MergeableEngagement,
} from './engagementIncrements';
import { consumeReferenceView, resolveReferenceAccess } from './referenceAccess';
import { creditStoryViewed } from './postEngagementCredits';
import { impressionImpliedByView } from '../social/viewImpressions';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { errorIdentity } from '../../utils/error-identity';

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
  id: true, readerKey: true, surface: true, contentType: true, dwellMs: true, watchMs: true,
  mediaDurationMs: true, completed: true, actions: true, watchSamples: true, createdAt: true, expiresAt: true,
  creditedOpen: true, creditedPlay: true, creditedQualified: true,
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
  params: {
    readonly sessionKeys: readonly string[]; readonly postId: string; readonly userId: string;
    readonly authorId: string; readonly receivedAt: Date;
  },
): Promise<boolean> {
  if (params.authorId === params.userId) return false;
  // Le même lecteur sous ses DEUX formes : nominative, et l'empreinte des lignes
  // réduites écrites entre #10771 et #10785 (lues jusqu'à leur expiration, 8 j).
  const sibling = await prisma.postEngagement.findFirst({
    where: {
      postId: params.postId,
      OR: [{ userId: params.userId }, { readerKey: accountReaderKeyOf(params.userId) }],
      NOT: { sessionId: { in: [...params.sessionKeys] } },
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
  readonly readerKey?: string | null;
  readonly creditedOpen?: boolean | null;
  readonly creditedPlay?: boolean | null;
  readonly creditedQualified?: boolean | null;
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
          error: errorIdentity(error),
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
      error: errorIdentity(error),
    });
    return false;
  }

}

/**
 * Le post qu'une session de ce lecteur a le droit de créditer : vivant, et dans
 * son audience — ou ouvert par une RÉFÉRENCE encore valable (`granted`), comme
 * pour `recordView`. Une session ne DÉPENSE jamais une référence : seule la vue
 * déclarée le fait.
 */
async function readableEngagementTarget(
  deps: PostReachDeps,
  postId: string,
  userId: string,
  audienceOf: () => Promise<Prisma.PostWhereInput>,
): Promise<{ readonly id: string; readonly authorId: string } | null> {
  const select = { id: true, authorId: true, type: true, expiresAt: true } as const;
  const visible = await deps.prisma.post.findFirst({ where: { id: postId, deletedAt: NOT_DELETED, ...(await audienceOf()) }, select });
  if (visible) return visible;
  const referenced = await deps.prisma.post.findFirst({ where: { id: postId, deletedAt: NOT_DELETED }, select });
  if (!referenced) return null;
  const access = await resolveReferenceAccess({ prisma: deps.prisma, post: referenced, viewerId: userId, now: new Date() });
  return access === 'granted' ? referenced : null;
}

/**
 * Le statut d'analyse d'UNE session (#10772) : le client fait foi pour REFUSER
 * (`consent: 'denied'` sur la session), la passerelle pour ACCORDER — une
 * session qui se dit `granted` sous un statut serveur autre n'accorde rien.
 */
const sessionStandingOf = (clientConsent: string | undefined, standing: AnalyticsStanding): AnalyticsStanding =>
  clientConsent === 'denied' ? 'denied' : standing;

/** Une ligne réduite écrite entre #10771 et #10785 : empreinte du lecteur, sans compte ni mesure. */
const isReducedRow = (row: StoredEngagementRow): boolean => typeof row.readerKey === 'string';

const UNSET = { unset: true } as const;

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
 * La ligne est NOMINATIVE quel que soit le statut d'analyse (#10785, décision
 * du porteur) : « qui a vu » est une fonctionnalité de la plateforme. Le
 * statut que la passerelle établit (#10772) ne gouverne que la télémétrie sans
 * fonctionnalité visible : hors `granted`, ni micro-actions (`actions`) ni
 * échantillons de lecture (`watchSamples`). Les trois compteurs déjà crédités
 * sont rangés en drapeaux. Une ligne réduite antérieure (#10771 : empreinte,
 * sans compte) que la suite de sa session retrouve redevient nominative.
 *
 * Retourne le nombre de sessions persistées (insert ou update).
 */
export async function recordEngagementBatch(
  deps: PostReachDeps,
  sessions: readonly EngagementSessionInput[],
  userId: string,
  batchStanding: AnalyticsStanding = 'not_granted',
): Promise<number> {
  const { prisma } = deps;
  const capped = sessions.slice(0, 50);
  // Le MÊME filtre d'audience que `recordView`, résolu au plus une fois par lot,
  // à la première session (un lot vide n'en coûte aucune) : une session sur un
  // post que le lecteur ne peut pas voir ne crédite rien et n'écrit rien —
  // sinon un client gonflerait les compteurs d'un post privé et apprendrait
  // son existence.
  let visibilityFilter: Promise<Prisma.PostWhereInput> | undefined;
  const audienceOf = () => (visibilityFilter ??= deps.visibilityFilter(userId));
  let recorded = 0;

  for (const s of capped) {
    try {
      const post = await readableEngagementTarget(deps, s.postId, userId, audienceOf);
      if (!post) continue; // skip-and-continue: supprimé, hors audience ou inconnu — même porte

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
      const reducedKey = engagementSessionKeyOf(s.sessionId);
      const readerKey = accountReaderKeyOf(userId);
      // La clé de session vient du client : la ligne n'est la sienne que sous
      // SON identité (compte, ou empreinte d'une ligne réduite antérieure à
      // #10785). Celle d'un autre lecteur n'est ni lue, ni mise à jour —
      // l'écriture qui suit lève sur l'unicité, et la session ne compte pas.
      const ownRaw = { sessionId: s.sessionId, userId };
      const ownReduced = { sessionId: reducedKey, readerKey };
      const before = await prisma.postEngagement.findUnique({
        where: ownRaw,
        select: STORED_ENGAGEMENT_SELECT,
      }) ?? await prisma.postEngagement.findUnique({
        where: ownReduced,
        select: STORED_ENGAGEMENT_SELECT,
      });
      const storedReduced = before !== null && isReducedRow(before);
      const stored = before && !storedReduced ? storedEngagementOf(before, received) : undefined;
      const sessionStanding = sessionStandingOf(s.consent, batchStanding);
      const traced = sessionStanding === 'granted';
      const session = stored ? mergeEngagementSessions(stored, received) : received;

      const already = {
        ...(before ? incrementsOfCredits(before) : {}),
        ...(stored ? engagementAggregateIncrements(stored) : {}),
      };
      const credited = { ...already, ...engagementAggregateIncrements(session) };

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
        consent: sessionStanding,
        actions: (traced ? session.actions : []) as Prisma.InputJsonValue,
        watchSamples: (traced ? session.watchSamples : []) as Prisma.InputJsonValue,
        ...creditsOfIncrements(credited),
      };

      if (before && storedReduced) {
        await prisma.postEngagement.update({
          where: { id: before.id },
          data: {
            ...data,
            sessionId: s.sessionId,
            readerKey: UNSET,
            expiresAt: new Date(before.createdAt.getTime() + rawReadingRetentionMs()),
          },
        });
      } else {
        await prisma.postEngagement.upsert({
          where: ownRaw,
          update: data,
          // Conservation du brut : `RAW_READING_RETENTION_DAYS`, 25 mois par défaut (#10510) — posée à la création, jamais prolongée par un rejeu.
          create: { sessionId: s.sessionId, ...data, createdAt: receivedAt, expiresAt: new Date(receivedAt.getTime() + rawReadingRetentionMs()) },
        });
      }

      const counts = await engagementSessionCounts(prisma, {
        sessionKeys: [s.sessionId, reducedKey],
        postId: s.postId,
        userId,
        authorId: post.authorId,
        receivedAt: before?.createdAt ?? receivedAt,
      });
      const added = counts ? incrementsNotYetCredited(already, credited) : {};
      if (Object.keys(added).length > 0) {
        await incrementPostCounters(prisma, [s.postId], added);
      }
      recorded += 1;
    } catch (error) {
      // Une session dont l'écriture ou l'incrément a échoué n'est PAS comptée
      // dans `recorded` (#10402) ; le lot continue, et l'échec se dit.
      log.warn('recordEngagementBatch: session not recorded', {
        postId: s.postId,
        error: errorIdentity(error),
      });
    }
  }
  return recorded;

}
