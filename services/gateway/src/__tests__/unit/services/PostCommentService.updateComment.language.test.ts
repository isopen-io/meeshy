/**
 * PostCommentService.updateComment — langue déclarée à l'édition (#6598).
 *
 * Fichier SÉPARÉ de `PostCommentService.test.ts` : celui-ci est déjà au
 * plafond de la dette héritée (`gateway-test-file-size-budget.test.ts`,
 * règle 3 — le cumul ne peut que descendre), donc interdit d'ajout.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PostCommentService } from '../../../services/PostCommentService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const COMMENT_ID = 'comment-edit-lang-1';
const AUTHOR_ID = 'author-lang-1';

let mockPrisma: Pick<PrismaClient, 'postComment' | 'commentReaction' | 'post' | 'postMedia'>;

beforeEach(() => {
  mockPrisma = {
    postComment: {
      findFirst: jest.fn().mockResolvedValue({
        id: COMMENT_ID, postId: 'post-1', authorId: AUTHOR_ID, content: 'Ancien texte',
      }),
      update: jest.fn().mockResolvedValue({
        id: COMMENT_ID, content: 'Nouveau texte', originalLanguage: 'lingala',
        isEdited: true, translations: {}, likeCount: 0, replyCount: 0, effectFlags: 0,
        parentId: null, createdAt: new Date('2025-01-01T00:00:00Z'), metadata: null,
        author: { id: AUTHOR_ID, username: 'alice', displayName: 'Alice', avatar: null },
      }),
    } as unknown as PrismaClient['postComment'],
    commentReaction: {} as unknown as PrismaClient['commentReaction'],
    post: {} as unknown as PrismaClient['post'],
    postMedia: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    } as unknown as PrismaClient['postMedia'],
  } as unknown as PrismaClient;
});

describe('PostCommentService.updateComment — langue déclarée par l appelant', () => {
  it('conserve la langue DÉCLARÉE quand le contenu change, au lieu de la remettre à null (#6598)', async () => {
    const service = new PostCommentService(mockPrisma as PrismaClient);

    await service.updateComment(COMMENT_ID, AUTHOR_ID, {
      content: 'Nouveau texte',
      originalLanguage: 'lingala',
    });

    const data = (mockPrisma.postComment.update as jest.Mock).mock.calls[0][0].data;
    // La devinette regex ne doit PLUS reprendre la main sur une déclaration —
    // c'est la « quatrième porte » de #6587 que #6598 ferme.
    expect(data.originalLanguage).toBe('lingala');
    expect(data.translations).toEqual({});
  });

  it('sans déclaration, le repli vers la redétection (null) reste inchangé', async () => {
    const service = new PostCommentService(mockPrisma as PrismaClient);

    await service.updateComment(COMMENT_ID, AUTHOR_ID, { content: 'Nouveau texte' });

    const data = (mockPrisma.postComment.update as jest.Mock).mock.calls[0][0].data;
    expect(data.originalLanguage).toBeNull();
  });
});
