import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';

function makeMockPrisma(overrides: Record<string, any> = {}) {
  return {
    post: { findMany: jest.fn().mockResolvedValue([]) },
    postView: { findMany: jest.fn().mockResolvedValue([]) },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
    participant: { findMany: jest.fn().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn() },
    ...overrides,
  } as any;
}

describe('PostFeedService COMMUNITY visibility', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makeMockPrisma();
    // getCommunityCoMemberIds: 1) communautés du viewer, 2) co-membres
    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'c1' }])
      .mockResolvedValueOnce([{ userId: 'co-1' }]);
  });

  it('getStories filters COMMUNITY posts to community co-members', async () => {
    const service = new PostFeedService(prisma);
    await service.getStories('viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    const orClauses = whereArg.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });

  it('getStatuses filters COMMUNITY posts to community co-members', async () => {
    const service = new PostFeedService(prisma);
    await service.getStatuses('viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    const orClauses = whereArg.AND[0].OR;
    expect(orClauses).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });
});
