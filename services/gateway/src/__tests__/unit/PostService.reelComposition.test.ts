/**
 * @jest-environment node
 *
 * Règle de composition d'un RÉEL appliquée par PostService (directive user
 * 2026-08-02) : un post n'est un REEL que si sa composition porte une vidéo,
 * un audio, ou au moins deux images (`qualifiesAsReel`).
 *
 * - CRÉATION : dégradation SILENCIEUSE en POST (jamais de 422 — les clients
 *   antérieurs envoient `type: REEL` dès 1 média ; rejeter casserait leur
 *   publication). Un REEL sans aucun mediaId retombe aussi sur POST.
 * - ÉDITION : 422 quand l'édition touche le type ou la composition et que la
 *   liste FINALE des médias ne qualifie pas. Une édition de texte seule sur un
 *   REEL hérité non conforme (corpus pré-backfill) continue de passer.
 *
 * Prisma est entièrement mocké — même harnais que PostService.test.ts.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import { MediaService } from '../../services/MediaService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType, PostVisibility } from '@meeshy/shared/prisma/client';

// PostAudioService uses a singleton that requires initialization — mock it
// entirely so these tests don't depend on ZMQ / SocialEventsHandler setup.
jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: {
      processPostAudio: jest.fn().mockReturnValue(Promise.resolve()),
    },
    init: jest.fn(),
  },
}));

function createMockPrisma() {
  const prisma = {
    post: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    postMedia: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    postView: { deleteMany: jest.fn() },
    postReaction: { deleteMany: jest.fn() },
    postImpression: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: typeof prisma) => Promise<unknown>)(prisma)
      : Promise.all(arg as ReadonlyArray<Promise<unknown>>),
  );
  return prisma;
}

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'user-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: null,
    metadata: null,
    repostOfId: null,
    originalLanguage: 'fr',
    deletedAt: null,
    media: [],
    ...overrides,
  };
}

describe('PostService — règle de composition REEL', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: PostService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    prisma.postMedia.updateMany.mockResolvedValue({ count: 1 });
    prisma.postMedia.findFirst.mockResolvedValue(null);
    prisma.postMedia.findMany.mockResolvedValue([]);
    service = new PostService(prisma as unknown as PrismaClient, new MediaService());
  });

  const baseCreate = { visibility: PostVisibility.PUBLIC };

  describe('createPost', () => {
    it('keeps REEL when the claimable media qualifies (video)', async () => {
      prisma.postMedia.findMany.mockResolvedValue([{ mimeType: 'video/mp4', duration: 5000 }]);
      prisma.post.create.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.createPost({ ...baseCreate, type: PostType.REEL, mediaIds: ['m1'] }, 'user-1');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.REEL }) }),
      );
      // La lecture de classification porte la MÊME garde de propriété que le
      // rattachement : ids demandés + uploaderId de l'appelant.
      const readArg = prisma.postMedia.findMany.mock.calls[0][0] as {
        where: { id: { in: string[] }; uploaderId: string };
      };
      expect(readArg.where.id).toEqual({ in: ['m1'] });
      expect(readArg.where.uploaderId).toBe('user-1');
    });

    it('keeps REEL for two images', async () => {
      prisma.postMedia.findMany.mockResolvedValue([
        { mimeType: 'image/jpeg' },
        { mimeType: 'image/png' },
      ]);
      prisma.post.create.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.createPost({ ...baseCreate, type: PostType.REEL, mediaIds: ['m1', 'm2'] }, 'user-1');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.REEL }) }),
      );
    });

    it('silently degrades a single-image REEL to POST (vieux clients)', async () => {
      prisma.postMedia.findMany.mockResolvedValue([{ mimeType: 'image/jpeg' }]);
      prisma.post.create.mockResolvedValue(makePost());

      await service.createPost({ ...baseCreate, type: PostType.REEL, mediaIds: ['m1'] }, 'user-1');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.POST }) }),
      );
    });

    it('degrades a REEL without any mediaId to POST without reading media', async () => {
      prisma.post.create.mockResolvedValue(makePost());

      await service.createPost({ ...baseCreate, type: PostType.REEL, content: undefined, moodEmoji: '🎬' }, 'user-1');

      expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.POST }) }),
      );
    });

    it('never classifies a non-REEL create', async () => {
      prisma.post.create.mockResolvedValue(makePost());

      await service.createPost({ ...baseCreate, type: PostType.POST, mediaIds: ['m1'] }, 'user-1');

      // La capture de la bibliothèque de sons lit désormais les médias
      // ATTACHÉS (`where: { postId }`) sur tout post avec `mediaIds` — c'est
      // légitime. La CLASSIFICATION, elle, lit par `where: { id: { in } }` et
      // ne doit jamais tourner pour un non-REEL.
      const classificationReads = prisma.postMedia.findMany.mock.calls
        .filter((call: unknown[]) => Boolean((call[0] as { where?: { id?: unknown } } | undefined)?.where?.id));
      expect(classificationReads).toHaveLength(0);
      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.POST }) }),
      );
    });

    it('silently degrades a REEL to POST when the video is under 3 seconds', async () => {
      prisma.postMedia.findMany.mockResolvedValue([{ mimeType: 'video/mp4', duration: 2000 }]);
      prisma.post.create.mockResolvedValue(makePost());

      await service.createPost({ ...baseCreate, type: PostType.REEL, mediaIds: ['m1'] }, 'user-1');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.POST }) }),
      );
    });

    it('keeps REEL when the video is exactly 3 seconds', async () => {
      prisma.postMedia.findMany.mockResolvedValue([{ mimeType: 'video/mp4', duration: 3000 }]);
      prisma.post.create.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.createPost({ ...baseCreate, type: PostType.REEL, mediaIds: ['m1'] }, 'user-1');

      expect(prisma.post.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.REEL }) }),
      );
    });
  });

  describe('updatePost', () => {
    it('rejects switching a single-image POST to REEL (422)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({
        type: 'POST', media: [{ id: 'm1', mimeType: 'image/jpeg' }],
      }));

      await expect(service.updatePost('post-1', 'user-1', { type: PostType.REEL }))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('accepts switching a two-image POST to REEL', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({
        type: 'POST',
        media: [{ id: 'm1', mimeType: 'image/jpeg' }, { id: 'm2', mimeType: 'image/png' }],
      }));
      prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.updatePost('post-1', 'user-1', { type: PostType.REEL });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.REEL }) }),
      );
    });

    it('rejects the 2→1 image removal on a REEL (422) and deletes nothing', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({
        type: 'REEL',
        media: [{ id: 'm1', mimeType: 'image/jpeg' }, { id: 'm2', mimeType: 'image/png' }],
      }));

      await expect(service.updatePost('post-1', 'user-1', { removeMediaIds: ['m1'] }))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(prisma.postMedia.deleteMany).not.toHaveBeenCalled();
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('lets a content-only edit pass on a legacy non-qualifying REEL (pré-backfill)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({
        type: 'REEL', media: [{ id: 'm1', mimeType: 'image/jpeg' }],
      }));
      prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));

      await service.updatePost('post-1', 'user-1', { content: 'nouveau texte' });

      expect(prisma.post.update).toHaveBeenCalled();
    });

    it('materializes freshly attached media for the rule (video attach → REEL ok)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ type: 'POST', media: [] }));
      prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));
      prisma.postMedia.findMany.mockResolvedValue([{ mimeType: 'video/mp4', duration: 5000 }]);

      await service.updatePost('post-1', 'user-1', { type: PostType.REEL, mediaIds: ['new-m1'] });

      const readArg = prisma.postMedia.findMany.mock.calls[0][0] as {
        where: { id: { in: string[] }; uploaderId: string };
      };
      expect(readArg.where.id).toEqual({ in: ['new-m1'] });
      expect(readArg.where.uploaderId).toBe('user-1');
      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.REEL }) }),
      );
    });

    it('rejects switching a POST to REEL when the attached video is under 3 seconds (422)', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ type: 'POST', media: [] }));
      prisma.postMedia.findMany.mockResolvedValue([{ mimeType: 'video/mp4', duration: 2000 }]);

      await expect(service.updatePost('post-1', 'user-1', { type: PostType.REEL, mediaIds: ['new-m1'] }))
        .rejects.toMatchObject({ statusCode: 422 });
      expect(prisma.post.update).not.toHaveBeenCalled();
    });

    it('accepts switching a POST to REEL when the attached video is exactly 3 seconds', async () => {
      prisma.post.findFirst.mockResolvedValue(makePost({ type: 'POST', media: [] }));
      prisma.post.update.mockResolvedValue(makePost({ type: 'REEL' }));
      prisma.postMedia.findMany.mockResolvedValue([{ mimeType: 'video/mp4', duration: 3000 }]);

      await service.updatePost('post-1', 'user-1', { type: PostType.REEL, mediaIds: ['new-m1'] });

      expect(prisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: PostType.REEL }) }),
      );
    });
  });
});
