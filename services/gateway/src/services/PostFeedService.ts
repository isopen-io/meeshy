import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostVisibility, PostType } from '@meeshy/shared/prisma/client';
import { decodeCursor, encodeCursor } from '../routes/posts/types';
import { authorSelect, postInclude, NOT_DELETED } from './posts/postIncludes';
import {
  reelAffinityScore,
  type ReelAffinityContext,
  type ReelSeed,
} from './posts/reelAffinity';
import type { CacheStore } from './CacheStore';
import { getCommunityCoMemberIds, isActiveCommunityMember } from './posts/communityVisibility';

const FEED_SOCIAL_CACHE_TTL = 300; // 5 min — friend lists change infrequently

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
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache?: CacheStore
  ) {}

  /**
   * Main feed with recommendation scoring.
   * Phase 1: Fetch candidates from DB (3x limit)
   * Phase 2: Score & rank in-app
   */
  async getFeed(userId: string, cursor?: string, limit: number = 20) {
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
    const [userReactions, userBookmarks, userReposts] = postIds.length > 0
      ? await Promise.all([
          this.prisma.postReaction.findMany({
            where: { userId, postId: { in: postIds } },
            select: { postId: true, emoji: true },
          }),
          this.prisma.postBookmark.findMany({
            where: { userId, postId: { in: postIds } },
            select: { postId: true },
          }),
          // A repost is any post whose `repostOfId` is in our candidate
          // set AND whose author is the viewer. Drives the "I've already
          // reposted this" green icon on the feed.
          this.prisma.post.findMany({
            where: { authorId: userId, repostOfId: { in: postIds }, deletedAt: NOT_DELETED },
            select: { repostOfId: true },
          }),
        ])
      : [[], [], []];
    const userReactionsMap = new Map<string, string[]>();
    for (const r of userReactions) {
      const list = userReactionsMap.get(r.postId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.postId, list);
    }
    const bookmarkedIds = new Set(userBookmarks.map((b) => b.postId));
    const repostedIds = new Set(userReposts.map((r) => r.repostOfId).filter(Boolean) as string[]);

    return {
      items: items.map((s) => ({
        ...this.enrichWithLikeStatus(s.post, userReactionsMap.get(s.post.id) ?? []),
        currentUserReactions: userReactionsMap.get(s.post.id) ?? [],
        isBookmarkedByMe: bookmarkedIds.has(s.post.id),
        isRepostedByMe: repostedIds.has(s.post.id),
      })),
      nextCursor,
      hasMore,
    };
  }

  async getStories(userId: string) {
    const now = new Date();
    const [friendIds, dmContactIds, communityCoMemberIds] = await Promise.all([
      this.getFriendIds(userId),
      this.getDirectConversationContactIds(userId),
      getCommunityCoMemberIds(this.prisma, userId, this.cache),
    ]);
    const allContactIds = [...new Set([...friendIds, ...dmContactIds])];
    const visibilityFilter = this.buildVisibilityFilter(userId, allContactIds, communityCoMemberIds);

    const where: any = {
      deletedAt: NOT_DELETED,
      type: PostType.STORY,
      AND: [
        visibilityFilter,
        { OR: [{ expiresAt: { isSet: false } }, { expiresAt: { equals: null } }, { expiresAt: { gt: now } }] },
      ],
    };

    const stories = await this.prisma.post.findMany({
      where,
      include: feedPostInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const storyIds = stories.map((s) => s.id);
    const [viewedRows, userReactions] = storyIds.length > 0
      ? await Promise.all([
          this.prisma.postView.findMany({
            where: { postId: { in: storyIds }, userId },
            select: { postId: true },
          }),
          this.prisma.postReaction.findMany({
            where: { userId, postId: { in: storyIds } },
            select: { postId: true, emoji: true },
          }),
        ])
      : [[], []];
    const viewedSet = new Set(viewedRows.map((v) => v.postId));
    const userReactionsMap = new Map<string, string[]>();
    for (const r of userReactions) {
      const list = userReactionsMap.get(r.postId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.postId, list);
    }

    return stories.map((s) => ({
      ...this.enrichWithLikeStatus(s, userReactionsMap.get(s.id) ?? []),
      isViewedByMe: viewedSet.has(s.id),
      currentUserReactions: userReactionsMap.get(s.id) ?? [],
    }));
  }

  async getStatuses(userId: string, cursor?: string, limit: number = 20) {
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
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = statuses.length > limit;
    const items = hasMore ? statuses.slice(0, limit) : statuses;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    return { items, nextCursor, hasMore };
  }

  async getDiscoverStatuses(userId: string, cursor?: string, limit: number = 20) {
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
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = statuses.length > limit;
    const items = hasMore ? statuses.slice(0, limit) : statuses;
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
    opts: { seedReelId?: string; cursor?: string; limit?: number } = {}
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
      items: await this.enrichReelsForViewer(scored.map((s) => s.post), userId),
      nextCursor,
      hasMore,
    };
  }

  /** Enrichit des réels avec l'état viewer (réactions + like + favori). */
  private async enrichReelsForViewer(items: any[], viewerUserId: string) {
    if (items.length === 0) return [];
    const postIds = items.map((p) => p.id);
    // Aligné sur `getFeed` : on récupère AUSSI les favoris du viewer pour exposer
    // `isBookmarkedByMe`. Sans lui, le reel viewer ne pouvait pas réhydrater l'état
    // favori → le bookmark « disparaissait » à la réouverture.
    const [userReactions, userBookmarks] = await Promise.all([
      this.prisma.postReaction.findMany({
        where: { userId: viewerUserId, postId: { in: postIds } },
        select: { postId: true, emoji: true },
      }),
      this.prisma.postBookmark.findMany({
        where: { userId: viewerUserId, postId: { in: postIds } },
        select: { postId: true },
      }),
    ]);
    const userReactionsMap = new Map<string, string[]>();
    for (const r of userReactions) {
      const list = userReactionsMap.get(r.postId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.postId, list);
    }
    const bookmarkedIds = new Set(userBookmarks.map((b) => b.postId));
    return items.map((p) => ({
      ...this.enrichWithLikeStatus(p, userReactionsMap.get(p.id) ?? []),
      currentUserReactions: userReactionsMap.get(p.id) ?? [],
      isBookmarkedByMe: bookmarkedIds.has(p.id),
    }));
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
        .filter((l): l is string => !!l && l.trim() !== '');
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

  async getUserPosts(targetUserId: string, viewerUserId: string | undefined, cursor?: string, limit: number = 20) {
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

    if (!viewerUserId || items.length === 0) {
      return {
        items: items.map((p) => ({ ...p, currentUserReactions: [] as string[] })),
        nextCursor,
        hasMore,
      };
    }

    const postIds = items.map((p) => p.id);
    const userReactions = await this.prisma.postReaction.findMany({
      where: { userId: viewerUserId, postId: { in: postIds } },
      select: { postId: true, emoji: true },
    });
    const userReactionsMap = new Map<string, string[]>();
    for (const r of userReactions) {
      const list = userReactionsMap.get(r.postId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.postId, list);
    }

    return {
      items: items.map((p) => ({
        ...this.enrichWithLikeStatus(p, userReactionsMap.get(p.id) ?? []),
        currentUserReactions: userReactionsMap.get(p.id) ?? [],
      })),
      nextCursor,
      hasMore,
    };
  }

  async getCommunityFeed(communityId: string, viewerUserId: string | undefined, cursor?: string, limit: number = 20) {
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
        items: items.map((p) => ({ ...p, currentUserReactions: [] as string[] })),
        nextCursor,
        hasMore,
      };
    }

    const communityPostIds = items.map((p) => p.id);
    const communityUserReactions = await this.prisma.postReaction.findMany({
      where: { userId: viewerUserId, postId: { in: communityPostIds } },
      select: { postId: true, emoji: true },
    });
    const communityReactionsMap = new Map<string, string[]>();
    for (const r of communityUserReactions) {
      const list = communityReactionsMap.get(r.postId) ?? [];
      list.push(r.emoji);
      communityReactionsMap.set(r.postId, list);
    }

    return {
      items: items.map((p) => ({
        ...this.enrichWithLikeStatus(p, communityReactionsMap.get(p.id) ?? []),
        currentUserReactions: communityReactionsMap.get(p.id) ?? [],
      })),
      nextCursor,
      hasMore,
    };
  }

  async getBookmarks(userId: string, cursor?: string, limit: number = 20) {
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
    const bookmarkPostIds = posts.map((p) => p.id);
    const bookmarkUserReactions = bookmarkPostIds.length > 0
      ? await this.prisma.postReaction.findMany({
          where: { userId, postId: { in: bookmarkPostIds } },
          select: { postId: true, emoji: true },
        })
      : [];
    const bookmarkReactionsMap = new Map<string, string[]>();
    for (const r of bookmarkUserReactions) {
      const list = bookmarkReactionsMap.get(r.postId) ?? [];
      list.push(r.emoji);
      bookmarkReactionsMap.set(r.postId, list);
    }

    return {
      items: posts.map((p) => ({ ...p, currentUserReactions: bookmarkReactionsMap.get(p.id) ?? [] })),
      nextCursor,
      hasMore,
    };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private buildVisibilityFilter(viewerId: string, friendIds: string[], communityCoMemberIds: string[] = []) {
    return {
      OR: [
        { authorId: viewerId },
        { visibility: PostVisibility.PUBLIC },
        { visibility: PostVisibility.COMMUNITY, authorId: { in: communityCoMemberIds } },
        { visibility: PostVisibility.FRIENDS, authorId: { in: friendIds } },
        { visibility: PostVisibility.EXCEPT, authorId: { in: friendIds }, NOT: { visibilityUserIds: { has: viewerId } } },
        { visibility: PostVisibility.ONLY, visibilityUserIds: { has: viewerId } },
      ],
    };
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
