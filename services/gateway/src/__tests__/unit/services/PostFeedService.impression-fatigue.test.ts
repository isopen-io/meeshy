/**
 * PostFeedService.getFeed — fatigue d'impression (revue de conformité O5, #10499)
 *
 * Rétrograder un post déjà vu est un classement PERSONNALISÉ : il n'a lieu
 * qu'avec le consentement d'analyse du lecteur. Extrait de
 * `PostFeedService.test.ts`, hors budget de taille (#4531).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

type Consent = { analyticsConsentAt: Date | null; dataProcessingConsentAt: Date | null };

const GRANTED: Consent = { analyticsConsentAt: new Date('2026-01-01'), dataProcessingConsentAt: new Date('2026-01-01') };
const WITHHELD: Consent = { analyticsConsentAt: null, dataProcessingConsentAt: null };

const AT = new Date(Date.now() - 60_000);
const recent = () => AT;

const makePost = (id: string, authorId: string) => ({
  id,
  authorId,
  type: 'POST',
  visibility: 'PUBLIC',
  content: 'Test post',
  reactions: [],
  reactionSummary: {},
  reactionCount: 0,
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  repostCount: 0,
  viewCount: 0,
  bookmarkCount: 0,
  isPinned: false,
  deletedAt: null,
  createdAt: recent(),
  expiresAt: null,
  author: { id: authorId, username: authorId, displayName: authorId, avatar: null },
  media: [],
  comments: [],
  repostOf: null,
});

const empty = () => jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]);

const prismaWith = (consent: Consent, posts: readonly unknown[], seenPostId: string) =>
  ({
    post: { findMany: jest.fn<() => Promise<unknown>>().mockResolvedValue(posts), findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
    postReaction: { findMany: empty() },
    friendRequest: { findMany: empty() },
    participant: { findMany: empty() },
    postView: { findMany: empty() },
    postBookmark: { findMany: empty() },
    postImpression: { groupBy: jest.fn<() => Promise<unknown>>().mockResolvedValue([{ postId: seenPostId, _count: { postId: 3 } }]) },
    user: {
      findUnique: jest.fn((args: { select?: Record<string, unknown> }) => Promise.resolve(args?.select?.analyticsConsentAt ? consent : null)),
      findMany: empty(),
    },
    postMention: { findMany: empty() },
  }) as unknown as PrismaClient;

const rankOf = (items: readonly unknown[]): string[] => items.map((item) => (item as { id: string }).id);

describe('PostFeedService.getFeed — fatigue d\'impression', () => {
  it('rétrograde un post déjà vu quand le lecteur a consenti à l\'analyse', async () => {
    const posts = [makePost('seen-1', 'a-seen'), makePost('fresh-1', 'a-fresh')];

    const result = await new PostFeedService(prismaWith(GRANTED, posts, 'seen-1')).getFeed('user-1');

    expect(rankOf(result.items)).toEqual(['fresh-1', 'seen-1']);
  });

  it('ne rétrograde rien sans consentement d\'analyse', async () => {
    const posts = [makePost('seen-1', 'a-seen'), makePost('fresh-1', 'a-fresh')];

    const result = await new PostFeedService(prismaWith(WITHHELD, posts, 'seen-1')).getFeed('user-1');

    expect(rankOf(result.items)).toEqual(['seen-1', 'fresh-1']);
  });
});
