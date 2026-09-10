import { describe, it, expect, jest } from '@jest/globals';
import { PostInteractiveResponseService } from '../../../services/PostInteractiveResponseService';
import { ValidationError } from '../../../errors/custom-errors';

/**
 * Votes/réponses aux stickers interactifs (O10, #3954) — table légère à côté
 * de `Post.storyEffects`. Miroir structurel de
 * `PostReactionService.reactionLimit.test.ts` : fabrique fraîche par test,
 * aucun état partagé, tests par l'API publique uniquement.
 */

const POST_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439012';
const OBJECT_ID = 'sticker-poll-1';

function makePrisma(overrides: Partial<{ postFound: boolean; postDeleted: boolean }> = {}) {
  const { postFound = true, postDeleted = false } = overrides;

  return {
    post: {
      findUnique: jest.fn<any>().mockResolvedValue(
        postFound ? { id: POST_ID, deletedAt: postDeleted ? new Date() : null } : null,
      ),
    },
    postInteractiveResponse: {
      upsert: jest.fn<any>().mockImplementation(({ create }: any) =>
        Promise.resolve({
          id: 'response-new',
          postId: create.postId,
          objectId: create.objectId,
          userId: create.userId,
          choice: create.choice,
          numericValue: create.numericValue,
          text: create.text,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

describe('PostInteractiveResponseService.submitResponse', () => {
  it('pose une réponse à choix (sondage/quiz) — upsert avec la clé composée', async () => {
    const prisma = makePrisma();
    const service = new PostInteractiveResponseService(prisma as any);

    const result = await service.submitResponse({
      postId: POST_ID,
      objectId: OBJECT_ID,
      userId: USER_ID,
      choice: 'option-a',
    });

    expect(result.choice).toBe('option-a');
    expect(result.numericValue).toBeNull();
    expect(result.text).toBeNull();
    expect(prisma.postInteractiveResponse.upsert).toHaveBeenCalledWith({
      where: {
        post_object_user_response_unique: { postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID },
      },
      update: { choice: 'option-a', numericValue: null, text: null },
      create: { postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID, choice: 'option-a', numericValue: null, text: null },
    });
  });

  it('pose une réponse numérique (curseur emoji)', async () => {
    const prisma = makePrisma();
    const service = new PostInteractiveResponseService(prisma as any);

    const result = await service.submitResponse({
      postId: POST_ID,
      objectId: OBJECT_ID,
      userId: USER_ID,
      numericValue: 0.75,
    });

    expect(result.numericValue).toBe(0.75);
  });

  it('pose une réponse texte libre (question / « à vous »)', async () => {
    const prisma = makePrisma();
    const service = new PostInteractiveResponseService(prisma as any);

    const result = await service.submitResponse({
      postId: POST_ID,
      objectId: OBJECT_ID,
      userId: USER_ID,
      text: 'ma réponse libre',
    });

    expect(result.text).toBe('ma réponse libre');
  });

  it('un second vote REMPLACE le premier — même clé composée, un seul upsert', async () => {
    const prisma = makePrisma();
    const service = new PostInteractiveResponseService(prisma as any);

    await service.submitResponse({ postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID, choice: 'a' });
    await service.submitResponse({ postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID, choice: 'b' });

    expect(prisma.postInteractiveResponse.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.postInteractiveResponse.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ choice: 'b' }) }),
    );
  });

  it('refuse une réponse sans AUCUNE des trois valeurs — ValidationError, aucune écriture', async () => {
    const prisma = makePrisma();
    const service = new PostInteractiveResponseService(prisma as any);

    await expect(
      service.submitResponse({ postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(prisma.postInteractiveResponse.upsert).not.toHaveBeenCalled();
  });

  it('refuse un objectId vide', async () => {
    const prisma = makePrisma();
    const service = new PostInteractiveResponseService(prisma as any);

    await expect(
      service.submitResponse({ postId: POST_ID, objectId: '  ', userId: USER_ID, choice: 'a' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuse sur un post introuvable', async () => {
    const prisma = makePrisma({ postFound: false });
    const service = new PostInteractiveResponseService(prisma as any);

    await expect(
      service.submitResponse({ postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID, choice: 'a' }),
    ).rejects.toThrow('Post not found');
  });

  it('refuse sur un post supprimé', async () => {
    const prisma = makePrisma({ postDeleted: true });
    const service = new PostInteractiveResponseService(prisma as any);

    await expect(
      service.submitResponse({ postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID, choice: 'a' }),
    ).rejects.toThrow('Post has been deleted');
  });
});

describe('PostInteractiveResponseService.removeResponse', () => {
  it('retire la réponse adressée par (postId, objectId, userId)', async () => {
    const prisma = makePrisma();
    const service = new PostInteractiveResponseService(prisma as any);

    const removed = await service.removeResponse({ postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID });

    expect(removed).toBe(true);
    expect(prisma.postInteractiveResponse.deleteMany).toHaveBeenCalledWith({
      where: { postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID },
    });
  });

  it('rend false quand rien n\'a été supprimé', async () => {
    const prisma = makePrisma();
    prisma.postInteractiveResponse.deleteMany.mockResolvedValue({ count: 0 });
    const service = new PostInteractiveResponseService(prisma as any);

    const removed = await service.removeResponse({ postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID });

    expect(removed).toBe(false);
  });
});

describe('PostInteractiveResponseService.getAggregate', () => {
  it('ventile les réponses par choix, recalculée depuis la table (jamais un compteur dénormalisé)', async () => {
    const prisma = makePrisma();
    prisma.postInteractiveResponse.groupBy.mockResolvedValue([
      { choice: 'option-a', _count: { choice: 3 } },
      { choice: 'option-b', _count: { choice: 1 } },
    ]);
    prisma.postInteractiveResponse.count.mockResolvedValue(4);
    const service = new PostInteractiveResponseService(prisma as any);

    const aggregation = await service.getAggregate(POST_ID, OBJECT_ID);

    expect(aggregation).toEqual({
      postId: POST_ID,
      objectId: OBJECT_ID,
      totalResponses: 4,
      choiceCounts: [
        { choice: 'option-a', count: 3 },
        { choice: 'option-b', count: 1 },
      ],
    });
    expect(prisma.postInteractiveResponse.groupBy).toHaveBeenCalledWith({
      by: ['choice'],
      where: { postId: POST_ID, objectId: OBJECT_ID, choice: { not: null } },
      _count: { choice: true },
    });
  });

  it('totalResponses compte AUSSI les réponses sans choix (numérique/texte)', async () => {
    const prisma = makePrisma();
    prisma.postInteractiveResponse.groupBy.mockResolvedValue([]);
    prisma.postInteractiveResponse.count.mockResolvedValue(7);
    const service = new PostInteractiveResponseService(prisma as any);

    const aggregation = await service.getAggregate(POST_ID, OBJECT_ID);

    expect(aggregation.totalResponses).toBe(7);
    expect(aggregation.choiceCounts).toEqual([]);
  });
});

describe('PostInteractiveResponseService.getUserResponse', () => {
  it('rend la réponse propre à l\'appelant, adressée par la clé composée', async () => {
    const prisma = makePrisma();
    prisma.postInteractiveResponse.findUnique.mockResolvedValue({
      id: 'r1', postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID,
      choice: 'option-a', numericValue: null, text: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const service = new PostInteractiveResponseService(prisma as any);

    const response = await service.getUserResponse(POST_ID, OBJECT_ID, USER_ID);

    expect(response?.choice).toBe('option-a');
    expect(prisma.postInteractiveResponse.findUnique).toHaveBeenCalledWith({
      where: {
        post_object_user_response_unique: { postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID },
      },
    });
  });

  it('rend null quand cette personne n\'a pas répondu', async () => {
    const prisma = makePrisma();
    const service = new PostInteractiveResponseService(prisma as any);

    const response = await service.getUserResponse(POST_ID, OBJECT_ID, USER_ID);

    expect(response).toBeNull();
  });
});
