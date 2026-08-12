import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Les effets délégués (retrait de notifications, désactivation des liens
// trackés, libération des sons) ont leurs propres suites — ici on isole la
// mécanique de balayage soft/hard du service.
jest.mock('../../../services/posts/retractPostNotifications', () => ({
  retractPostNotifications: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock('../../../services/posts/deactivatePostTrackingLinks', () => ({
  deactivatePostTrackingLinks: jest.fn<any>().mockResolvedValue(0),
}));
jest.mock('../../../services/posts/SoundCaptureService', () => ({
  SoundCaptureService: jest.fn().mockImplementation(() => ({
    releasePost: jest.fn<any>().mockResolvedValue(undefined),
    releasePosts: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));
jest.mock('../../../services/notifications/notification-service-registry', () => ({
  getSharedNotificationService: () => undefined,
}));

import { ExpiredStoriesCleanupService } from '../../../services/ExpiredStoriesCleanupService';

function makePrisma(opts: { toHardDelete?: { id: string }[]; reposts?: { id: string }[] } = {}) {
  return {
    post: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      findMany: jest.fn<any>().mockImplementation(({ where }: { where?: { repostOfId?: unknown } }) => {
        if (where?.repostOfId) return Promise.resolve(opts.reposts ?? []);
        return Promise.resolve(opts.toHardDelete ?? []);
      }),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postComment: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    postMedia: {
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  };
}

describe('ExpiredStoriesCleanupService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // start
  // ---------------------------------------------------------------------------
  describe('start', () => {
    it('calls cleanup immediately on start', async () => {
      const prisma = makePrisma();
      const service = new ExpiredStoriesCleanupService(prisma as any);

      service.start();
      // Let the fire-and-forget cleanup promise resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(prisma.post.updateMany).toHaveBeenCalled();
    });

    it('sets an interval after start', () => {
      const prisma = makePrisma();
      const service = new ExpiredStoriesCleanupService(prisma as any);

      service.start(1000);

      expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);

      service.stop();
    });
  });

  // ---------------------------------------------------------------------------
  // stop
  // ---------------------------------------------------------------------------
  describe('stop', () => {
    it('clears interval without throwing', () => {
      const prisma = makePrisma();
      const service = new ExpiredStoriesCleanupService(prisma as any);

      service.start(1000);
      expect(() => service.stop()).not.toThrow();
    });

    it('double-stop is safe (no throw)', () => {
      const prisma = makePrisma();
      const service = new ExpiredStoriesCleanupService(prisma as any);

      service.start(1000);
      service.stop();
      expect(() => service.stop()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // cleanup — soft-delete phase
  // ---------------------------------------------------------------------------
  describe('cleanup — soft-delete phase', () => {
    it('calls post.updateMany with correct where clause', async () => {
      const prisma = makePrisma();
      const service = new ExpiredStoriesCleanupService(prisma as any);

      await service.cleanup();

      // Le balayage couvre TOUS les types éphémères (stories ET statuts), et
      // `deletedAt` absent se filtre en `{ isSet: false }` sur le connecteur
      // MongoDB — un scalaire `null` ne matche pas les documents legacy.
      expect(prisma.post.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: { in: expect.arrayContaining(['STORY']) },
            expiresAt: { lt: expect.any(Date) },
            deletedAt: { isSet: false },
          }),
        }),
      );
    });

    it('returns { softDeleted: 0, hardDeleted: 0 } when no expired stories', async () => {
      const prisma = makePrisma();
      const service = new ExpiredStoriesCleanupService(prisma as any);

      const result = await service.cleanup();

      expect(result).toEqual({ softDeleted: 0, hardDeleted: 0 });
    });

    it('returns softDeleted count from updateMany result', async () => {
      const prisma = makePrisma();
      prisma.post.updateMany.mockResolvedValue({ count: 3 } as any);
      const service = new ExpiredStoriesCleanupService(prisma as any);

      const result = await service.cleanup();

      expect(result.softDeleted).toBe(3);
    });

    it('soft-delete phase error is caught silently', async () => {
      const prisma = makePrisma();
      prisma.post.updateMany.mockRejectedValue(new Error('DB error') as any);
      const service = new ExpiredStoriesCleanupService(prisma as any);

      await expect(service.cleanup()).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // cleanup — hard-delete phase
  // ---------------------------------------------------------------------------
  describe('cleanup — hard-delete phase', () => {
    it('calls post.findMany for hard-delete candidates', async () => {
      const prisma = makePrisma();
      const service = new ExpiredStoriesCleanupService(prisma as any);

      await service.cleanup();

      expect(prisma.post.findMany).toHaveBeenCalled();
    });

    it('skips postComment.deleteMany when no hard-delete candidates found', async () => {
      const prisma = makePrisma({ toHardDelete: [] });
      const service = new ExpiredStoriesCleanupService(prisma as any);

      await service.cleanup();

      expect(prisma.postComment.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes comments before posts when hard-delete candidates found', async () => {
      const prisma = makePrisma({ toHardDelete: [{ id: 'story-1' }] });
      const service = new ExpiredStoriesCleanupService(prisma as any);

      await service.cleanup();

      const postCommentDeleteOrder = prisma.postComment.deleteMany.mock.invocationCallOrder[0];
      const postDeleteOrder = prisma.post.deleteMany.mock.invocationCallOrder[0];
      expect(postCommentDeleteOrder).toBeLessThan(postDeleteOrder);
    });

    it('calls postComment.deleteMany for allPostIds when hard-deleting', async () => {
      const prisma = makePrisma({ toHardDelete: [{ id: 'story-1' }] });
      const service = new ExpiredStoriesCleanupService(prisma as any);

      await service.cleanup();

      expect(prisma.postComment.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            postId: expect.objectContaining({ in: expect.arrayContaining(['story-1']) }),
          }),
        }),
      );
    });

    it('calls final post.deleteMany with the story IDs', async () => {
      const prisma = makePrisma({ toHardDelete: [{ id: 'story-1' }] });
      prisma.post.deleteMany.mockResolvedValue({ count: 1 } as any);
      const service = new ExpiredStoriesCleanupService(prisma as any);

      const result = await service.cleanup();

      expect(prisma.post.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['story-1'] },
          }),
        }),
      );
      expect(result.hardDeleted).toBe(1);
    });

    it('hard-delete phase error is caught silently', async () => {
      const prisma = makePrisma();
      prisma.post.findMany.mockRejectedValue(new Error('findMany DB error') as any);
      const service = new ExpiredStoriesCleanupService(prisma as any);

      await expect(service.cleanup()).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // constructor options
  // ---------------------------------------------------------------------------
  describe('constructor options', () => {
    it('accepts softDeleteRetentionMs and hardDeleteAgeMs options without throwing', () => {
      const prisma = makePrisma();

      expect(
        () =>
          new ExpiredStoriesCleanupService(prisma as any, {
            softDeleteRetentionMs: 1000,
            hardDeleteAgeMs: 2000,
          }),
      ).not.toThrow();
    });
  });
});
