import { describe, it, expect, jest } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';

/**
 * Réagir à un commentaire par REST cesse de DÉTRUIRE les autres réactions.
 *
 * Les deux chemins d'ajout divergeaient sur la MUTATION tout en partageant la
 * GARDE : `CommentReactionService.addReaction` (socket) empile jusqu'à cinq,
 * pendant que `PostCommentService.likeComment` (REST) exécutait
 * `deleteMany({ emoji: { not: emoji } })` — après n'importe quel like REST, la
 * personne ne détenait plus qu'UNE réaction.
 *
 * Le pire cas n'était pas gardé mais GRAVÉ : au plafond, reposer un emoji déjà
 * présent fait sauter `assertReactionAllowed` (juste en soi — confirmer ne
 * consomme pas de place) et la purge s'exécutait quand même. Cinq réactions,
 * quatre détruites, aucune erreur, aucune notification.
 *
 * Le schéma tranche : `@@unique([commentId, userId, emoji])` — la base n'a
 * jamais plafonné à une réaction. Seul `MAX_REACTIONS_PER_OBJECT` le fait, et
 * il vaut cinq.
 */

const COMMENT_ID = 'comment-001';
const USER_ID = 'user-001';

function makePrisma() {
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
      count: jest.fn<any>().mockResolvedValue(0),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      upsert: jest.fn<any>().mockResolvedValue({}),
      groupBy: jest.fn<any>().mockResolvedValue([]),
    },
  };
}

describe('likeComment — un ajout n’efface JAMAIS une autre réaction', () => {
  it('poser un second emoji distinct ne purge pas le premier', async () => {
    const prisma = makePrisma();
    prisma.commentReaction.count.mockResolvedValue(1);
    const service = new PostCommentService(prisma as any);

    await service.likeComment(COMMENT_ID, USER_ID, '👍');

    expect(prisma.commentReaction.deleteMany).not.toHaveBeenCalled();
    expect(prisma.commentReaction.upsert).toHaveBeenCalledTimes(1);
  });

  // Le cas qui coûtait le plus, et que l'ancien témoin épinglait au vert.
  it('AU PLAFOND, reconfirmer un emoji déjà posé ne détruit pas les quatre autres', async () => {
    const prisma = makePrisma();
    prisma.commentReaction.count.mockResolvedValue(5);
    prisma.commentReaction.findFirst.mockResolvedValue({ id: 'r-existing' });
    const service = new PostCommentService(prisma as any);

    await service.likeComment(COMMENT_ID, USER_ID, '👍');

    expect(prisma.commentReaction.deleteMany).not.toHaveBeenCalled();
  });

  it('aucun appel de suppression ne porte un filtre « tous sauf celui-ci »', async () => {
    const prisma = makePrisma();
    const service = new PostCommentService(prisma as any);

    await service.likeComment(COMMENT_ID, USER_ID, '🎉');

    const filtresDestructeurs = prisma.commentReaction.deleteMany.mock.calls.filter(
      ([arg]: any) => arg?.where?.emoji && typeof arg.where.emoji === 'object' && 'not' in arg.where.emoji,
    );
    expect(filtresDestructeurs).toEqual([]);
  });
});

describe('unlikeComment — retirer sans désigner pèle la PLUS RÉCENTE', () => {
  it('emoji ABSENT ⇒ lit la pile TRIÉE et retire la dernière posée, jamais un cœur par défaut', async () => {
    const prisma = makePrisma();
    (prisma.commentReaction as any).findMany = jest
      .fn<any>()
      .mockResolvedValue([{ emoji: '🔥' }, { emoji: '👍' }]);
    const service = new PostCommentService(prisma as any);

    await service.unlikeComment(COMMENT_ID, USER_ID);

    expect((prisma.commentReaction as any).findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
    expect(prisma.commentReaction.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ emoji: '🔥' }) }),
    );
  });

  it('emoji FOURNI ⇒ c’est celui-là qui part, exactement', async () => {
    const prisma = makePrisma();
    (prisma.commentReaction as any).findMany = jest.fn<any>().mockResolvedValue([{ emoji: '👍' }]);
    const service = new PostCommentService(prisma as any);

    await service.unlikeComment(COMMENT_ID, USER_ID, '👍');

    expect(prisma.commentReaction.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ emoji: '👍' }) }),
    );
  });

  it('pile VIDE ⇒ rien n’est supprimé, le geste reste idempotent', async () => {
    const prisma = makePrisma();
    (prisma.commentReaction as any).findMany = jest.fn<any>().mockResolvedValue([]);
    const service = new PostCommentService(prisma as any);

    await service.unlikeComment(COMMENT_ID, USER_ID);

    expect(prisma.commentReaction.deleteMany).not.toHaveBeenCalled();
  });
});

describe('unlikeComment — la diffusion doit porter l’emoji RÉELLEMENT retiré', () => {
  it('rend `removedEmoji` — sans lui, la route annoncerait le geste DEMANDÉ, pas le geste FAIT', async () => {
    const prisma = makePrisma();
    (prisma.commentReaction as any).findMany = jest.fn<any>().mockResolvedValue([{ emoji: '🔥' }]);
    const service = new PostCommentService(prisma as any);

    const res: any = await service.unlikeComment(COMMENT_ID, USER_ID);

    expect(res.removedEmoji).toBe('🔥');
  });

  it('rend `removedEmoji: null` sur une pile vide — rien n’a été retiré, rien n’est annoncé', async () => {
    const prisma = makePrisma();
    (prisma.commentReaction as any).findMany = jest.fn<any>().mockResolvedValue([]);
    const service = new PostCommentService(prisma as any);

    const res: any = await service.unlikeComment(COMMENT_ID, USER_ID);

    expect(res.removedEmoji).toBeNull();
  });
});
