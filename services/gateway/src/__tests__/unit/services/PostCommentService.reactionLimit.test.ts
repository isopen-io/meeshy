import { describe, it, expect, jest } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import { MAX_REACTIONS_PER_OBJECT, REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';

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
 * `likeComment` purge toutes les AUTRES réactions de la personne avant
 * d'upserter l'émoji demandé (invariant REST « max 1 réaction par user »,
 * voir les tests `PostCommentService.likeComment` existants) — reposer
 * l'émoji déjà présent n'ajoute donc jamais de ligne neuve, mais un émoji
 * *nouveau* alors que la personne est déjà au plafond DOIT être refusé avant
 * la purge, pour ne pas silencieusement remplacer ses cinq réactions par une
 * seule sous prétexte que la sixième était refusée par l'autre chemin.
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

    expect(prisma.commentReaction.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.commentReaction.upsert).toHaveBeenCalledTimes(1);
  });

  it(`la ${MAX_REACTIONS_PER_OBJECT + 1}e réaction (nouvel emoji) est refusée — la personne a déjà ${MAX_REACTIONS_PER_OBJECT} emojis distincts sur ce commentaire`, async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    const service = new PostCommentService(prisma as any);

    await expect(service.likeComment(COMMENT_ID, USER_ID, '🎉')).rejects.toThrow(
      REACTION_LIMIT_REACHED_MESSAGE
    );

    // Refusé AVANT toute purge : les cinq réactions existantes de la personne
    // survivent intactes, elles ne sont pas silencieusement remplacées par une seule.
    expect(prisma.commentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.commentReaction.upsert).not.toHaveBeenCalled();
  });

  it('reposer un émoji déjà présent passe MÊME au plafond — ne consomme aucune place', async () => {
    const prisma = makePrisma(MAX_REACTIONS_PER_OBJECT);
    prisma.commentReaction.findFirst.mockResolvedValue({ id: 'r-existing' });
    const service = new PostCommentService(prisma as any);

    await service.likeComment(COMMENT_ID, USER_ID, '👍');

    expect(prisma.commentReaction.deleteMany).toHaveBeenCalledWith({
      where: { commentId: COMMENT_ID, userId: USER_ID, emoji: { not: '👍' } },
    });
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
