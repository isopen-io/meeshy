import { describe, it, expect, jest } from '@jest/globals';
import { PostVisibility } from '@meeshy/shared/prisma/client';
import {
  buildPostVisibilityWhere,
  buildAnonymousVisibilityWhere,
  canUserViewPost,
  type PostVisibilityRecord,
} from '../../../services/posts/postVisibility';

// ---------------------------------------------------------------------------
// Single source of truth for post visibility.
//
// The same policy is enforced in TWO shapes:
//   1. buildPostVisibilityWhere() — a Prisma `where` fragment applied at query
//      time (feed, stories, reels, single-post fetches).
//   2. canUserViewPost() — a post-hoc boolean ACL applied to an already-fetched
//      post (socket reaction handlers).
//
// Historically these lived as THREE hand-copied implementations (PostFeedService,
// PostService, postVisibility) whose OR-clauses drifted — a privacy-leak class of
// bug on the most-hit social surface. This suite pins both shapes to ONE truth
// table so any future divergence fails CI instead of leaking posts.
// ---------------------------------------------------------------------------

describe('buildPostVisibilityWhere', () => {
  const ctx = { viewerId: 'viewer-1', friendIds: ['friend-1'], communityCoMemberIds: ['co-1'] };

  it('emits the six canonical OR clauses (author, PUBLIC, COMMUNITY, FRIENDS, EXCEPT, ONLY)', () => {
    const where = buildPostVisibilityWhere(ctx);
    expect(where.OR).toEqual([
      { authorId: 'viewer-1' },
      { visibility: PostVisibility.PUBLIC },
      { visibility: PostVisibility.COMMUNITY, authorId: { in: ['co-1'] } },
      { visibility: PostVisibility.FRIENDS, authorId: { in: ['friend-1'] } },
      { visibility: PostVisibility.EXCEPT, authorId: { in: ['friend-1'] }, NOT: { visibilityUserIds: { has: 'viewer-1' } } },
      { visibility: PostVisibility.ONLY, visibilityUserIds: { has: 'viewer-1' } },
    ]);
  });
});

describe('buildAnonymousVisibilityWhere', () => {
  it('restricts an anonymous viewer to PUBLIC posts only', () => {
    expect(buildAnonymousVisibilityWhere()).toEqual({ visibility: PostVisibility.PUBLIC });
  });
});

// ---------------------------------------------------------------------------
// Cross-consistency: the query filter and the boolean ACL MUST agree.
//
// We evaluate the `where` OR fragment against a synthetic post using a minimal
// interpreter that understands exactly the operators the builder emits, then
// assert the result matches canUserViewPost() for the same relationship state.
// ---------------------------------------------------------------------------

type Post = PostVisibilityRecord;

function whereAllows(
  where: { OR: any[] },
  post: Post,
  ctx: { viewerId: string; friendIds: string[]; communityCoMemberIds: string[] },
): boolean {
  const matchesClause = (clause: any): boolean =>
    Object.entries(clause).every(([key, cond]) => {
      if (key === 'authorId') {
        if (typeof cond === 'string') return post.authorId === cond;
        if (cond && typeof cond === 'object' && 'in' in cond) return (cond.in as string[]).includes(post.authorId);
        return false;
      }
      if (key === 'visibility') return post.visibility === cond;
      if (key === 'visibilityUserIds') {
        const has = (cond as { has: string }).has;
        return post.visibilityUserIds.includes(has);
      }
      if (key === 'NOT') return !matchesClause(cond);
      return false;
    });
  return where.OR.some(matchesClause);
}

function makePrisma(opts: { areFriends: boolean; shareCommunity: boolean }) {
  return {
    friendRequest: {
      findFirst: jest.fn().mockResolvedValue(opts.areFriends ? { id: 'fr-1' } : null),
    },
    communityMember: {
      findMany: jest.fn().mockResolvedValue(opts.shareCommunity ? [{ communityId: 'c1' }] : []),
      findFirst: jest.fn().mockResolvedValue(opts.shareCommunity ? { id: 'cm-1' } : null),
    },
  } as any;
}

describe('canUserViewPost ⇄ buildPostVisibilityWhere agree on the full matrix', () => {
  const viewerId = 'viewer-1';
  const authorId = 'author-1';
  const relationships = [
    { areFriends: false, shareCommunity: false },
    { areFriends: true, shareCommunity: false },
    { areFriends: false, shareCommunity: true },
    { areFriends: true, shareCommunity: true },
  ];
  const visibilities = [
    PostVisibility.PUBLIC,
    PostVisibility.PRIVATE,
    PostVisibility.FRIENDS,
    PostVisibility.COMMUNITY,
    PostVisibility.ONLY,
    PostVisibility.EXCEPT,
  ];
  const listStates: Array<{ label: string; ids: string[] }> = [
    { label: 'viewer NOT in visibilityUserIds', ids: [] },
    { label: 'viewer IN visibilityUserIds', ids: [viewerId] },
  ];

  for (const rel of relationships) {
    for (const visibility of visibilities) {
      for (const list of listStates) {
        it(`viewer(friends=${rel.areFriends},community=${rel.shareCommunity}) vs ${visibility} (${list.label})`, async () => {
          const post: Post = { authorId, visibility, visibilityUserIds: list.ids };
          const boolAllowed = await canUserViewPost(makePrisma(rel), post, viewerId);

          const ctx = {
            viewerId,
            friendIds: rel.areFriends ? [authorId] : [],
            communityCoMemberIds: rel.shareCommunity ? [authorId] : [],
          };
          const whereAllowed = whereAllows(buildPostVisibilityWhere(ctx), post, ctx);

          expect(whereAllowed).toBe(boolAllowed);
        });
      }
    }
  }

  it('always shows the author their own post regardless of visibility', async () => {
    for (const visibility of visibilities) {
      const post: Post = { authorId: viewerId, visibility, visibilityUserIds: [] };
      expect(await canUserViewPost(makePrisma({ areFriends: false, shareCommunity: false }), post, viewerId)).toBe(true);
      const ctx = { viewerId, friendIds: [], communityCoMemberIds: [] };
      expect(whereAllows(buildPostVisibilityWhere(ctx), post, ctx)).toBe(true);
    }
  });
});
