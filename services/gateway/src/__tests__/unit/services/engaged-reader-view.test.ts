/**
 * @jest-environment node
 *
 * #10404 — réagir à un post ou le commenter crédite la VUE du lecteur.
 *
 * `viewCount` ne comptait que les `PostView` nés d'un événement `view`
 * explicite. Liker ou commenter depuis la carte du fil n'en émet aucun : un
 * post pouvait porter N réactions de lecteurs et `viewCount = 0` (prod : 131
 * réactions non-auteur sur 184, en 30 jours, sans `PostView`). Le crédit se
 * pose CÔTÉ PASSERELLE, donc pour tous les clients, anciens compris ; il suit
 * la règle de `recordView` — l'auteur n'est jamais compté.
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostService } from '../../../services/PostService';
import { PostCommentService } from '../../../services/PostCommentService';
import { counterWrite, postCounterWritesOf } from '../../helpers/posts-counter-writes';

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR = '507f1f77bcf86cd799439044';
const READER = '507f1f77bcf86cd799439033';

const makePrisma = () => {
  const postView = {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    create: jest.fn<any>().mockResolvedValue({ id: 'pv-1' }),
    update: jest.fn<any>().mockResolvedValue({}),
  };
  const $runCommandRaw = jest.fn<any>().mockResolvedValue({ ok: 1 });
  const prisma = {
    post: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: POST_ID, authorId: AUTHOR }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    postView,
    postComment: {
      findFirst: jest.fn<any>(),
      create: jest.fn<any>().mockResolvedValue({
        id: 'c-1', content: 'Bravo', originalLanguage: null, translations: null,
        likeCount: 0, replyCount: 0, effectFlags: 0, parentId: null,
        createdAt: new Date('2026-10-12T00:00:00Z'), metadata: null,
        author: { id: READER, username: 'reader', displayName: 'Reader', avatar: null },
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    postMedia: { findMany: jest.fn<any>().mockResolvedValue([]), updateMany: jest.fn<any>() },
    $runCommandRaw,
  };
  return prisma;
};

const likingService = (prisma: ReturnType<typeof makePrisma>) =>
  new PostService(
    prisma as unknown as PrismaClient,
    undefined,
    undefined,
    { addReaction: jest.fn<any>().mockResolvedValue({ id: 'r-1', unchanged: false }) } as never,
  );

const commentingService = (prisma: ReturnType<typeof makePrisma>) =>
  new PostCommentService(
    prisma as unknown as PrismaClient,
    { collectContentTrackingLinks: jest.fn<any>().mockResolvedValue([]) } as never,
    { recordActivity: jest.fn<any>().mockResolvedValue(undefined) } as never,
  );

describe('#10404 — une réaction de lecteur crédite sa vue', () => {
  it('un like d\'un lecteur crée son PostView et compte la vue', async () => {
    const prisma = makePrisma();

    await likingService(prisma).likePost(POST_ID, READER, '❤️');

    expect(prisma.postView.create).toHaveBeenCalledWith({ data: { postId: POST_ID, userId: READER, duration: undefined } });
    expect(postCounterWritesOf(prisma.$runCommandRaw)).toEqual([
      counterWrite([POST_ID], { viewCount: { increment: 1 }, uniqueViewCount: { increment: 1 } }),
    ]);
  });

  it('le like de l\'auteur sur son propre post ne compte aucune vue', async () => {
    const prisma = makePrisma();

    await likingService(prisma).likePost(POST_ID, AUTHOR, '❤️');

    expect(prisma.postView.create).not.toHaveBeenCalled();
    expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
  });

  it('un lecteur qui avait déjà vu le post n\'est pas recompté', async () => {
    const prisma = makePrisma();
    prisma.postView.findUnique.mockResolvedValue({ id: 'pv-0', duration: null });

    await likingService(prisma).likePost(POST_ID, READER, '❤️');

    expect(prisma.postView.create).not.toHaveBeenCalled();
    expect(prisma.$runCommandRaw).not.toHaveBeenCalled();
  });
});

describe('#10404 — un commentaire de lecteur crédite sa vue', () => {
  it('commenter le post d\'un autre crée son PostView', async () => {
    const prisma = makePrisma();

    await commentingService(prisma).addComment(POST_ID, READER, 'Bravo');

    expect(prisma.postView.create).toHaveBeenCalledWith({ data: { postId: POST_ID, userId: READER, duration: undefined } });
  });

  it('l\'auteur qui répond sous son propre post ne compte aucune vue', async () => {
    const prisma = makePrisma();

    await commentingService(prisma).addComment(POST_ID, AUTHOR, 'Merci');

    expect(prisma.postView.create).not.toHaveBeenCalled();
  });
});
