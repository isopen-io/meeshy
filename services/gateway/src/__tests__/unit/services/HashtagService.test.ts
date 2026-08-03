import { describe, it, expect, jest } from '@jest/globals';
import { HashtagService } from '../../../services/HashtagService';

describe('HashtagService.extractHashtags', () => {
  const service = new HashtagService({} as any);

  it('test_extractHashtags_findsASingleHashtag', () => {
    expect(service.extractHashtags('Belle journée #paris aujourd\'hui'))
      .toEqual([{ tag: 'paris', display: '#paris' }]);
  });

  it('test_extractHashtags_lowercasesTheMatchingTagButKeepsDisplayCasing', () => {
    expect(service.extractHashtags('#Paris est belle'))
      .toEqual([{ tag: 'paris', display: '#Paris' }]);
  });

  it('test_extractHashtags_allowsUnicodeLetters', () => {
    expect(service.extractHashtags('#été à #café'))
      .toEqual([{ tag: 'été', display: '#été' }, { tag: 'café', display: '#café' }]);
  });

  it('test_extractHashtags_deduplicatesByTag_firstDisplayWins', () => {
    expect(service.extractHashtags('#Paris et encore #paris'))
      .toEqual([{ tag: 'paris', display: '#Paris' }]);
  });

  it('test_extractHashtags_ignoresHashInsideAWord', () => {
    expect(service.extractHashtags('C#paris')).toEqual([]);
  });

  it('test_extractHashtags_ignoresUrlFragment', () => {
    expect(service.extractHashtags('Voir https://exemple.com/#section'))
      .toEqual([]);
  });

  it('test_extractHashtags_rejectsHyphens_stopsAtTheHyphen', () => {
    expect(service.extractHashtags('#paris-2026'))
      .toEqual([{ tag: 'paris', display: '#paris' }]);
  });

  it('test_extractHashtags_emptyContent_returnsEmpty', () => {
    expect(service.extractHashtags('')).toEqual([]);
  });

  it('test_extractHashtags_tooLong_returnsEmpty', () => {
    expect(service.extractHashtags('#a '.repeat(4000))).toEqual([]);
  });

  it('test_extractHashtags_capsAtMaxHashtagsPerPost', () => {
    const content = Array.from({ length: 40 }, (_, i) => `#tag${i}`).join(' ');
    expect(service.extractHashtags(content)).toHaveLength(30);
  });

  it('test_extractHashtags_singleCharTooShortIsStillValid', () => {
    expect(service.extractHashtags('#a')).toEqual([{ tag: 'a', display: '#a' }]);
  });
});

describe('HashtagService.createPostHashtags', () => {
  function buildPrisma(overrides: Record<string, unknown> = {}) {
    return {
      hashtag: {
        upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'h1' }),
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
      postHashtag: {
        upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(1),
      },
      ...overrides,
    } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
  }

  it('test_createPostHashtags_emptyList_touchesNothing', async () => {
    const prisma = buildPrisma();
    await new HashtagService(prisma).createPostHashtags('p1', []);
    expect(prisma.hashtag.upsert).not.toHaveBeenCalled();
  });

  it('test_createPostHashtags_upsertsHashtagByNormalizedTag', async () => {
    const prisma = buildPrisma();
    await new HashtagService(prisma).createPostHashtags('p1', [{ tag: 'paris', display: '#Paris' }]);
    expect(prisma.hashtag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tag: 'paris' },
      create: expect.objectContaining({ tag: 'paris' }),
    }));
  });

  it('test_createPostHashtags_upsertsPostHashtagWithDisplayCasing', async () => {
    const prisma = buildPrisma();
    await new HashtagService(prisma).createPostHashtags('p1', [{ tag: 'paris', display: '#Paris' }]);
    expect(prisma.postHashtag.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { post_hashtag_unique: { postId: 'p1', hashtagId: 'h1' } },
      create: expect.objectContaining({ postId: 'p1', hashtagId: 'h1', display: '#Paris' }),
      update: expect.objectContaining({ display: '#Paris' }),
    }));
  });

  it('test_createPostHashtags_recountsUsageCountAfterWrite_neverIncrements', async () => {
    const prisma = buildPrisma({
      postHashtag: {
        upsert: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(7),
      },
    });
    await new HashtagService(prisma).createPostHashtags('p1', [{ tag: 'paris', display: '#paris' }]);
    expect(prisma.hashtag.update).toHaveBeenCalledWith({
      where: { id: 'h1' },
      data: { usageCount: 7, lastUsedAt: expect.any(Date) },
    });
  });

  it('test_createPostHashtags_prismaThrows_neverRejects', async () => {
    const prisma = buildPrisma({
      hashtag: { upsert: jest.fn().mockRejectedValue(new Error('DB down')), update: jest.fn() },
    });
    await expect(new HashtagService(prisma).createPostHashtags('p1', [{ tag: 'paris', display: '#paris' }]))
      .resolves.toBeUndefined();
  });
});

describe('HashtagService.reconcileRemovedHashtags', () => {
  function buildPrisma(overrides: Record<string, unknown> = {}) {
    return {
      postHashtag: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 0 }),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
      },
      hashtag: {
        update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}),
      },
      ...overrides,
    } as unknown as import('@meeshy/shared/prisma/client').PrismaClient;
  }

  it('test_reconcile_noExistingHashtags_touchesNothing', async () => {
    const prisma = buildPrisma();
    await new HashtagService(prisma).reconcileRemovedHashtags('p1', ['paris']);
    expect(prisma.postHashtag.deleteMany).not.toHaveBeenCalled();
  });

  it('test_reconcile_removesHashtagsNoLongerInContent_recountsThem', async () => {
    const prisma = buildPrisma({
      postHashtag: {
        findMany: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([
          { id: 'ph1', hashtagId: 'h-paris', hashtag: { tag: 'paris' } },
          { id: 'ph2', hashtagId: 'h-lyon', hashtag: { tag: 'lyon' } },
        ]),
        deleteMany: jest.fn<() => Promise<unknown>>().mockResolvedValue({ count: 1 }),
        count: jest.fn<() => Promise<number>>().mockResolvedValue(4),
      },
      hashtag: { update: jest.fn<() => Promise<unknown>>().mockResolvedValue({}) },
    });
    await new HashtagService(prisma).reconcileRemovedHashtags('p1', ['paris']);

    expect(prisma.postHashtag.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['ph2'] } } });
    expect(prisma.hashtag.update).toHaveBeenCalledWith({
      where: { id: 'h-lyon' },
      data: { usageCount: 4, lastUsedAt: expect.any(Date) },
    });
    expect(prisma.hashtag.update).toHaveBeenCalledTimes(1);
  });

  it('test_reconcile_prismaThrows_neverRejects', async () => {
    const prisma = buildPrisma({
      postHashtag: { findMany: jest.fn().mockRejectedValue(new Error('DB down')) },
    });
    await expect(new HashtagService(prisma).reconcileRemovedHashtags('p1', []))
      .resolves.toBeUndefined();
  });
});
