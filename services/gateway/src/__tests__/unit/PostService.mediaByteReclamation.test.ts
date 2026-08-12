/**
 * @jest-environment node
 *
 * Retirer un média d'un post détruisait sa ligne `PostMedia` et laissait le
 * FICHIER sur le volume, pour toujours et hors de portée de tout balayage —
 * servi de surcroît par une route sans authentification, donc encore
 * téléchargeable par qui avait vu passer son URL.
 *
 * Ces gardes ancrent le contrat de l'édition : l'octet part avec la ligne,
 * APRÈS le commit, et jamais celui d'un média conservé.
 *
 * Prisma est entièrement mocké — même harnais que PostService.test.ts.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PostService } from '../../services/PostService';
import type { MediaStorage } from '../../services/storage/MediaStorage';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

jest.mock('../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
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
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    sound: { findMany: jest.fn().mockResolvedValue([]) },
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

function makePost(media: Array<Record<string, unknown>>) {
  return {
    id: 'post-1',
    authorId: 'user-1',
    type: 'POST',
    visibility: 'PUBLIC',
    content: 'texte',
    metadata: null,
    repostOfId: null,
    originalLanguage: 'fr',
    deletedAt: null,
    media,
  };
}

const KEPT = { id: 'keep', mimeType: 'image/jpeg', duration: null, fileUrl: '/f/keep.jpg', thumbnailUrl: null };
const DOOMED = {
  id: 'doomed',
  mimeType: 'image/jpeg',
  duration: null,
  fileUrl: '/f/doomed.jpg',
  thumbnailUrl: '/f/doomed_thumb.jpg',
};

describe('PostService — octets des médias retirés par une édition', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let storage: MediaStorage;
  let service: PostService;

  beforeEach(() => {
    prisma = createMockPrisma();
    storage = {
      delete: jest.fn<(fileUrl: string) => Promise<void>>().mockResolvedValue(undefined),
      duplicate: jest.fn(),
      planDuplicate: jest.fn(),
      relativePathFromUrl: jest.fn(),
    } as unknown as MediaStorage;
    service = new PostService(prisma as unknown as PrismaClient, storage);
    prisma.post.update.mockResolvedValue(makePost([KEPT]));
  });

  it('test_updatePost_removedMedia_reclaimsItsFileAndThumbnail', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost([KEPT, DOOMED]));

    await service.updatePost('post-1', 'user-1', { removeMediaIds: ['doomed'] });

    expect(storage.delete).toHaveBeenCalledWith('/f/doomed.jpg');
    expect(storage.delete).toHaveBeenCalledWith('/f/doomed_thumb.jpg');
  });

  it('test_updatePost_removedMedia_neverTouchesTheBytesOfKeptMedia', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost([KEPT, DOOMED]));

    await service.updatePost('post-1', 'user-1', { removeMediaIds: ['doomed'] });

    expect(storage.delete).not.toHaveBeenCalledWith('/f/keep.jpg');
  });

  // Un id qui ne désigne aucun média de CE post est déjà ignoré côté lignes ;
  // il ne doit pas davantage emporter d'octets.
  it('test_updatePost_foreignMediaId_reclaimsNothing', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost([KEPT]));

    await service.updatePost('post-1', 'user-1', { removeMediaIds: ['someone-elses-media'] });

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('test_updatePost_noRemoval_reclaimsNothing', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost([KEPT]));

    await service.updatePost('post-1', 'user-1', { content: 'nouveau texte' });

    expect(storage.delete).not.toHaveBeenCalled();
  });

  // L'octet part APRÈS le commit : une transaction qui échoue laisserait
  // sinon un média vivant sans fichier.
  it('test_updatePost_reclaimsAfterTheTransactionCommits', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost([KEPT, DOOMED]));
    const order: string[] = [];
    prisma.postMedia.deleteMany.mockImplementation(async () => {
      order.push('deleteRows');
      return { count: 1 };
    });
    (storage.delete as jest.Mock).mockImplementation(async () => { order.push('unlink'); });

    await service.updatePost('post-1', 'user-1', { removeMediaIds: ['doomed'] });

    expect(order[0]).toBe('deleteRows');
    expect(order).toContain('unlink');
  });

  // Le contenu est édité ; un volume en panne ne doit pas rendre 500.
  it('test_updatePost_reclamationFails_editStillSucceeds', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost([KEPT, DOOMED]));
    prisma.sound.findMany.mockRejectedValue(new Error('mongo down'));

    await expect(
      service.updatePost('post-1', 'user-1', { removeMediaIds: ['doomed'] }),
    ).resolves.toBeTruthy();
  });

  it('test_updatePost_mediaStillBackingASurvivingSound_keepsItsBytes', async () => {
    prisma.post.findFirst.mockResolvedValue(makePost([KEPT, DOOMED]));
    prisma.sound.findMany.mockResolvedValue([
      { fileUrl: '/sounds/x.m4a', coverUrl: '/f/doomed_thumb.jpg' },
    ]);

    await service.updatePost('post-1', 'user-1', { removeMediaIds: ['doomed'] });

    expect(storage.delete).toHaveBeenCalledWith('/f/doomed.jpg');
    expect(storage.delete).not.toHaveBeenCalledWith('/f/doomed_thumb.jpg');
  });
});
