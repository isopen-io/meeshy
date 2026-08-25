import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostVisibility, PostType } from '@meeshy/shared/prisma/client';
import { decodeCursor, encodeCursor } from '../routes/posts/types';
import { authorSelect, postInclude, postMentionInclude, storyPostInclude, trayStorySelect, NOT_DELETED } from './posts/postIncludes';
import { withMentions, type WireReader } from './posts/postReferences';
import { EPHEMERAL_AUTHOR_ARCHIVE_MS } from './posts/ephemeralPosts';
import { buildPostVisibilityOrFilter, isEphemeralPostType } from './posts/postVisibility';
import {
  reelAffinityScore,
  type ReelAffinityContext,
  type ReelSeed,
} from './posts/reelAffinity';
import type { CacheStore } from './CacheStore';
import { getCommunityCoMemberIds, isActiveCommunityMember } from './posts/communityVisibility';
import { enhancedLogger } from '../utils/logger-enhanced';
import { hoistLocationDeep } from './location/sharedPlace';
import { verdictFor, type ReferenceAccessVerdict } from './posts/referenceAccess';
import { getPresenceVisibilityService } from './PresenceVisibilityService';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import type { PresenceVisibility } from '@meeshy/shared/utils/presence-visibility';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

const logger = enhancedLogger.child({ module: 'PostFeedService' });

const FEED_SOCIAL_CACHE_TTL = 300; // 5 min — friend lists change infrequently

// Plafond des tombstones renvoyés par un delta-sync de stories. Le filtre de
// visibilité borne déjà au cercle de l'utilisateur : 500 disparitions sur une
// même fenêtre delta est très large. Au-delà, la troncature est signalée (voir
// getStories) et le reliquat attend le prochain fetch complet.
const STORY_TOMBSTONE_LIMIT = 500;

// Feed payloads share the canonical postInclude — alias kept for callsite clarity.
const feedPostInclude = postInclude;

// ============================================
// SCORING FUNCTIONS
// ============================================

function recencyScore(createdAt: Date): number {
  const hoursAge = (Date.now() - createdAt.getTime()) / 3_600_000;
  return 1 / (1 + hoursAge / 6); // half-life = 6 hours
}

function engagementScore(post: any): number {
  const raw =
    (post.likeCount ?? 0) * 1 +
    (post.commentCount ?? 0) * 3 +
    (post.repostCount ?? 0) * 5 +
    (post.viewCount ?? 0) * 0.1 +
    (post.bookmarkCount ?? 0) * 2;
  return Math.log10(1 + raw) / 6;
}

function diversityScore(authorId: string, authorCounts: Map<string, number>): number {
  const count = authorCounts.get(authorId) ?? 0;
  return 1 / (1 + count * 0.5);
}

// Réels : ils ne vivent pas du texte mais du watch-signal. Un réel vu/sauvegardé
// porte une intention de consommation bien plus forte qu'un like sur un post texte.
// On boost donc explicitement les réels sur leur signal de visionnage (viewCount)
// + l'intention profonde (bookmarks, reposts) pour les remonter correctement.
// Retourne 0 pour tout post non-REEL → neutre dans le score combiné.
function reelScore(post: any): number {
  if (post.type !== PostType.REEL) return 0;
  const views = post.viewCount ?? 0;
  const deepIntent = (post.bookmarkCount ?? 0) * 2 + (post.repostCount ?? 0) * 3;
  return Math.log10(1 + views + deepIntent) / 5;
}

// Fatigue d'impression : un post déjà remonté dans le feed du viewer (PostImpression)
// mais qu'il a laissé passer doit céder la place à du contenu frais. Pénalité bornée
// pour ne jamais enterrer définitivement un contenu (le viewer peut y revenir).
function seenPenalty(postId: string, seenCounts: Map<string, number>): number {
  const seen = seenCounts.get(postId) ?? 0;
  if (seen <= 0) return 0;
  return Math.min(0.5, seen * 0.15);
}

const FEED_INTEREST_CACHE_TTL = 300; // 5 min — l'historique d'engagement bouge lentement
const INTEREST_REACTION_SAMPLE = 100; // dernières réactions analysées pour l'intérêt
const INTEREST_BOOKMARK_SAMPLE = 50;  // derniers bookmarks analysés
const INTEREST_NORMALIZER = Math.log10(1 + 20); // sature l'affinité d'intérêt à ~20 engagements

export class PostFeedService {
  /// Fenêtre pendant laquelle un auteur continue de recevoir SES stories
  /// expirées, pour que « Mes stories » puisse les archiver. Sept jours : au
  /// -delà, une story n'est plus un contenu qu'on republie ou dont on relit
  /// les vues, et la réponse doit rester bornée.
  ///
  /// Réexportée depuis `posts/ephemeralPosts.ts` plutôt que redéclarée : le
  /// balayage du contenu éphémère attend la fin de cette fenêtre avant de
  /// soft-supprimer, parce que la requête ci-dessous est gardée par
  /// `deletedAt: NOT_DELETED`. Deux copies dériveraient — et le jour où
  /// celle-ci s'allongerait, le balayage la devancerait en silence.
  static readonly AUTHOR_ARCHIVE_WINDOW_MS = EPHEMERAL_AUTHOR_ARCHIVE_MS;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache?: CacheStore
  ) {}

  /**
   * Main feed with recommendation scoring.
   * Phase 1: Fetch candidates from DB (3x limit)
   * Phase 2: Score & rank in-app
   */
  async getFeed(userId: string, cursor?: string, limit: number = 20, reader?: WireReader) {
    // Chronological window + 1 probe row to detect `hasMore`. We deliberately
    // do NOT over-fetch then drop: the cursor advances by `createdAt`, so any
    // candidate we fetch-but-drop would be silently skipped (or re-served as a
    // duplicate) on the next page. Ranking reorders *within* the window only,
    // which keeps infinite scroll lossless: every post appears exactly once.
    const candidateLimit = limit + 1;
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Resolve the viewer's social graph BEFORE the candidate query: the feed
    // MUST gate FRIENDS/COMMUNITY/ONLY/EXCEPT visibility to people the viewer is
    // actually entitled to see (buildVisibilityFilter — the same SSOT every
    // sibling feed method uses). A flat `visibility: { in: ['PUBLIC','FRIENDS'] }`
    // leaked every user's friends-only posts to every viewer. `friendIds`
    // (accepted friends only) is reused below for affinity scoring; contacts
    // (friends ∪ direct-conversation partners) widen the FRIENDS gate exactly
    // like getStories/getStatuses/getReels.
    const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      getCommunityCoMemberIds(this.prisma, userId, this.cache),
    ]);
    const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
    const visibilityFilter = this.buildVisibilityFilter(userId, allContactIds, communityCoMemberIds);

    // Phase 1 — Fetch candidates
    const where: any = {
      deletedAt: NOT_DELETED,
      type: { in: [PostType.POST, PostType.REEL] },
      AND: [
        visibilityFilter,
        // Exclude expired (isSet: false matches MongoDB docs where field is absent)
        {
          OR: [
            { expiresAt: { isSet: false } },
            { expiresAt: { equals: null } },
            { expiresAt: { gt: new Date() } },
          ],
        },
      ],
    };

    if (cursorData) {
      // Cursor-based: get posts strictly before the cursor (createdAt, id).
      where.AND.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    const candidates = await this.prisma.post.findMany({
      where,
      include: feedPostInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: candidateLimit,
    });

    if (candidates.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    // The page is the chronological window (candidates already arrive
    // createdAt desc). The cursor is the OLDEST post of this window, captured
    // before any score reordering, so the next page is strictly older — no
    // skips, no duplicates under infinite scroll.
    const hasMore = candidates.length > limit;
    const page = hasMore ? candidates.slice(0, limit) : candidates;
    const oldest = page[page.length - 1];
    const nextCursor = hasMore && oldest
      ? encodeCursor(oldest.createdAt, oldest.id)
      : null;

    const candidateIds = page.map((c) => c.id);

    // Fetch intent signals in parallel (friendIds already resolved above for the
    // visibility gate, and reused here for binary affinity scoring):
    // - interestAffinity : intérêt personnalisé dérivé de l'engagement passé du viewer
    // - seenCounts       : combien de fois chaque candidat est déjà remonté (fatigue)
    const [interestAffinity, seenCounts] = await Promise.all([
      this.getInterestAffinity(userId),
      this.getSeenCounts(userId, candidateIds),
    ]);

    // Phase 2 — Score the window (display order only; cursor is fixed above)
    const authorCounts = new Map<string, number>();
    const scored = page.map((post) => {
      const affinity = this.affinityScore(post.authorId, userId, friendIds);
      const diversity = diversityScore(post.authorId, authorCounts);
      const interest = interestAffinity.get(post.authorId) ?? 0;
      const reel = reelScore(post);

      const score =
        recencyScore(post.createdAt) * 0.30 +
        engagementScore(post) * 0.20 +
        affinity * 0.15 +
        interest * 0.15 +
        diversity * 0.10 +
        reel * 0.10 -
        seenPenalty(post.id, seenCounts);

      // Track author counts for diversity penalty
      authorCounts.set(post.authorId, (authorCounts.get(post.authorId) ?? 0) + 1);

      return { post, score };
    });

    // Sort by score descending — display order within the window
    scored.sort((a, b) => b.score - a.score);
    const items = scored;

    const postIds = items.map((s) => s.post.id);
    const [userReactionsMap, personalFlags] = postIds.length > 0
      ? await Promise.all([
          this.resolveUserReactionsMap(userId, items.map((s) => s.post)),
          this.resolvePersonalFlags(userId, postIds),
        ])
      : [new Map<string, string[]>(), { bookmarkedIds: new Set<string>(), repostedIds: new Set<string>() }];

    return {
      items: items.map((s) => withMentions(hoistLocationDeep({
        ...this.enrichWithLikeStatus(s.post, userReactionsMap.get(s.post.id) ?? []),
        currentUserReactions: userReactionsMap.get(s.post.id) ?? [],
        ...this.personalFlagsFor(s.post.id, personalFlags),
      }), reader)),
      nextCursor,
      hasMore,
    };
  }

  async getStories(
    userId: string,
    options?: { updatedSince?: Date; projection?: 'tray'; cursor?: string; limit?: number; archiveOfAuthor?: boolean; reader?: WireReader }
  ) {
    const now = new Date();
    // G1(c) pagination keyset (createdAt, id) — même patron que getStatuses /
    // getDiscoverStatuses. Sans cursor ni limit explicites, la première page
    // de 50 reproduit le plafond historique (rétro-compatible).
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 50);
    const cursorData = options?.cursor ? decodeCursor(options.cursor) : null;

    // Mode ARCHIVE AUTEUR (`GET /posts/stories/mine`, 2026-08-12) : toutes MES
    // stories non supprimées, expirées comprises, SANS plancher temporel — les
    // stories ne sont plus jamais détruites (cf. ephemeralPosts.SWEPT_POST_TYPES)
    // et « Mes stories » pagine cet historique complet. Pas de filtre de
    // visibilité (ce sont les posts de l'appelant), pas de tombstones (le mode
    // ne porte pas de delta-sync). Vit DANS getStories pour réutiliser à
    // l'identique include, enrichissement (vu/réactions) et mapping — une
    // seconde requête copiée aurait divergé.
    if (options?.archiveOfAuthor) {
      const archiveWhere: any = {
        deletedAt: NOT_DELETED,
        type: PostType.STORY,
        authorId: userId,
        AND: [] as unknown[],
      };
      if (cursorData) {
        archiveWhere.AND.push({
          OR: [
            { createdAt: { lt: new Date(cursorData.createdAt) } },
            { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
          ],
        });
      }
      return this.fetchAndEnrichStories(archiveWhere, userId, limit, options?.projection === 'tray', () => Promise.resolve([]), now, options?.reader);
    }
    const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      getCommunityCoMemberIds(this.prisma, userId, this.cache),
    ]);
    const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
    const visibilityFilter = this.buildVisibilityFilter(userId, allContactIds, communityCoMemberIds);

    // Archive de l'AUTEUR : mes propres stories restent renvoyées après leur
    // expiration, pour que « Mes stories » puisse les lister (vignette voilée).
    // Sans cette exception, le serveur ne les renvoyait jamais et le client ne
    // pouvait pas les garder non plus — un pull-to-refresh écrase son cache
    // avec la réponse serveur (`StoryViewModel.storyGroups = groups`).
    //
    // Bornée : sans plancher, la réponse enflerait indéfiniment avec
    // l'ancienneté du compte — l'historique complet vit derrière
    // `GET /posts/stories/mine` (mode `archiveOfAuthor` ci-dessus). Les
    // stories des AUTRES restent filtrées à leur expiration, comme avant.
    const authorArchiveFloor = new Date(now.getTime() - PostFeedService.AUTHOR_ARCHIVE_WINDOW_MS);

    const where: any = {
      deletedAt: NOT_DELETED,
      type: PostType.STORY,
      AND: [
        visibilityFilter,
        {
          OR: [
            { expiresAt: { isSet: false } },
            { expiresAt: { equals: null } },
            { expiresAt: { gt: now } },
            { AND: [{ authorId: userId }, { expiresAt: { gt: authorArchiveFloor } }] },
          ],
        },
      ],
    };

    // G1 delta-sync : `updatedSince` ne renvoie que les stories créées ou
    // modifiées (compteurs, traductions) depuis le timestamp — le client
    // fusionne avec son cache 24 h.
    // Sans le paramètre, comportement historique complet (rétro-compatible).
    if (options?.updatedSince) {
      where.AND.push({ updatedAt: { gt: options.updatedSince } });
    }

    if (cursorData) {
      where.AND.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    // Tombstones du delta-sync — les DISPARITIONS, que le delta ne peut pas
    // exprimer autrement (il ne renvoie que ce qui existe encore).
    //
    // Sans elles, une story supprimée pendant que le client était hors-ligne ou
    // fermé n'était jamais réconciliée : l'event socket `story:deleted` ne se
    // rejoue pas, et le merge delta côté client est purement additif. La story
    // restait dans son cache — illisible et indéboulonnable — jusqu'au full
    // fetch (24 h) ou un pull-to-refresh.
    //
    // Couvre aussi l'expiration : `ExpiredStoriesCleanupService` soft-delete
    // les stories périmées, ce qui pose `deletedAt` et remonte `updatedAt` —
    // mais seulement une fois passée la fenêtre d'archive auteur
    // (`EPHEMERAL_AUTHOR_ARCHIVE_MS`), pas à l'échéance. Le client garde donc
    // bien son propre filtre d'expiry, et pas seulement « pour ne pas dépendre
    // du passage du balayeur » : entre l'échéance et le masquage, il est le
    // SEUL à filtrer. (Avant le cycle 54 le balayage n'appariait aucun post et
    // ne posait jamais `deletedAt` — ce tombstone ne voyait que les
    // suppressions décidées.)
    //
    // Même `visibilityFilter` que le tray : le delta ne doit pas divulguer
    // l'existence de stories que l'utilisateur n'a jamais eu le droit de voir.
    // Lancé ici pour s'exécuter en parallèle des requêtes d'enrichissement.
    //
    // Ligne SONDE (`take: LIMIT + 1`), même patron que `hasMore` ci-dessus : le
    // plafond des tombstones n'a AUCUN curseur de reprise, donc sa troncature
    // doit voyager jusqu'au client, qui n'a alors qu'un seul recours — refetch
    // complet, dont le remplacement du tray purge les fantômes. Compter
    // `length === LIMIT` confondrait une page coupée avec une fenêtre de très
    // exactement LIMIT suppressions, qui est COMPLÈTE : le client escaladerait
    // pour rien, à chaque delta, tant que la fenêtre reste sur ce nombre.
    //
    // PORTÉE : la FENÊTRE, pas la page — d'où le `!cursorData`. Cette clause ne
    // dépend pas du curseur, elle est identique d'une page à l'autre. Depuis que
    // le client draine la fenêtre delta (`StoryViewModel.drainStoryPages`,
    // jusqu'à 6 pages), la relancer à chaque page referait jusqu'à 6 fois la
    // même lecture de 501 lignes sous filtre de visibilité, pour un résultat que
    // le client tient déjà depuis la première page. Elle ne court donc que sur
    // la page qui OUVRE la fenêtre. Sûr parce que le drain fusionne par union
    // (`formUnion`) et par `||`, jamais par écrasement : une page suivante sans
    // tombstone ne peut pas effacer ceux de la première.
    const updatedSince = options?.updatedSince;
    const deletedIdsFactory: () => Promise<string[]> = updatedSince && !cursorData
      ? () => this.prisma.post
          .findMany({
            where: {
              type: PostType.STORY,
              deletedAt: { not: null },
              updatedAt: { gt: updatedSince },
              AND: [visibilityFilter],
            },
            select: { id: true },
            orderBy: { updatedAt: 'desc' },
            take: STORY_TOMBSTONE_LIMIT + 1,
          })
          .then((rows) => rows.map((r) => r.id))
      : () => Promise.resolve([]);

    return this.fetchAndEnrichStories(where, userId, limit, options?.projection === 'tray', deletedIdsFactory, now, options?.reader);
  }

  /**
   * Corps partagé de `getStories` (tray/delta) et de son mode archive auteur :
   * fetch keyset + curseur, enrichissement vu/réactions, mapping. Extrait pour
   * que le mode archive ne duplique pas la requête — une copie aurait divergé.
   * `deletedIdsFactory` est une FABRIQUE (pas une promesse) : la requête
   * tombstones part APRÈS le fetch des stories, en parallèle de
   * l'enrichissement — l'ordre historique des requêtes est observable (tests).
   */
  private async fetchAndEnrichStories(
    where: any,
    userId: string,
    limit: number,
    isTrayProjection: boolean,
    deletedIdsFactory: () => Promise<string[]>,
    now: Date,
    reader?: WireReader,
  ) {
    // G1(b) projection tray : select léger (anneaux + miniature + vu) au lieu
    // du plein corps — opt-in, le défaut reste l'include canonique complet.
    // Deux appels distincts : Prisma type `select`/`include` comme des
    // overloads exclusifs, un spread conditionnel produit une union rejetée.
    const fetched = isTrayProjection
      ? await this.prisma.post.findMany({
          where,
          select: trayStorySelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        })
      : await this.prisma.post.findMany({
          where,
          // Story-scoped include : l'auteur embarque isOnline/lastActiveAt pour
          // que l'interstitiel d'identité du viewer résolve la présence AU
          // moment du switch de groupe (jamais après affichage du slide).
          include: storyPostInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
        });

    const hasMore = fetched.length > limit;
    const stories = hasMore ? fetched.slice(0, limit) : fetched;
    const nextCursor = hasMore && stories.length > 0
      ? encodeCursor(stories[stories.length - 1].createdAt, stories[stories.length - 1].id)
      : null;

    // Lancée APRÈS le fetch, en parallèle des requêtes d'enrichissement.
    const deletedIdsPromise = deletedIdsFactory();

    const storyIds = stories.map((s) => s.id);
    // Le tray ne rend pas les réactions — la requête batch est coupée en
    // projection ; isViewedByMe (anneau vu/non-vu) reste servi dans les deux.
    //
    // `referenceRows` : UNE requête pour tout le lot, pas un `findUnique` par
    // story — même patron que `getMentionsByPost` pour l'affinité, même
    // raison. Le verdict de chaque story se résout ensuite EN MÉMOIRE par
    // `verdictFor`, le même cœur pur qu'appelle `resolveReferenceAccess` sur
    // l'ouverture détaillée : deux lectures, une seule règle.
    const [viewedRows, userReactions, referenceRows] = storyIds.length > 0
      ? await Promise.all([
          this.prisma.postView.findMany({
            where: { postId: { in: storyIds }, userId },
            select: { postId: true },
          }),
          isTrayProjection
            ? Promise.resolve([] as { postId: string; emoji: string }[])
            : this.prisma.postReaction.findMany({
                where: { userId, postId: { in: storyIds } },
                select: { postId: true, emoji: true },
              }),
          this.prisma.postMention.findMany({
            where: { postId: { in: storyIds }, mentionedUserId: userId },
            select: { postId: true, expiredViewAt: true },
          }),
        ])
      : [[], [], []];
    const viewedSet = new Set(viewedRows.map((v) => v.postId));
    const userReactionsMap = new Map<string, string[]>();
    for (const r of userReactions) {
      const list = userReactionsMap.get(r.postId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.postId, list);
    }
    const referenceByPost = new Map(referenceRows.map((row) => [row.postId, row.expiredViewAt]));

    // Gate de présence de l'auteur. Les deux projections chargent
    // `isOnline`/`lastActiveAt` (décision produit : l'interstitiel d'identité
    // doit être complet à l'instant du switch de groupe) — les SERVIR bruts
    // n'en est pas une.
    const authorVisibility = await this.resolveStoryAuthorPresence(stories, userId);

    // hoistLocationDeep est un no-op sûr sur la projection tray (ni `metadata`
    // ni `comments` sélectionnés — cf. trayStorySelect) : elle ne rend de
    // toute façon pas de badge de lieu (anneaux + miniature seuls).
    const items = stories.map((s) => {
      // `s` n'est visible dans la requête que si `userId` en a le droit — soit
      // par l'audience ordinaire, soit parce qu'il y est référencé. `none` ne
      // dit donc pas « inaccessible » ici : il dit « rien à dépenser », et
      // l'audience ordinaire tranche l'affichage comme avant.
      const referenceAccess: ReferenceAccessVerdict = referenceByPost.has(s.id)
        ? verdictFor(s.expiresAt, referenceByPost.get(s.id), now)
        : 'none';
      const author = (s as { author?: { id: string; isOnline: boolean | null; lastActiveAt: Date | null } | null }).author;
      return withMentions(hoistLocationDeep({
        ...this.enrichWithLikeStatus(s, userReactionsMap.get(s.id) ?? []),
        ...(author ? { author: applyPresenceVisibilityAsOffline(author, authorVisibility.get(author.id)) } : {}),
        isViewedByMe: viewedSet.has(s.id),
        currentUserReactions: userReactionsMap.get(s.id) ?? [],
        referenceAccess,
      }), reader);
    });

    const fetchedDeletedIds = await deletedIdsPromise;
    const deletedIdsTruncated = fetchedDeletedIds.length > STORY_TOMBSTONE_LIMIT;
    const deletedIds = deletedIdsTruncated
      ? fetchedDeletedIds.slice(0, STORY_TOMBSTONE_LIMIT)
      : fetchedDeletedIds;
    if (deletedIdsTruncated) {
      // Le drapeau part maintenant AUSSI dans la charge utile : ce log seul ne
      // disait la troncature qu'à nous, jamais au seul acteur qui pouvait y
      // remédier.
      logger.warn(
        `[getStories] tombstones tronqués à ${STORY_TOMBSTONE_LIMIT} pour user=${userId} — ` +
        'le client escaladera vers un fetch complet'
      );
    }

    return { items, nextCursor, hasMore, deletedIds, deletedIdsTruncated };
  }

  async getStatuses(userId: string, cursor?: string, limit: number = 20, reader?: WireReader) {
    const now = new Date();
    const cursorData = cursor ? decodeCursor(cursor) : null;
    const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      getCommunityCoMemberIds(this.prisma, userId, this.cache),
    ]);
    const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
    const visibilityFilter = this.buildVisibilityFilter(userId, allContactIds, communityCoMemberIds);

    const whereClause: any = {
      deletedAt: NOT_DELETED,
      type: PostType.STATUS,
      AND: [
        visibilityFilter,
        { OR: [{ expiresAt: { isSet: false } }, { expiresAt: { equals: null } }, { expiresAt: { gt: now } }] },
      ],
    };

    if (cursorData) {
      whereClause.AND.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    const statuses = await this.prisma.post.findMany({
      where: whereClause,
      include: {
        author: { select: authorSelect },
        postMentions: postMentionInclude,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = statuses.length > limit;
    const items = (hasMore ? statuses.slice(0, limit) : statuses)
      .map((p) => withMentions(hoistLocationDeep(p), reader));
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    return { items, nextCursor, hasMore };
  }

  async getDiscoverStatuses(userId: string, cursor?: string, limit: number = 20, reader?: WireReader) {
    const now = new Date();
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      deletedAt: NOT_DELETED,
      type: PostType.STATUS,
      visibility: PostVisibility.PUBLIC,
      AND: [
        { OR: [{ expiresAt: { isSet: false } }, { expiresAt: { equals: null } }, { expiresAt: { gt: now } }] },
      ],
    };

    if (cursorData) {
      where.AND.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    const statuses = await this.prisma.post.findMany({
      where,
      include: {
        author: { select: authorSelect },
        postMentions: postMentionInclude,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = statuses.length > limit;
    const items = (hasMore ? statuses.slice(0, limit) : statuses)
      .map((p) => withMentions(hoistLocationDeep(p), reader));
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    return { items, nextCursor, hasMore };
  }

  /**
   * Thread Reels plein écran à scroll vertical continu.
   *
   * Déclenché quand l'utilisateur touche un réel dans le Feed : `seedReelId`
   * est ce réel, et le thread est classé par AFFINITÉ au seed (même auteur,
   * langue, @mentions communes) + affinité utilisateur (contacts, langues
   * lues) + popularité/fraîcheur, en faisant couler les réels déjà vus.
   * Sans seed (onglet Reels « Pour toi ») : affinité utilisateur seule.
   *
   * Le scoring vit dans `reelAffinityScore` (pur, testable) — point d'insertion
   * du moteur de reco/monétisation (watch-time via `PostView.duration`,
   * filtrage collaboratif, embeddings). Le contrat de pagination (curseur
   * opaque createdAt+id) reste stable quand le moteur remplacera le scoring.
   * Le retrieval reste chronologique (pool récent) : limite assumée de la
   * fondation, à upgrader avec le moteur.
   */
  async getReels(
    userId: string,
    opts: { seedReelId?: string; cursor?: string; limit?: number; reader?: WireReader } = {}
  ) {
    const { seedReelId, cursor, limit = 20 } = opts;
    // Chronological window + 1 probe row to detect `hasMore`, mirroring getFeed.
    // We deliberately do NOT over-fetch then drop: the cursor advances by
    // `createdAt`, so any candidate we fetch-but-drop (the old `limit * 4` pool)
    // would be silently skipped — or re-served as a duplicate — on the next
    // page, because the cursor was taken from the score-sorted last item rather
    // than the chronological boundary. Affinity ranking reorders *within* the
    // window only, which keeps infinite scroll lossless: every reel appears
    // exactly once. Same invariant as getFeed (see its Phase 1 comment).
    const candidatePoolSize = limit + 1;
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const [friendIds, dmContactIds, viewerLanguages, seed, communityCoMemberIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      this.getViewerLanguages(userId),
      seedReelId ? this.getReelSeed(seedReelId) : Promise.resolve(null),
      getCommunityCoMemberIds(this.prisma, userId, this.cache),
    ]);
    const contactIds = new Set([...friendIds, ...dmContactIds]);
    const visibilityFilter = this.buildVisibilityFilter(userId, [...contactIds], communityCoMemberIds);

    const andClauses: any[] = [
      visibilityFilter,
      // Thread de découverte : pas les réels de l'utilisateur lui-même.
      { authorId: { not: userId } },
    ];
    // Le seed est déjà affiché par le client (point d'entrée du thread).
    if (seedReelId) andClauses.push({ id: { not: seedReelId } });
    if (cursorData) {
      andClauses.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    const candidates = await this.prisma.post.findMany({
      where: { deletedAt: NOT_DELETED, type: PostType.REEL, AND: andClauses },
      include: feedPostInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: candidatePoolSize,
    });

    if (candidates.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    // The page is the chronological window (candidates arrive createdAt desc).
    // The cursor is the OLDEST reel of the shown window, captured BEFORE score
    // reordering, so the next page is strictly older — no skips, no duplicates.
    const hasMore = candidates.length > limit;
    const page = hasMore ? candidates.slice(0, limit) : candidates;
    const oldest = page[page.length - 1];
    const nextCursor = hasMore && oldest
      ? encodeCursor(oldest.createdAt, oldest.id)
      : null;

    const candidateIds = page.map((c) => c.id);
    const [seenReelIds, mentionsByPost] = await Promise.all([
      this.getSeenPostIds(userId, candidateIds),
      this.getMentionsByPost(candidateIds),
    ]);

    const ctx: ReelAffinityContext = {
      nowMs: Date.now(),
      viewerId: userId,
      contactIds,
      viewerLanguages,
      seenReelIds,
      seed,
    };

    // Score the window for display order only (cursor is fixed above).
    const scored = page
      .map((post) => ({
        post,
        score: reelAffinityScore(
          {
            id: post.id,
            authorId: post.authorId,
            originalLanguage: (post as any).originalLanguage ?? null,
            createdAt: post.createdAt,
            likeCount: post.likeCount ?? 0,
            commentCount: post.commentCount ?? 0,
            repostCount: post.repostCount ?? 0,
            bookmarkCount: post.bookmarkCount ?? 0,
            viewCount: post.viewCount ?? 0,
            mentionedUserIds: mentionsByPost.get(post.id) ?? [],
          },
          ctx
        ),
      }))
      .sort((a, b) => b.score - a.score);

    return {
      items: await this.enrichReelsForViewer(scored.map((s) => s.post), userId, opts.reader),
      nextCursor,
      hasMore,
    };
  }

  /** Enrichit des réels avec l'état viewer (réactions + like + favori). */
  private async enrichReelsForViewer(items: any[], viewerUserId: string, reader?: WireReader) {
    if (items.length === 0) return [];
    const postIds = items.map((p) => p.id);
    // Aligné sur `getFeed` PAR LE MÊME HELPER, et non par une recopie : la
    // version précédente disait déjà « aligné sur getFeed » tout en n'exposant
    // que `isBookmarkedByMe` — le rail du reel viewer ne pouvait donc pas
    // savoir que le lecteur avait déjà reposté.
    const [userReactionsMap, personalFlags] = await Promise.all([
      this.resolveUserReactionsMap(viewerUserId, items),
      this.resolvePersonalFlags(viewerUserId, postIds),
    ]);
    return items.map((p) => withMentions(hoistLocationDeep({
      ...this.enrichWithLikeStatus(p, userReactionsMap.get(p.id) ?? []),
      currentUserReactions: userReactionsMap.get(p.id) ?? [],
      ...this.personalFlagsFor(p.id, personalFlags),
    }), reader));
  }

  /** Langues que l'utilisateur lit (Prisme Linguistique). Best-effort. */
  private async getViewerLanguages(userId: string): Promise<Set<string>> {
    try {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          systemLanguage: true,
          regionalLanguage: true,
          customDestinationLanguage: true,
        },
      });
      const langs = [u?.systemLanguage, u?.regionalLanguage, u?.customDestinationLanguage]
        .filter((l): l is string => !!l && l.trim() !== '')
        .map((l) => normalizeLanguageForDedup(l));
      return new Set(langs);
    } catch {
      return new Set();
    }
  }

  /** Métadonnées du réel touché (auteur, langue, @mentions) pour la similitude. */
  private async getReelSeed(seedReelId: string): Promise<ReelSeed | null> {
    try {
      const [reel, mentions] = await Promise.all([
        this.prisma.post.findUnique({
          where: { id: seedReelId },
          select: { id: true, authorId: true, originalLanguage: true },
        }),
        this.prisma.postMention.findMany({
          where: { postId: seedReelId },
          select: { mentionedUserId: true },
        }),
      ]);
      if (!reel) return null;
      return {
        id: reel.id,
        authorId: reel.authorId,
        originalLanguage: reel.originalLanguage ?? null,
        mentionedUserIds: new Set(mentions.map((m) => m.mentionedUserId)),
      };
    } catch {
      return null;
    }
  }

  /** Réels déjà vus parmi un ensemble de candidats. Best-effort. */
  private async getSeenPostIds(userId: string, postIds: string[]): Promise<Set<string>> {
    if (postIds.length === 0) return new Set();
    try {
      const views = await this.prisma.postView.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      });
      return new Set(views.map((v) => v.postId));
    } catch {
      return new Set();
    }
  }

  /** @mentions par post pour un ensemble de candidats. Best-effort. */
  private async getMentionsByPost(postIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (postIds.length === 0) return map;
    try {
      const mentions = await this.prisma.postMention.findMany({
        where: { postId: { in: postIds } },
        select: { postId: true, mentionedUserId: true },
      });
      for (const m of mentions) {
        const list = map.get(m.postId) ?? [];
        list.push(m.mentionedUserId);
        map.set(m.postId, list);
      }
      return map;
    } catch {
      return map;
    }
  }

  async getUserPosts(targetUserId: string, viewerUserId: string | undefined, cursor?: string, limit: number = 20, reader?: WireReader) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      authorId: targetUserId,
      deletedAt: NOT_DELETED,
      type: { in: [PostType.POST, PostType.REEL] },
    };

    const andClauses: any[] = [];

    // Visibility gate. The author sees all of their own posts; an anonymous
    // viewer only PUBLIC; an authenticated non-author viewer sees PUBLIC plus
    // whatever the author shared with them (FRIENDS if a contact, COMMUNITY if a
    // co-member, ONLY/EXCEPT if targeted) — the same buildVisibilityFilter SSOT
    // used by every feed method. Hard-coding PUBLIC here previously hid an
    // author's friends-only posts from their actual friends.
    if (!viewerUserId) {
      where.visibility = PostVisibility.PUBLIC;
    } else if (viewerUserId !== targetUserId) {
      const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
        this.getFriendIds(viewerUserId),
        this.getDirectConversationContactIds(viewerUserId),
        getCommunityCoMemberIds(this.prisma, viewerUserId, this.cache),
      ]);
      const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
      andClauses.push(this.buildVisibilityFilter(viewerUserId, allContactIds, communityCoMemberIds));
    }

    if (cursorData) {
      andClauses.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    const posts = await this.prisma.post.findMany({
      where,
      include: feedPostInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    const noFlags = { bookmarkedIds: new Set<string>(), repostedIds: new Set<string>() };

    if (!viewerUserId || items.length === 0) {
      return {
        items: items.map((p) => withMentions(hoistLocationDeep({
          ...p,
          currentUserReactions: [] as string[],
          ...this.personalFlagsFor(p.id, noFlags),
        }), reader)),
        nextCursor,
        hasMore,
      };
    }

    const [userReactionsMap, personalFlags] = await Promise.all([
      this.resolveUserReactionsMap(viewerUserId, items),
      this.resolvePersonalFlags(viewerUserId, items.map((p) => p.id)),
    ]);

    return {
      items: items.map((p) => withMentions(hoistLocationDeep({
        ...this.enrichWithLikeStatus(p, userReactionsMap.get(p.id) ?? []),
        currentUserReactions: userReactionsMap.get(p.id) ?? [],
        ...this.personalFlagsFor(p.id, personalFlags),
      }), reader)),
      nextCursor,
      hasMore,
    };
  }

  async getCommunityFeed(communityId: string, viewerUserId: string | undefined, cursor?: string, limit: number = 20, reader?: WireReader) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // ACL : seuls les membres actifs voient les posts COMMUNITY ; un non-membre
    // (ou un viewer anonyme) est limité aux posts PUBLIC de la communauté.
    const isMember = viewerUserId
      ? await isActiveCommunityMember(this.prisma, viewerUserId, communityId)
      : false;

    const where: any = {
      communityId,
      deletedAt: NOT_DELETED,
      type: { in: [PostType.POST, PostType.REEL] },
      visibility: isMember ? { in: ['PUBLIC', 'COMMUNITY'] } : 'PUBLIC',
    };

    if (cursorData) {
      where.OR = [
        { createdAt: { lt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
      ];
    }

    const posts = await this.prisma.post.findMany({
      where,
      include: feedPostInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    if (!viewerUserId || items.length === 0) {
      return {
        items: items.map((p) => withMentions(hoistLocationDeep({
          ...p,
          currentUserReactions: [] as string[],
          ...this.personalFlagsFor(p.id, { bookmarkedIds: new Set<string>(), repostedIds: new Set<string>() }),
        }), reader)),
        nextCursor,
        hasMore,
      };
    }

    const [communityReactionsMap, communityFlags] = await Promise.all([
      this.resolveUserReactionsMap(viewerUserId, items),
      this.resolvePersonalFlags(viewerUserId, items.map((p) => p.id)),
    ]);

    return {
      items: items.map((p) => withMentions(hoistLocationDeep({
        ...this.enrichWithLikeStatus(p, communityReactionsMap.get(p.id) ?? []),
        currentUserReactions: communityReactionsMap.get(p.id) ?? [],
        ...this.personalFlagsFor(p.id, communityFlags),
      }), reader)),
      nextCursor,
      hasMore,
    };
  }

  async getBookmarks(userId: string, cursor?: string, limit: number = 20, reader?: WireReader) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = { userId };

    if (cursorData) {
      where.OR = [
        { createdAt: { lt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
      ];
    }

    const bookmarks = await this.prisma.postBookmark.findMany({
      where,
      include: {
        post: {
          include: feedPostInclude,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = bookmarks.length > limit;
    const items = hasMore ? bookmarks.slice(0, limit) : bookmarks;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    const posts = items.map((b) => b.post).filter((p) => p && !p.deletedAt);
    const [bookmarkReactionsMap, bookmarkFlags] = await Promise.all([
      this.resolveUserReactionsMap(userId, posts),
      this.resolvePersonalFlags(userId, posts.map((p) => p.id)),
    ]);

    return {
      // `isBookmarkedByMe: true` sans condition : la liste EST construite depuis
      // la table des favoris du lecteur. Servi explicitement quand même — un
      // client qui ne reçoit pas le champ le décode `false` et rendait l'écran
      // des favoris avec des signets ÉTEINTS. `isLikedByMe` manquait de même.
      items: posts.map((p) => withMentions(hoistLocationDeep({
        ...this.enrichWithLikeStatus(p, bookmarkReactionsMap.get(p.id) ?? []),
        currentUserReactions: bookmarkReactionsMap.get(p.id) ?? [],
        ...this.personalFlagsFor(p.id, bookmarkFlags),
        isBookmarkedByMe: true,
      }), reader)),
      nextCursor,
      hasMore,
    };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Flags d'action PERSONNELS d'un lot de posts : le favori et le repost DU
   * LECTEUR.
   *
   * `isLikedByMe` / `isBookmarkedByMe` / `isRepostedByMe` ne décrivent pas le
   * post — ils décrivent la relation du lecteur AU post. Ils n'ont donc de sens
   * que servis ENSEMBLE : un client qui en reçoit un et pas les autres décode
   * les absents en `false` (SDK : `isBookmarkedByMe ?? false`) et affiche
   * « pas en favori » d'un post qui l'est.
   *
   * Ce helper existe parce que la recopie de ces deux requêtes a produit la
   * divergence : le 2026-08-25, sur six méthodes servant des posts, seule
   * `getFeed` posait les trois flags. L'onglet Posts d'un profil n'annonçait ni
   * favori ni repost, et `getBookmarks` — la liste des favoris — ne disait pas
   * que ses propres posts étaient en favori. Toute nouvelle méthode servant des
   * posts passe par ici ; aucune ne réécrit la paire de requêtes.
   */
  private async resolvePersonalFlags(
    viewerUserId: string | undefined,
    postIds: string[],
  ): Promise<{ bookmarkedIds: Set<string>; repostedIds: Set<string> }> {
    if (!viewerUserId || postIds.length === 0) {
      return { bookmarkedIds: new Set(), repostedIds: new Set() };
    }

    const [userBookmarks, userReposts] = await Promise.all([
      this.prisma.postBookmark.findMany({
        where: { userId: viewerUserId, postId: { in: postIds } },
        select: { postId: true },
      }),
      // Un repost = un post dont le `repostOfId` est dans le lot ET dont
      // l'auteur est le lecteur.
      this.prisma.post.findMany({
        where: { authorId: viewerUserId, repostOfId: { in: postIds }, deletedAt: NOT_DELETED },
        select: { repostOfId: true },
      }),
    ]);

    return {
      bookmarkedIds: new Set(userBookmarks.map((b) => b.postId)),
      repostedIds: new Set(userReposts.map((r) => r.repostOfId).filter(Boolean) as string[]),
    };
  }

  /**
   * Projection des flags personnels sur UN post. Rend toujours les deux clés —
   * `false` explicite, jamais une clé absente : c'est l'absence, pas la valeur,
   * qui faisait mentir le client.
   */
  private personalFlagsFor(
    postId: string,
    flags: { bookmarkedIds: Set<string>; repostedIds: Set<string> },
  ): { isBookmarkedByMe: boolean; isRepostedByMe: boolean } {
    return {
      isBookmarkedByMe: flags.bookmarkedIds.has(postId),
      isRepostedByMe: flags.repostedIds.has(postId),
    };
  }

  /// G5 — délègue au filtre canonique unique (posts/postVisibility.ts).
  /// Audience feed = friends ∪ contacts DM (divergence assumée vs PostService,
  /// décision produit en attente — story-sota §4).
  private buildVisibilityFilter(viewerId: string, friendIds: string[], communityCoMemberIds: string[] = []) {
    return buildPostVisibilityOrFilter(viewerId, friendIds, communityCoMemberIds);
  }

  private async getDirectConversationContactIds(userId: string): Promise<string[]> {
    const cacheKey = `feed:contacts:${userId}`;
    if (this.cache) {
      const cached = await this.cache.get(cacheKey).catch(() => null);
      if (cached) return JSON.parse(cached) as string[];
    }
    try {
      const myMemberships = await this.prisma.participant.findMany({
        where: { userId, isActive: true, conversation: { type: 'direct' } },
        select: { conversationId: true },
      });
      const conversationIds = myMemberships.map((m) => m.conversationId);
      if (conversationIds.length === 0) {
        if (this.cache) await this.cache.set(cacheKey, '[]', FEED_SOCIAL_CACHE_TTL).catch(() => undefined);
        return [];
      }

      const otherMembers = await this.prisma.participant.findMany({
        where: {
          conversationId: { in: conversationIds },
          userId: { not: userId },
          isActive: true,
        },
        select: { userId: true },
      });
      const result = [...new Set(otherMembers.map((m) => m.userId).filter(Boolean) as string[])];
      if (this.cache) await this.cache.set(cacheKey, JSON.stringify(result), FEED_SOCIAL_CACHE_TTL).catch(() => undefined);
      return result;
    } catch {
      return [];
    }
  }

  private async getFriendIds(userId: string): Promise<string[]> {
    const cacheKey = `feed:friends:${userId}`;
    if (this.cache) {
      const cached = await this.cache.get(cacheKey).catch(() => null);
      if (cached) return JSON.parse(cached) as string[];
    }
    try {
      const friendRequests = await this.prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [
            { senderId: userId },
            { receiverId: userId },
          ],
        },
        select: { senderId: true, receiverId: true },
      });

      const result = friendRequests.map((f) =>
        f.senderId === userId ? f.receiverId : f.senderId
      );
      if (this.cache) await this.cache.set(cacheKey, JSON.stringify(result), FEED_SOCIAL_CACHE_TTL).catch(() => undefined);
      return result;
    } catch {
      return [];
    }
  }

  /// `isLikedByMe` dérive de la table `PostReaction` (via `currentUserReactions`),
  /// PAS du Json legacy `post.reactions` (jamais mis à jour par le chemin socket →
  /// `isLikedByMe` était faux après un like socket, et iOS lit `isLiked = isLikedByMe`).
  /// Source UNIQUE et alignée avec `currentUserReactions` que les surfaces lisent.
  private enrichWithLikeStatus(post: any, currentUserReactions: string[]) {
    return { ...post, isLikedByMe: currentUserReactions.length > 0 };
  }

  /**
   * Visibilité de la présence des AUTEURS d'une page de stories.
   *
   * Le régime se décide par AUTEUR, sur ce que ses stories de la page prouvent
   * du lien — c'est la question qui départage les deux régimes de la
   * passerelle (« le lecteur a-t-il un DROIT sur cette donnée, ou seulement un
   * lien qu'il a posé tout seul ? ») appliquée ici :
   *
   *  - une story PUBLIQUE ne prouve RIEN. `buildPostVisibilityOrFilter` porte
   *    `{ visibility: PUBLIC }` sans condition d'audience : n'importe quel
   *    compte authentifié la voit. Critère STRICT.
   *  - toute AUTRE visibilité prouve un lien posé des deux côtés — amitié,
   *    contact DM, co-appartenance de communauté, ou une désignation
   *    nominative par l'auteur (`ONLY`). Contexte acquis : préférences seules.
   *
   * Un auteur qui prouve le lien par UNE de ses stories le prouve pour toutes :
   * masquer sa présence sur sa story publique pendant qu'elle s'affiche sur sa
   * story d'amis, dans la même page, n'aurait aucun sens.
   *
   * Le viewer est construit en rôle `USER`, jamais celui de l'appelant : le fil
   * de stories est une surface de CONSOMMATION, pas de modération. Le bypass
   * modérateur n'y a rien à faire, et fixer le rôle garantit que ce gate ne
   * peut qu'en montrer MOINS.
   */
  private async resolveStoryAuthorPresence(
    stories: Array<Record<string, any>>,
    viewerId: string,
  ): Promise<Map<string, PresenceVisibility>> {
    const contextIds = new Set<string>();
    const publicOnlyIds = new Set<string>();
    for (const story of stories) {
      const authorId = story.author?.id as string | undefined;
      if (!authorId) continue;
      if (story.visibility === PostVisibility.PUBLIC && authorId !== viewerId) publicOnlyIds.add(authorId);
      else contextIds.add(authorId);
    }
    for (const id of contextIds) publicOnlyIds.delete(id);
    if (contextIds.size === 0 && publicOnlyIds.size === 0) return new Map();

    const presence = getPresenceVisibilityService(this.prisma);
    const [context, strict] = await Promise.all([
      contextIds.size > 0
        ? presence.resolvePrefsOnly([...contextIds])
        : Promise.resolve(new Map<string, PresenceVisibility>()),
      publicOnlyIds.size > 0
        ? presence.resolveForTargets({ userId: viewerId, role: 'USER' }, [...publicOnlyIds], {
            allowConversationContext: true,
          })
        : Promise.resolve(new Map<string, PresenceVisibility>()),
    ]);
    return new Map([...context, ...strict]);
  }

  /**
   * Réactions du viewer par post AFFICHÉ, en redirigeant vers la RACINE pour
   * un repost SIMPLE (chantier reposts cohérents & watermark, tâche 9) :
   * `isLikedByMe`/`currentUserReactions` d'un repost `isQuote:false`
   * reflètent l'état de l'utilisateur sur l'ORIGINAL
   * (`originalRepostOfId ?? repostOfId`), jamais sur le repost lui-même — un
   * repost simple n'a pas de vie sociale propre. Une citation garde son
   * propre état.
   *
   * Factorisé pour que les CINQ surfaces qui exposent ces flags (feed, réel
   * viewer, profil, communauté, favoris) appliquent EXACTEMENT la même
   * règle — celle dont dérive déjà `PostService.getPostById`, l'autre
   * chemin d'enrichissement gateway (mémoire projet « flags perso post = 2
   * chemins »). Deux reposts distincts du même original convergent
   * naturellement sur la même racine, donc affichent la même réaction —
   * même invariant d'idempotence que l'écriture (like/unlike).
   *
   * EXCLUSION ÉPHÉMÈRE (review task-9, critique #1, même garde que
   * `PostService.getPostById` et `resolveRedirectTarget` dans
   * postVisibility.ts) : quand `repostOf.type` est STORY/STATUS, ce repost
   * garde SA PROPRE réaction — sinon lecture (ce flag) et écriture
   * (like/unlike désormais posés sur le repost lui-même) divergeraient.
   * `repostOf.type` est déjà chargé par `feedPostInclude` (= `postInclude`)
   * sur les 5 surfaces appelantes — aucune requête supplémentaire.
   */
  private async resolveUserReactionsMap(
    viewerUserId: string,
    posts: ReadonlyArray<{
      id: string;
      isQuote?: boolean;
      repostOfId?: string | null;
      originalRepostOfId?: string | null;
      repostOf?: { type?: string | null } | null;
    }>,
  ): Promise<Map<string, string[]>> {
    if (posts.length === 0) return new Map();

    const targetIdByPostId = new Map<string, string>();
    for (const post of posts) {
      const repostRootIsEphemeral = post.repostOf != null
        && post.repostOf.type != null
        && isEphemeralPostType(post.repostOf.type as PostType);
      const isSimpleRepost = !post.isQuote && Boolean(post.repostOfId) && !repostRootIsEphemeral;
      targetIdByPostId.set(post.id, isSimpleRepost ? (post.originalRepostOfId ?? post.repostOfId!) : post.id);
    }

    const targetIds = [...new Set(targetIdByPostId.values())];
    const reactions = await this.prisma.postReaction.findMany({
      where: { userId: viewerUserId, postId: { in: targetIds } },
      select: { postId: true, emoji: true },
    });

    const byTargetId = new Map<string, string[]>();
    for (const r of reactions) {
      const list = byTargetId.get(r.postId) ?? [];
      list.push(r.emoji);
      byTargetId.set(r.postId, list);
    }

    const result = new Map<string, string[]>();
    for (const post of posts) {
      result.set(post.id, byTargetId.get(targetIdByPostId.get(post.id)!) ?? []);
    }
    return result;
  }

  private affinityScore(authorId: string, viewerId: string, friendIds: string[]): number {
    if (authorId === viewerId) return 0.8;
    if (friendIds.includes(authorId)) return 0.5;
    return 0;
  }

  /**
   * Profil d'intérêt du viewer → Map<authorId, affinité 0..1>.
   *
   * Capte l'intention réelle : quels créateurs le viewer consomme activement.
   * Les réactions et bookmarks récents révèlent l'intérêt bien mieux que le seul
   * graphe d'amis. Les bookmarks (intention de revenir) pèsent plus que les
   * réactions. L'affinité est saturée par échelle log pour qu'un créateur
   * ultra-engagé ne monopolise pas le feed.
   *
   * Dégradation gracieuse : toute erreur renvoie une Map vide (intérêt neutre).
   */
  private async getInterestAffinity(userId: string): Promise<Map<string, number>> {
    const cacheKey = `feed:interest:${userId}`;
    if (this.cache) {
      const cached = await this.cache.get(cacheKey).catch(() => null);
      if (cached) {
        try {
          return new Map(JSON.parse(cached) as [string, number][]);
        } catch {
          // cache corrompu — on recalcule
        }
      }
    }

    try {
      const [reactions, bookmarks] = await Promise.all([
        this.prisma.postReaction.findMany({
          where: { userId },
          select: { post: { select: { authorId: true } } },
          orderBy: { createdAt: 'desc' },
          take: INTEREST_REACTION_SAMPLE,
        }),
        this.prisma.postBookmark.findMany({
          where: { userId },
          select: { post: { select: { authorId: true } } },
          orderBy: { createdAt: 'desc' },
          take: INTEREST_BOOKMARK_SAMPLE,
        }),
      ]);

      const weights = new Map<string, number>();
      const tally = (rows: Array<{ post?: { authorId?: string | null } | null }>, weight: number) => {
        for (const row of rows) {
          const authorId = row.post?.authorId;
          if (!authorId || authorId === userId) continue;
          weights.set(authorId, (weights.get(authorId) ?? 0) + weight);
        }
      };
      tally(reactions as any[], 1);
      tally(bookmarks as any[], 2);

      const affinity = new Map<string, number>();
      for (const [authorId, weight] of weights) {
        affinity.set(authorId, Math.min(1, Math.log10(1 + weight) / INTEREST_NORMALIZER));
      }

      if (this.cache) {
        await this.cache
          .set(cacheKey, JSON.stringify([...affinity]), FEED_INTEREST_CACHE_TTL)
          .catch(() => undefined);
      }
      return affinity;
    } catch {
      return new Map();
    }
  }

  /**
   * Combien de fois chaque candidat est déjà remonté dans le feed du viewer.
   * Sert la fatigue d'impression : on dégrade ce qui a déjà été montré pour
   * renouveler le feed. Non caché (dépend du jeu de candidats courant et bouge
   * vite). Dégradation gracieuse : erreur → Map vide (aucune pénalité).
   */
  private async getSeenCounts(userId: string, postIds: string[]): Promise<Map<string, number>> {
    if (postIds.length === 0) return new Map();
    try {
      const grouped = await this.prisma.postImpression.groupBy({
        by: ['postId'],
        where: { userId, postId: { in: postIds } },
        _count: { postId: true },
      });
      const counts = new Map<string, number>();
      for (const row of grouped as Array<{ postId: string; _count?: { postId?: number } }>) {
        counts.set(row.postId, row._count?.postId ?? 0);
      }
      return counts;
    } catch {
      return new Map();
    }
  }
}
