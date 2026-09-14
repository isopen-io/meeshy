import { describe, it, expect, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { readShapeViolations } from './prisma-read-shape';

const makePrisma = (firstRead: unknown) => ({
  post: {
    findFirst: jest.fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce(firstRead)
      .mockResolvedValue(null),
    count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
  },
  postReaction: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
  postBookmark: { findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(null) },
  friendRequest: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
  communityMember: { findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
});

const readsOf = (prisma: ReturnType<typeof makePrisma>) =>
  prisma.post.findFirst.mock.calls.map((call) => call[0] as Record<string, unknown>);

describe('PostService.getPostById — la lecture du détail a une forme que Prisma accepte (#6503)', () => {
  it('le validateur refuse un scalaire passé sous include — le témoin peut tomber', () => {
    expect(readShapeViolations('Post', { include: { id: true } })).toEqual([
      'Post.include.id : scalaire interdit sous include',
    ]);
    expect(readShapeViolations('Post', { select: { id: true, author: { select: { username: true } } } })).toEqual([]);
  });

  it('les deux lectures du détail (audience puis référence) passent la validation du modèle', async () => {
    const prisma = makePrisma(null);
    const service = new PostService(prisma as never);

    await service.getPostById('6aa7bbf5a1b2c3d4e5f60718', 'viewer-1');

    const reads = readsOf(prisma);
    expect(reads).toHaveLength(2);
    reads.forEach((args) => expect(readShapeViolations('Post', args)).toEqual([]));
  });
});
