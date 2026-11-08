/**
 * PostCommentService.updateComment — un fil FERMÉ ne s'édite plus (#16930).
 *
 * Décision porteur du 2026-11-08 : sur une publication aux commentaires
 * fermés (#16541), on aime encore un commentaire, on le signale encore, mais
 * on ne le MODIFIE plus. Fermé = la publication qui porte le commentaire, ou
 * l'original qu'elle republie, a `commentsDisabled` — la même règle que
 * l'admission d'un nouveau commentaire (`admitCommentHome`).
 *
 * Fichier SÉPARÉ de `PostCommentService.test.ts`, au plafond de sa dette de
 * taille (`gateway-test-file-size-budget.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const COMMENT_ID = 'comment-closed-1';
const AUTHOR_ID = 'author-closed-1';

type PostState = { commentsDisabled: boolean; repostOf: { commentsDisabled: boolean } | null } | null;

function prismaWith(post: PostState) {
  return {
    postComment: {
      findFirst: jest.fn().mockResolvedValue({ id: COMMENT_ID, postId: 'post-1', authorId: AUTHOR_ID, content: 'Ancien texte' }),
      update: jest.fn().mockResolvedValue({
        id: COMMENT_ID, content: 'Nouveau texte', originalLanguage: null, isEdited: true, translations: {},
        likeCount: 0, replyCount: 0, effectFlags: 0, parentId: null, createdAt: new Date('2025-01-01T00:00:00Z'),
        metadata: null, author: { id: AUTHOR_ID, username: 'alice', displayName: 'Alice', avatar: null },
      }),
    },
    commentReaction: {},
    post: { findUnique: jest.fn().mockResolvedValue(post), findFirst: jest.fn().mockResolvedValue(post) },
    postMedia: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  };
}

const edit = (prisma: ReturnType<typeof prismaWith>) =>
  new PostCommentService(prisma as unknown as PrismaClient).updateComment(COMMENT_ID, AUTHOR_ID, { content: 'Nouveau texte' });

describe('PostCommentService.updateComment — fil fermé (#16930)', () => {
  it('refuse COMMENTS_DISABLED quand la publication a fermé ses commentaires, sans rien écrire', async () => {
    const prisma = prismaWith({ commentsDisabled: true, repostOf: null });

    await expect(edit(prisma)).rejects.toThrow('COMMENTS_DISABLED');
    expect(prisma.postComment.update).not.toHaveBeenCalled();
  });

  it('refuse aussi quand c’est l’ORIGINAL republié qui a fermé ses commentaires', async () => {
    const prisma = prismaWith({ commentsDisabled: false, repostOf: { commentsDisabled: true } });

    await expect(edit(prisma)).rejects.toThrow('COMMENTS_DISABLED');
    expect(prisma.postComment.update).not.toHaveBeenCalled();
  });

  it('édite comme avant quand les commentaires sont ouverts', async () => {
    const prisma = prismaWith({ commentsDisabled: false, repostOf: null });

    await edit(prisma);
    expect(prisma.postComment.update).toHaveBeenCalledTimes(1);
  });

  it('un tiers reçoit FORBIDDEN avant tout verdict de fermeture (il n’apprend rien de l’état du fil)', async () => {
    const prisma = prismaWith({ commentsDisabled: true, repostOf: null });

    await expect(
      new PostCommentService(prisma as unknown as PrismaClient).updateComment(COMMENT_ID, 'intrus', { content: 'x' }),
    ).rejects.toThrow('FORBIDDEN');
  });
});
