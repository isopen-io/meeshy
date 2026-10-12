/**
 * Tests — PostService.recordAnonymousOpen
 * v1 "comptage bête" : 1ᵉʳ (postId, sessionKey) → +1 postOpenCount ; doublon
 * (P2002) → no-op ; post non public / introuvable → no-op.
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PostService } from '../services/PostService';
import { counterWrite, postCounterWritesOf } from './helpers/posts-counter-writes';

const POST_A = '507f1f77bcf86cd799439011';

const buildPrisma = (over: Partial<Record<string, unknown>> = {}) => {
  const post = {
    findFirst: jest.fn<(arg?: unknown) => Promise<{ id: string } | null>>()
      .mockResolvedValue({ id: POST_A }),
    update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
  };
  const anonymousPostOpen = {
    create: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({ id: 'x' }),
  };
  const $runCommandRaw = jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({ ok: 1 });
  const prisma = { post, anonymousPostOpen, $runCommandRaw, ...over };
  return prisma as unknown as ConstructorParameters<typeof PostService>[0] & {
    post: typeof post; anonymousPostOpen: typeof anonymousPostOpen; $runCommandRaw: typeof $runCommandRaw;
  };
};

const makeService = (prisma: ReturnType<typeof buildPrisma>) =>
  new PostService(prisma as unknown as ConstructorParameters<typeof PostService>[0]);

describe('PostService.recordAnonymousOpen', () => {
  it('compte la 1ʳᵉ ouverture (insert) et incrémente postOpenCount', async () => {
    const prisma = buildPrisma();
    const counted = await makeService(prisma).recordAnonymousOpen(POST_A, 'sess-1');
    expect(counted).toBe(true);
    expect(prisma.anonymousPostOpen.create).toHaveBeenCalledTimes(1);
    expect(postCounterWritesOf(prisma.$runCommandRaw)).toEqual([counterWrite([POST_A], { postOpenCount: { increment: 1 } })]);
  });

  it('ne recompte pas un doublon (P2002) — no-op', async () => {
    const prisma = buildPrisma({
      anonymousPostOpen: {
        create: jest.fn<(arg?: unknown) => Promise<unknown>>()
          .mockRejectedValue(Object.assign(new Error('Unique'), { code: 'P2002' })),
      },
    });
    const counted = await makeService(prisma).recordAnonymousOpen(POST_A, 'sess-1');
    expect(counted).toBe(false);
    expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
  });

  it('ne compte pas un post non public / introuvable', async () => {
    const prisma = buildPrisma({
      post: {
        findFirst: jest.fn<(arg?: unknown) => Promise<null>>().mockResolvedValue(null),
        update: jest.fn<(arg?: unknown) => Promise<unknown>>().mockResolvedValue({}),
      },
    });
    const counted = await makeService(prisma).recordAnonymousOpen(POST_A, 'sess-1');
    expect(counted).toBe(false);
    expect(prisma.anonymousPostOpen.create).not.toHaveBeenCalled();
    expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
  });
});
