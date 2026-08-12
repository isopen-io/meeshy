/**
 * PostService.republishStory — la MÊME story repart avec une date de
 * publication fraîche (createdAt/expiresAt) et un engagement remis à zéro.
 * Aucune duplication de Post ni de PostMedia : c'est l'archive de l'auteur
 * (les stories ne sont plus jamais détruites) qui redevient publique.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PostService } from '../../../services/PostService';
import { EPHEMERAL_POST_TTL_HOURS } from '../../../services/posts/ephemeralPosts';

const AUTHOR = 'author-1';
const STORY_ID = '507f1f77bcf86cd799439aa1';

function makePrisma(overrides: { post?: Partial<Record<string, unknown>> } = {}) {
  const prisma: any = {
    post: {
      findFirst: jest.fn<any>()
        .mockResolvedValueOnce({ id: STORY_ID, authorId: AUTHOR, type: 'STORY' })
        .mockResolvedValue({ id: STORY_ID, authorId: AUTHOR, type: 'STORY', createdAt: new Date() }),
      update: jest.fn<any>().mockResolvedValue({ id: STORY_ID }),
      ...overrides.post,
    },
    postView: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    postReaction: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    postImpression: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  };
  prisma.$transaction = jest.fn<any>().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
  return prisma;
}

describe('PostService.republishStory', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PostService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new PostService(prisma);
  });

  it('refreshes createdAt and expiresAt to a full new public window', async () => {
    const before = Date.now();
    await service.republishStory(STORY_ID, AUTHOR);
    const after = Date.now();

    const data = (prisma.post.update as jest.Mock).mock.calls[0][0].data as {
      createdAt: Date; expiresAt: Date;
    };
    expect(data.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.createdAt.getTime()).toBeLessThanOrEqual(after);
    const ttlMs = EPHEMERAL_POST_TTL_HOURS.STORY * 3600_000;
    expect(data.expiresAt.getTime()).toBe(data.createdAt.getTime() + ttlMs);
  });

  it('zeroes engagement — counters, embedded mirrors AND relation rows', async () => {
    await service.republishStory(STORY_ID, AUTHOR);

    const data = (prisma.post.update as jest.Mock).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.viewCount).toBe(0);
    expect(data.reactionCount).toBe(0);
    expect(data.likeCount).toBe(0);
    expect(data.impressionCount).toBe(0);
    expect(data.reactionSummary).toEqual({});
    expect(data.reactions).toEqual([]);
    expect(data.storyViews).toEqual([]);
    expect(prisma.postView.deleteMany).toHaveBeenCalledWith({ where: { postId: STORY_ID } });
    expect(prisma.postReaction.deleteMany).toHaveBeenCalledWith({ where: { postId: STORY_ID } });
    expect(prisma.postImpression.deleteMany).toHaveBeenCalledWith({ where: { postId: STORY_ID } });
  });

  it('stamps contentEditedAt so clients drop their monotone viewed guard', async () => {
    await service.republishStory(STORY_ID, AUTHOR);

    const data = (prisma.post.update as jest.Mock).mock.calls[0][0].data as { contentEditedAt: Date };
    expect(data.contentEditedAt).toBeInstanceOf(Date);
  });

  it('rejects a non-author with FORBIDDEN', async () => {
    await expect(service.republishStory(STORY_ID, 'intruder')).rejects.toThrow('FORBIDDEN');
    expect(prisma.post.update).not.toHaveBeenCalled();
  });

  it('rejects a non-story with NOT_A_STORY', async () => {
    prisma.post.findFirst = jest.fn<any>().mockResolvedValue({ id: STORY_ID, authorId: AUTHOR, type: 'POST' });
    await expect(service.republishStory(STORY_ID, AUTHOR)).rejects.toThrow('NOT_A_STORY');
  });

  it('returns null for a missing (or hard-deleted) story', async () => {
    prisma.post.findFirst = jest.fn<any>().mockResolvedValue(null);
    await expect(service.republishStory(STORY_ID, AUTHOR)).resolves.toBeNull();
  });
});
