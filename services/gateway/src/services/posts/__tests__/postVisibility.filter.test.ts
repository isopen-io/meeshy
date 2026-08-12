/**
 * G5 — single source of truth for the Prisma visibility OR-filter.
 *
 * PostFeedService and PostService each carried a private copy of the same
 * 6-branch OR; drift between them is a content-leak / content-hole risk (the
 * documented G5 concern). This suite pins the canonical shape produced by
 * `buildPostVisibilityOrFilter` so both consumers stay aligned by import,
 * not by discipline.
 */

import { describe, it, expect } from '@jest/globals';
import { buildPostVisibilityOrFilter } from '../postVisibility';
import { PostVisibility } from '@meeshy/shared/prisma/client';

describe('buildPostVisibilityOrFilter (G5 canonical shape)', () => {
  const filter = buildPostVisibilityOrFilter('viewer-1', ['friend-a', 'friend-b'], ['co-member-x']);

  it('produces the 6 canonical branches in order', () => {
    expect(filter.OR).toHaveLength(6);
    expect(filter.OR[0]).toEqual({ authorId: 'viewer-1' });
    expect(filter.OR[1]).toEqual({ visibility: PostVisibility.PUBLIC });
    expect(filter.OR[2]).toEqual({
      visibility: PostVisibility.COMMUNITY,
      authorId: { in: ['co-member-x'] },
    });
    expect(filter.OR[3]).toEqual({
      visibility: PostVisibility.FRIENDS,
      authorId: { in: ['friend-a', 'friend-b'] },
    });
    expect(filter.OR[4]).toEqual({
      visibility: PostVisibility.EXCEPT,
      authorId: { in: ['friend-a', 'friend-b'] },
      NOT: { visibilityUserIds: { has: 'viewer-1' } },
    });
    expect(filter.OR[5]).toEqual({
      visibility: PostVisibility.ONLY,
      visibilityUserIds: { has: 'viewer-1' },
    });
  });

  it('defaults community co-members to an empty audience', () => {
    const noCommunity = buildPostVisibilityOrFilter('v', ['f']);
    expect(noCommunity.OR[2]).toEqual({
      visibility: PostVisibility.COMMUNITY,
      authorId: { in: [] },
    });
  });
});
