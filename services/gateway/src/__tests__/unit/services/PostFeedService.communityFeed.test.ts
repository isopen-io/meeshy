import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostFeedService } from '../../../services/PostFeedService';

function makeMockPrisma() {
  return {
    post: { findMany: jest.fn().mockResolvedValue([]) },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    communityMember: { findFirst: jest.fn() },
  } as any;
}

describe('PostFeedService.getCommunityFeed ACL', () => {
  let prisma: any;
  beforeEach(() => { prisma = makeMockPrisma(); });

  it('a member sees PUBLIC + COMMUNITY posts', async () => {
    prisma.communityMember.findFirst.mockResolvedValue({ id: 'm1' });
    const service = new PostFeedService(prisma);
    await service.getCommunityFeed('c1', 'viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    expect(whereArg.visibility).toEqual({ in: ['PUBLIC', 'COMMUNITY'] });
  });

  it('a non-member sees only PUBLIC posts', async () => {
    prisma.communityMember.findFirst.mockResolvedValue(null);
    const service = new PostFeedService(prisma);
    await service.getCommunityFeed('c1', 'viewer-1');
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    expect(whereArg.visibility).toBe('PUBLIC');
  });

  it('an anonymous viewer sees only PUBLIC posts', async () => {
    const service = new PostFeedService(prisma);
    await service.getCommunityFeed('c1', undefined);
    const whereArg = prisma.post.findMany.mock.calls[0][0].where;
    expect(whereArg.visibility).toBe('PUBLIC');
  });
});
