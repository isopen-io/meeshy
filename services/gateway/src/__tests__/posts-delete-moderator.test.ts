/**
 * Service tests — PostService.deletePost, droit de modération
 *
 * Un modérateur peut RETIRER le poste d'autrui, jamais le modifier (décision
 * produit : réécrire le texte de quelqu'un sous sa signature casse l'intégrité
 * du contenu). Chaque suppression non-auteur laisse une ligne AdminAuditLog.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockLog = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => mockLog) },
}));

import { PostService } from '../services/PostService';

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439031';
const MODERATOR_ID = '507f1f77bcf86cd799439032';

const postFindFirst = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const postUpdate = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const trackingLinkUpdateMany = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const auditCreate = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const releasePost = jest.fn<(...a: unknown[]) => Promise<unknown>>();

/**
 * `deletePost` termine par `this.soundCaptureService.releasePost(postId)` — un
 * service interne, PAS une table Prisma. On le court-circuite sur l'instance,
 * comme `posts-view-idempotence.test.ts` court-circuite `buildVisibilityFilter`.
 */
function makeSUT() {
  const prisma = {
    post: { findFirst: postFindFirst, update: postUpdate },
    trackingLink: { updateMany: trackingLinkUpdateMany },
    adminAuditLog: { create: auditCreate },
  };

  const svc = new PostService(prisma as never);
  (svc as unknown as { soundCaptureService: { releasePost: typeof releasePost } })
    .soundCaptureService = { releasePost };
  return svc;
}

describe('PostService.deletePost — droits', () => {
  beforeEach(() => {
    postFindFirst.mockReset().mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      type: 'POST',
      visibility: 'PUBLIC',
    });
    postUpdate.mockReset().mockResolvedValue({ id: POST_ID, type: 'POST', visibility: 'PUBLIC' });
    trackingLinkUpdateMany.mockReset().mockResolvedValue({ count: 0 });
    auditCreate.mockReset().mockResolvedValue({});
    releasePost.mockReset().mockResolvedValue(undefined);
  });

  it("l'auteur supprime son poste sans ligne d'audit", async () => {
    const sut = makeSUT();
    const result = await sut.deletePost(POST_ID, AUTHOR_ID, { actorRole: 'USER' });

    expect(result).not.toBeNull();
    expect(postUpdate).toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('un USER non auteur est refusé', async () => {
    const sut = makeSUT();
    await expect(
      sut.deletePost(POST_ID, MODERATOR_ID, { actorRole: 'USER' }),
    ).rejects.toThrow('FORBIDDEN');
    expect(postUpdate).not.toHaveBeenCalled();
  });

  it("un MODERATOR non auteur supprime ET laisse une ligne d'audit", async () => {
    const sut = makeSUT();
    const result = await sut.deletePost(POST_ID, MODERATOR_ID, { actorRole: 'MODERATOR' });

    expect(result).not.toBeNull();
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: AUTHOR_ID,
        adminId: MODERATOR_ID,
        action: 'DELETE_POST',
        entity: 'Post',
        entityId: POST_ID,
        metadata: JSON.stringify({ type: 'POST' }),
      },
    });
  });

  it('ADMIN et BIGBOSS non auteurs sont autorisés', async () => {
    for (const actorRole of ['ADMIN', 'BIGBOSS']) {
      auditCreate.mockClear();
      const sut = makeSUT();
      const result = await sut.deletePost(POST_ID, MODERATOR_ID, { actorRole });
      expect(result).not.toBeNull();
      expect(auditCreate).toHaveBeenCalledTimes(1);
    }
  });

  it("un échec d'écriture d'audit n'annule pas la suppression", async () => {
    auditCreate.mockRejectedValue(new Error('mongo down'));
    const sut = makeSUT();
    const result = await sut.deletePost(POST_ID, MODERATOR_ID, { actorRole: 'MODERATOR' });

    expect(result).not.toBeNull();
    expect(postUpdate).toHaveBeenCalled();
  });
});
