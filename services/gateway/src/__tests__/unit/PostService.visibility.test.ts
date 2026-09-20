import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostService } from '../../services/PostService';

function makeMockPrisma() {
  return {
    /* #7184 — les deux lectures de `getBlockRelatedUserIds` : « qui m'a bloqué »
       et « qui j'ai bloqué ». La garde de blocage traverse désormais
       `buildVisibilityFilter`, donc tout double qui compose un `where` de post
       doit les servir — un double muet ferait rougir la garde, pas le code. */
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ blockedUserIds: [] }),
    } as any,
    post: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    postReaction: { findMany: jest.fn().mockResolvedValue([]) },
    postBookmark: { findFirst: jest.fn().mockResolvedValue(null) },
    friendRequest: { findMany: jest.fn().mockResolvedValue([]) },
    communityMember: { findMany: jest.fn() },
  } as any;
}

describe('PostService.getPostById COMMUNITY visibility', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = makeMockPrisma();
    prisma.communityMember.findMany
      .mockResolvedValueOnce([{ communityId: 'c1' }])
      .mockResolvedValueOnce([{ userId: 'co-1' }]);
  });

  it('includes a COMMUNITY clause scoped to co-members in the where filter', async () => {
    const service = new PostService(prisma);
    await service.getPostById('post-1', 'viewer-1');
    const whereArg = prisma.post.findFirst.mock.calls[0][0].where;
    expect(whereArg.OR).toContainEqual({ visibility: 'COMMUNITY', authorId: { in: ['co-1'] } });
  });
});
