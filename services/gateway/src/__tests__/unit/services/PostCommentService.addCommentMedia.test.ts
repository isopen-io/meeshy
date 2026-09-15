/**
 * PostCommentService.addComment — media (#6578)
 *
 * Extrait de `PostCommentService.test.ts` (budget de taille des suites,
 * #4531) : le fichier d'origine avait grossi de 1009 à 1101 lignes pour
 * porter ce bloc, dépassant le plafond hérité gelé à 1009 dans
 * `gateway-test-file-size-budget.test.ts`. Aucune assertion n'a changé —
 * seul le fichier qui les porte.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// addComment — single-media attachment (reuses PostMedia via commentId FK)
// ---------------------------------------------------------------------------

const noopTrackingLinks = {
  collectContentTrackingLinks: jest.fn().mockResolvedValue([]),
} as any;

const makePostMediaMock = () => ({
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  updateMany: jest.fn(),
  deleteMany: jest.fn(),
});

const buildPrismaForAdd = (postMedia: ReturnType<typeof makePostMediaMock>) => {
  const created = {
    id: 'c-new', content: 'hi', originalLanguage: 'fr', translations: null,
    likeCount: 0, replyCount: 0, effectFlags: 0, parentId: null,
    createdAt: new Date('2025-01-01T00:00:00Z'), metadata: null,
    author: { id: 'a1', username: 'al', displayName: 'Al', avatar: null },
  };
  return {
    post: {
      findFirst: jest.fn().mockResolvedValue({ id: 'post-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    postComment: {
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue(created),
      update: jest.fn().mockResolvedValue({}),
    },
    postMedia,
  } as unknown as PrismaClient;
};

describe('PostCommentService.addComment — media', () => {
  it('links the pending media to the new comment via commentId and returns it', async () => {
    const postMedia = makePostMediaMock();
    postMedia.updateMany.mockResolvedValue({ count: 1 });
    postMedia.findMany.mockResolvedValue([{ id: 'm-1', mimeType: 'image/jpeg', fileUrl: 'http://x/m-1' }]);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    const result: any = await service.addComment('post-1', 'a1', 'hi', { effectFlags: 0, originalLanguage: 'fr', mediaIds: ['m-1'] });

    // La condition est portée par l'ÉCRITURE et non par une lecture préalable :
    // la base tranche en une opération, donc deux commentaires concurrents ne
    // peuvent plus réclamer le même média tous les deux.
    const call = postMedia.updateMany.mock.calls[0][0];
    // `in`, et non l'égalité : un commentaire porte N médias depuis #6578.
    expect(call.where.id).toEqual({ in: ['m-1'] });
    // Les deux formes MongoDB d'un média libre (null OU champ absent) —
    // cf. l'incident prod 2026-07-31→08-01 sur `commentId` absent.
    expect(call.where.AND).toEqual([
      { OR: [{ postId: null }, { postId: { isSet: false } }] },
      { OR: [{ commentId: null }, { commentId: { isSet: false } }] },
    ]);
    // Et la garde de propriété : l'auteur du commentaire, pas n'importe qui.
    expect(call.where.uploaderId).toBe('a1');
    expect(call.data).toEqual(expect.objectContaining({ commentId: 'c-new' }));
    expect(result.media).toHaveLength(1);
    expect(result.media[0].id).toBe('m-1');
  });

  it('persists the mobile transcription on the linked audio media', async () => {
    const postMedia = makePostMediaMock();
    postMedia.updateMany.mockResolvedValue({ count: 1 });
    postMedia.findMany.mockResolvedValue([{ id: 'm-2', mimeType: 'audio/mp4', fileUrl: 'http://x/m-2' }]);
    postMedia.findFirst.mockResolvedValue({ id: 'm-2' });
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', '', {
      effectFlags: 0, originalLanguage: 'fr', mediaIds: ['m-2'],
      mobileTranscription: { text: 'bonjour', language: 'fr', segments: [] } as any,
    });

    expect(postMedia.updateMany.mock.calls[0][0].data.commentId).toBe('c-new');
    // La transcription décrit UNE piste : elle se pose sur le média AUDIO du
    // lot, pas sur le lot entier (#6578 — un commentaire peut porter trois
    // photos et un vocal, et les graver toutes les quatre serait faux).
    expect(postMedia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { commentId: 'c-new', mimeType: { startsWith: 'audio/' } } }),
    );
    const pose = postMedia.update.mock.calls[0][0];
    expect(pose.where).toEqual({ id: 'm-2' });
    expect(pose.data.transcription).toEqual(expect.objectContaining({ text: 'bonjour', source: 'mobile' }));
  });

  it('ne grave AUCUNE transcription quand le lot ne porte pas de piste audio', async () => {
    const postMedia = makePostMediaMock();
    postMedia.updateMany.mockResolvedValue({ count: 2 });
    postMedia.findMany.mockResolvedValue([
      { id: 'p-1', mimeType: 'image/jpeg', fileUrl: 'http://x/p-1' },
      { id: 'p-2', mimeType: 'image/jpeg', fileUrl: 'http://x/p-2' },
    ]);
    postMedia.findFirst.mockResolvedValue(null);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', 'deux photos', {
      mediaIds: ['p-1', 'p-2'],
      mobileTranscription: { text: 'bonjour', language: 'fr', segments: [] } as any,
    });

    expect(postMedia.update).not.toHaveBeenCalled();
  });

  it('lie TOUS les médias du lot, et grave leur RANG dans l’ordre demandé', async () => {
    const postMedia = makePostMediaMock();
    postMedia.updateMany.mockResolvedValue({ count: 3 });
    postMedia.findMany.mockResolvedValue([
      { id: 'a', mimeType: 'image/jpeg', fileUrl: 'http://x/a' },
      { id: 'b', mimeType: 'image/jpeg', fileUrl: 'http://x/b' },
      { id: 'c', mimeType: 'image/jpeg', fileUrl: 'http://x/c' },
    ]);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    const result: any = await service.addComment('post-1', 'a1', 'trois photos', { mediaIds: ['c', 'a', 'b'] });

    expect(postMedia.updateMany.mock.calls[0][0].where.id).toEqual({ in: ['c', 'a', 'b'] });
    // Le RANG suit l'ordre de la requête — le seul porteur de l'ordre voulu.
    const rangs = postMedia.updateMany.mock.calls
      .slice(1)
      .map((c: any) => [c[0].where.id, c[0].data.order]);
    expect(rangs).toEqual([['c', 0], ['a', 1], ['b', 2]]);
    expect(result.media).toHaveLength(3);
  });

  it('throws MEDIA_NOT_AVAILABLE when the media is already linked', async () => {
    const postMedia = makePostMediaMock();
    postMedia.findMany.mockResolvedValue([{ id: 'm-3', postId: 'other-post', commentId: null }]);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await expect(service.addComment('post-1', 'a1', 'hi', { effectFlags: 0, originalLanguage: 'fr', mediaIds: ['m-3'] }))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');
  });

  it('REFUSE le lot ENTIER dès qu’UN média est indisponible — jamais un commentaire amputé en silence', async () => {
    const postMedia = makePostMediaMock();
    postMedia.findMany.mockResolvedValue([
      { id: 'libre', postId: null, commentId: null },
      { id: 'pris', postId: null, commentId: 'autre-commentaire' },
    ]);
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await expect(service.addComment('post-1', 'a1', 'hi', { mediaIds: ['libre', 'pris'] }))
      .rejects.toThrow('MEDIA_NOT_AVAILABLE');
    expect(postMedia.updateMany).not.toHaveBeenCalled();
  });

  it('grave `metadata.quotedPostMedia` À CÔTÉ du lieu partagé — une seule écriture, pas deux (#6578)', async () => {
    const postMedia = makePostMediaMock();
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', 'celle-là', {
      quotedPostMedia: { postMediaId: '507f1f77bcf86cd799439102', kind: 'image' },
      location: { latitude: 48.85, longitude: 2.35, name: 'Paris' },
    });

    const data = (prisma as any).postComment.create.mock.calls[0][0].data;
    expect(data.metadata.quotedPostMedia).toEqual({ postMediaId: '507f1f77bcf86cd799439102', kind: 'image' });
    // `metadata` est un document REMPLACÉ en bloc : composer en deux temps
    // aurait effacé le lieu.
    expect(data.metadata.location).toEqual(expect.objectContaining({ name: 'Paris' }));
  });

  it('NON-RÉGRESSION — un commentaire qui ne cite rien n’écrit AUCUN metadata', async () => {
    const postMedia = makePostMediaMock();
    const prisma = buildPrismaForAdd(postMedia);

    const service = new PostCommentService(prisma, noopTrackingLinks);
    await service.addComment('post-1', 'a1', 'bravo');

    const data = (prisma as any).postComment.create.mock.calls[0][0].data;
    expect(data.metadata).toBeUndefined();
  });
});
