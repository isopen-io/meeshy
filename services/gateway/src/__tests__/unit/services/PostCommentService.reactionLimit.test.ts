import { describe, it, expect, jest } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import { MAX_REACTIONS_PER_OBJECT, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';
import { ConflictError } from '../../../errors/custom-errors';

/**
 * Cinq réactions au maximum, par personne et par objet (2026-08-20) — volet
 * commentaires, SECOND chemin de création
 * (`PostCommentService.likeComment`, fallback REST — brief Task 3, ligne 579
 * de l'upsert). Le PREMIER chemin (`CommentReactionService.addReaction`,
 * emprunté par le socket) a sa propre preuve dans
 * `CommentReactionService.reactionLimit.test.ts`. Les deux DOIVENT refuser la
 * sixième réaction, sinon l'un contourne silencieusement le plafond posé par
 * l'autre.
 *
 * `likeComment` EMPILE, comme son jumeau socket : il upserte l'émoji demandé
 * sans jamais toucher aux autres. Il a longtemps purgé (`emoji: { not }`) au
 * nom d'un « invariant max 1 réaction par user » qui n'existait sur aucun autre
 * chemin — retiré le 2026-08-25. Ce qui reste ici est le SEUL plafond réel :
 * cinq réactions par personne et par objet, refusées avant création. Reposer un
 * émoji déjà présent ne consomme aucune place et ne détruit plus rien.
 */

const COMMENT_ID = 'comment-001';
const USER_ID = 'user-001';

function makePrisma(existingReactionCount: number) {
  return {
    postComment: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID }),
      update: jest.fn<any>().mockResolvedValue({
        id: COMMENT_ID,
        postId: 'post-001',
        authorId: 'author-001',
        content: 'Hello',
        likeCount: 1,
        reactionSummary: {},
      }),
    },
    commentReaction: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      count: jest.fn<any>().mockResolvedValue(existingReactionCount),
      // `unlikeComment` lit la pile TRIÉE avant de retirer : sans ce double, le
      // retrait ne trouve aucune cible et ne supprime rien.
      findMany: jest.fn<any>().mockResolvedValue([{ emoji: '👍' }]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      upsert: jest.fn<any>().mockResolvedValue({}),
      groupBy: jest.fn<any>().mockResolvedValue([]),
    },
  };
}

describe('PostCommentService.likeComment — plafond de 5 réactions par personne et par commentaire (second chemin)', () => {
  it(`la ${MAX_REACTIONS_PER_OBJECT}e réaction (nouvel emoji) passe — la personne en a ${MAX_REACTIONS_PER_OBJECT - 1}`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT - 1);
    const service = new PostCommentService(prisma as any);

    await service.likeComment(COMMENT_ID, USER_ID, '🎉');

    expect(prisma.commentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.commentReaction.upsert).toHaveBeenCalledTimes(1);
  });

  it(`la ${MAX_REACTIONS_PER_OBJECT + 1}e réaction (nouvel emoji) est refusée — la personne a déjà ${MAX_REACTIONS_PER_OBJECT} emojis distincts sur ce commentaire`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const service = new PostCommentService(prisma as any);

    await expect(service.likeComment(COMMENT_ID, USER_ID, '🎉')).rejects.toThrow(
      REACTION_LIMIT_REACHED_MESSAGE
    );

    // Refusé avant création : la sixième n'entre pas, et les cinq existantes
    // survivent — plus aucune purge ne peut les emporter.
    expect(prisma.commentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.commentReaction.upsert).not.toHaveBeenCalled();
  });

  it('refuse avec un ConflictError — la route (POST /posts/:postId/comments/:commentId/like) le distingue d\'une panne via `instanceof`', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const service = new PostCommentService(prisma as any);

    await expect(service.likeComment(COMMENT_ID, USER_ID, '🎉')).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('reposer un émoji déjà présent passe MÊME au plafond — ne consomme aucune place', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.commentReaction.findFirst.mockResolvedValue({ id: 'r-existing' });
    const service = new PostCommentService(prisma as any);

    await service.likeComment(COMMENT_ID, USER_ID, '👍');

    expect(prisma.commentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.commentReaction.upsert).toHaveBeenCalledTimes(1);
    // La décision de plafond ne s'applique qu'à une création réelle.
    expect(prisma.commentReaction.count).not.toHaveBeenCalled();
  });

  it('retirer une réaction libère une place — unlikeComment ne consulte aucun plafond et supprime la ligne', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
    const service = new PostCommentService(prisma as any);

    await service.unlikeComment(COMMENT_ID, USER_ID, '👍');

    expect(prisma.commentReaction.deleteMany).toHaveBeenCalledWith({
      where: { commentId: COMMENT_ID, userId: USER_ID, emoji: '👍' },
    });
    expect(prisma.commentReaction.count).not.toHaveBeenCalled();
  });
});
