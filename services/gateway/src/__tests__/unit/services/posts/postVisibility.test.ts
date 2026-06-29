// @jest-environment node

import { describe, it, expect, jest } from '@jest/globals';
import { canUserViewPost } from '../../../../services/posts/postVisibility';
import type { PostVisibilityRecord } from '../../../../services/posts/postVisibility';

// ---------------------------------------------------------------------------
// Prisma mock factory
// ---------------------------------------------------------------------------

function makePrisma(overrides: {
  communityMemberFindMany?: () => Promise<unknown[]>;
  communityMemberFindFirst?: () => Promise<unknown>;
  friendRequestFindFirst?: () => Promise<unknown>;
} = {}) {
  return {
    communityMember: {
      findMany: jest.fn().mockImplementation(
        overrides.communityMemberFindMany ?? (() => Promise.resolve([])),
      ),
      findFirst: jest.fn().mockImplementation(
        overrides.communityMemberFindFirst ?? (() => Promise.resolve(null)),
      ),
    },
    friendRequest: {
      findFirst: jest.fn().mockImplementation(
        overrides.friendRequestFindFirst ?? (() => Promise.resolve(null)),
      ),
    },
  } as unknown as Parameters<typeof canUserViewPost>[0];
}

// ---------------------------------------------------------------------------
// Post record factory helpers
// ---------------------------------------------------------------------------

function makePost(overrides: Partial<PostVisibilityRecord> = {}): PostVisibilityRecord {
  return {
    authorId: 'author-1',
    visibility: 'PUBLIC' as PostVisibilityRecord['visibility'],
    visibilityUserIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// canUserViewPost — author shortcut
// ---------------------------------------------------------------------------

describe('canUserViewPost — author is always allowed', () => {
  it('returns true when userId equals authorId regardless of visibility', async () => {
    const prisma = makePrisma();
    const post = makePost({
      authorId: 'author-1',
      visibility: 'PRIVATE' as PostVisibilityRecord['visibility'],
    });

    const result = await canUserViewPost(prisma, post, 'author-1');

    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PUBLIC
// ---------------------------------------------------------------------------

describe('canUserViewPost — PUBLIC', () => {
  it('returns true for any viewer', async () => {
    const prisma = makePrisma();
    const post = makePost({ visibility: 'PUBLIC' as PostVisibilityRecord['visibility'] });

    const result = await canUserViewPost(prisma, post, 'stranger-99');

    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PRIVATE
// ---------------------------------------------------------------------------

describe('canUserViewPost — PRIVATE', () => {
  it('returns false for a non-author', async () => {
    const prisma = makePrisma();
    const post = makePost({ visibility: 'PRIVATE' as PostVisibilityRecord['visibility'] });

    const result = await canUserViewPost(prisma, post, 'user-x');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ONLY
// ---------------------------------------------------------------------------

describe('canUserViewPost — ONLY', () => {
  it('returns true when userId is in visibilityUserIds', async () => {
    const prisma = makePrisma();
    const post = makePost({
      visibility: 'ONLY' as PostVisibilityRecord['visibility'],
      visibilityUserIds: ['user-a', 'user-b'],
    });

    const result = await canUserViewPost(prisma, post, 'user-a');

    expect(result).toBe(true);
  });

  it('returns false when userId is not in visibilityUserIds', async () => {
    const prisma = makePrisma();
    const post = makePost({
      visibility: 'ONLY' as PostVisibilityRecord['visibility'],
      visibilityUserIds: ['user-a', 'user-b'],
    });

    const result = await canUserViewPost(prisma, post, 'user-c');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// COMMUNITY
// ---------------------------------------------------------------------------

describe('canUserViewPost — COMMUNITY', () => {
  it('returns true when viewer shares a community with the author', async () => {
    // author-1 is in c1; viewer-1 is also in c1
    const prisma = makePrisma({
      communityMemberFindMany: () =>
        Promise.resolve([{ communityId: 'c1' }]),
      communityMemberFindFirst: () =>
        Promise.resolve({ id: 'member-viewer' }),
    });
    const post = makePost({ visibility: 'COMMUNITY' as PostVisibilityRecord['visibility'] });

    const result = await canUserViewPost(prisma, post, 'viewer-1');

    expect(result).toBe(true);
  });

  it('returns false when viewer shares no community with the author', async () => {
    // author-1 has no memberships
    const prisma = makePrisma({
      communityMemberFindMany: () => Promise.resolve([]),
    });
    const post = makePost({ visibility: 'COMMUNITY' as PostVisibilityRecord['visibility'] });

    const result = await canUserViewPost(prisma, post, 'viewer-1');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FRIENDS
// ---------------------------------------------------------------------------

describe('canUserViewPost — FRIENDS', () => {
  it('returns true when a friendship is found', async () => {
    const prisma = makePrisma({
      friendRequestFindFirst: () => Promise.resolve({ id: 'friendship-1' }),
    });
    const post = makePost({ visibility: 'FRIENDS' as PostVisibilityRecord['visibility'] });

    const result = await canUserViewPost(prisma, post, 'friend-user');

    expect(result).toBe(true);
  });

  it('returns false when no friendship exists', async () => {
    const prisma = makePrisma({
      friendRequestFindFirst: () => Promise.resolve(null),
    });
    const post = makePost({ visibility: 'FRIENDS' as PostVisibilityRecord['visibility'] });

    const result = await canUserViewPost(prisma, post, 'stranger-user');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EXCEPT
// ---------------------------------------------------------------------------

describe('canUserViewPost — EXCEPT', () => {
  it('returns true when viewer is a friend and not in the exclusion list', async () => {
    const prisma = makePrisma({
      friendRequestFindFirst: () => Promise.resolve({ id: 'friendship-1' }),
    });
    const post = makePost({
      visibility: 'EXCEPT' as PostVisibilityRecord['visibility'],
      visibilityUserIds: ['excluded-user'],
    });

    const result = await canUserViewPost(prisma, post, 'friend-not-excluded');

    expect(result).toBe(true);
  });

  it('returns false when viewer is a friend but is in the exclusion list', async () => {
    const prisma = makePrisma({
      friendRequestFindFirst: () => Promise.resolve({ id: 'friendship-1' }),
    });
    const post = makePost({
      visibility: 'EXCEPT' as PostVisibilityRecord['visibility'],
      visibilityUserIds: ['excluded-friend'],
    });

    const result = await canUserViewPost(prisma, post, 'excluded-friend');

    expect(result).toBe(false);
  });

  it('returns false when viewer is not a friend regardless of exclusion list', async () => {
    const prisma = makePrisma({
      friendRequestFindFirst: () => Promise.resolve(null),
    });
    const post = makePost({
      visibility: 'EXCEPT' as PostVisibilityRecord['visibility'],
      visibilityUserIds: [],
    });

    const result = await canUserViewPost(prisma, post, 'non-friend');

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unknown / default visibility
// ---------------------------------------------------------------------------

describe('canUserViewPost — unknown visibility', () => {
  it('returns false for an unrecognised visibility value', async () => {
    const prisma = makePrisma();
    const post = makePost({
      visibility: 'UNKNOWN_FUTURE_VALUE' as PostVisibilityRecord['visibility'],
    });

    const result = await canUserViewPost(prisma, post, 'user-x');

    expect(result).toBe(false);
  });
});
