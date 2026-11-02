/**
 * LES SITES D'ÉCRITURE ENREGISTRENT LEUR INTERACTION (#13932) — un appel de
 * l'enregistreur par site, sans changer leur contrat. Chaque témoin lit l'état de
 * l'agrégat après le geste, dans le double partagé (`pairInteractionStore`).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { ReactionService } from '../../../../services/ReactionService';
import { PostReactionService } from '../../../../services/PostReactionService';
import { CommentReactionService } from '../../../../services/CommentReactionService';
import { PostCommentService } from '../../../../services/PostCommentService';
import { recordView } from '../../../../services/posts/postReach';
import { noteAnsweredCall } from '../../../../services/relations/callInteractions';
import { noteRepostInteraction } from '../../../../routes/posts/repostedAuthorNotification';
import { pairInteractionStore } from '../../../helpers/pair-interaction-store';

const ME = '5f0000000000000000000001';
const AUTHOR = '5f0000000000000000000002';
const settle = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

describe('réaction à un message', () => {
  const MESSAGE_ID = '507f1f77bcf86cd799439011';
  const PARTICIPANT_ID = '507f1f77bcf86cd799439033';

  const build = (reactorUserId: string | null) => {
    const store = pairInteractionStore();
    const prisma = {
      ...store.prisma,
      message: {
        findUnique: jest.fn(async () => ({
          id: MESSAGE_ID, conversationId: 'cv', senderId: 'author-participant', sender: { userId: AUTHOR }, deletedAt: null, messageType: 'text',
          conversation: { id: 'cv', isActive: true, closedAt: null, participants: [{ id: PARTICIPANT_ID, userId: reactorUserId }] },
        })),
        update: jest.fn(async () => ({})),
      },
      reaction: {
        findFirst: jest.fn(async () => null),
        count: jest.fn(async () => 0),
        groupBy: jest.fn(async () => []),
        findMany: jest.fn(async () => []),
        upsert: jest.fn(async () => ({ id: 'r1', messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️', createdAt: new Date('2026-10-31T10:00:00Z'), updatedAt: new Date() })),
      },
      conversation: { update: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 1 })) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    return { store, prisma };
  };

  it('compte une réaction du réacteur envers l’auteur du message', async () => {
    const { store, prisma } = build(ME);
    await new ReactionService(prisma as never).addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });
    await settle();

    expect(store.days()).toHaveLength(1);
    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: AUTHOR, byLowReaction: 1 });
  });

  it('ne compte rien pour un réacteur anonyme', async () => {
    const { store, prisma } = build(null);
    await new ReactionService(prisma as never).addReaction({ messageId: MESSAGE_ID, participantId: PARTICIPANT_ID, emoji: '❤️' });
    await settle();

    expect(store.days()).toHaveLength(0);
  });
});

describe('réaction à un post', () => {
  const POST_ID = '507f1f77bcf86cd799439011';

  it('compte une réaction envers l’auteur du post, et rien quand la réaction était déjà posée', async () => {
    const store = pairInteractionStore();
    let already = false;
    const prisma = {
      ...store.prisma,
      post: { findUnique: jest.fn(async () => ({ id: POST_ID, deletedAt: null, authorId: AUTHOR, type: 'POST' })) },
      postReaction: {
        findFirst: jest.fn(async () => (already ? { id: 'r0', postId: POST_ID, userId: ME, emoji: '🎉', createdAt: new Date(), updatedAt: new Date() } : null)),
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: { data: { emoji: string } }) => ({ id: 'r1', postId: POST_ID, userId: ME, emoji: data.emoji, createdAt: new Date('2026-10-31T10:00:00Z'), updatedAt: new Date() })),
        groupBy: jest.fn(async () => []),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ post: { findUnique: jest.fn(async () => ({ id: POST_ID })), update: jest.fn() }, postReaction: { groupBy: jest.fn(async () => []) } })),
    };
    const service = new PostReactionService(prisma as never);

    await service.addReaction({ postId: POST_ID, userId: ME, emoji: '🎉' });
    await settle();
    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: AUTHOR, byLowReaction: 1 });

    already = true;
    await service.addReaction({ postId: POST_ID, userId: ME, emoji: '🎉' });
    await settle();
    expect(store.days()[0].byLowReaction).toBe(1);
  });

  it('ne compte pas sa propre réaction à son propre post', async () => {
    const store = pairInteractionStore();
    const prisma = {
      ...store.prisma,
      post: { findUnique: jest.fn(async () => ({ id: POST_ID, deletedAt: null, authorId: ME, type: 'POST' })) },
      postReaction: {
        findFirst: jest.fn(async () => null),
        count: jest.fn(async () => 0),
        create: jest.fn(async () => ({ id: 'r1', postId: POST_ID, userId: ME, emoji: '🎉', createdAt: new Date(), updatedAt: new Date() })),
        groupBy: jest.fn(async () => []),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ post: { findUnique: jest.fn(async () => ({ id: POST_ID })), update: jest.fn() }, postReaction: { groupBy: jest.fn(async () => []) } })),
    };
    await new PostReactionService(prisma as never).addReaction({ postId: POST_ID, userId: ME, emoji: '🎉' });
    await settle();

    expect(store.days()).toHaveLength(0);
  });
});

describe('réaction à un commentaire', () => {
  it('REST : likeComment compte envers l’auteur du commentaire, une fois', async () => {
    const store = pairInteractionStore();
    let present = false;
    const prisma = {
      ...store.prisma,
      postComment: {
        findFirst: jest.fn(async () => ({ id: 'c1', postId: 'p1', authorId: AUTHOR })),
        update: jest.fn(async () => ({ id: 'c1', postId: 'p1', authorId: AUTHOR, content: 'x', likeCount: 1, reactionSummary: {} })),
      },
      commentReaction: {
        findFirst: jest.fn(async () => (present ? { id: 'r0' } : null)),
        count: jest.fn(async () => 0),
        upsert: jest.fn(async () => ({ id: 'r1' })),
        groupBy: jest.fn(async () => []),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
    };
    const service = new PostCommentService(prisma as never);
    await service.likeComment('c1', ME, '👍');
    await settle();
    present = true;
    await service.likeComment('c1', ME, '👍');
    await settle();

    expect(store.days()).toHaveLength(1);
    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: AUTHOR, byLowReaction: 1 });
  });

  it('socket : CommentReactionService.addReaction compte envers l’auteur du commentaire', async () => {
    const store = pairInteractionStore();
    const prisma = {
      ...store.prisma,
      postComment: { findUnique: jest.fn(async () => ({ id: '507f1f77bcf86cd799439011', postId: 'p1', authorId: AUTHOR, deletedAt: null })) },
      commentReaction: {
        findFirst: jest.fn(async () => null),
        count: jest.fn(async () => 0),
        create: jest.fn(async () => ({ id: 'r1', commentId: 'c1', userId: ME, emoji: '👍', createdAt: new Date('2026-10-31T10:00:00Z'), updatedAt: new Date() })),
        groupBy: jest.fn(async () => []),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ postComment: { findUnique: jest.fn(async () => ({ id: 'c1' })), update: jest.fn() }, commentReaction: { groupBy: jest.fn(async () => []) } })),
    };
    await new CommentReactionService(prisma as never).addReaction({ commentId: '507f1f77bcf86cd799439011', userId: ME, emoji: '👍' });
    await settle();

    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: AUTHOR, byLowReaction: 1 });
  });
});

describe('commentaire', () => {
  const buildComment = (parentAuthorId: string | null) => {
    const store = pairInteractionStore();
    const prisma = {
      ...store.prisma,
      post: { findFirst: jest.fn(async () => ({ id: 'p1', authorId: AUTHOR })), update: jest.fn(async () => ({})) },
      postComment: {
        findFirst: jest.fn(async () => (parentAuthorId ? { id: 'parent', authorId: parentAuthorId } : null)),
        create: jest.fn(async () => ({
          id: 'c-new', content: 'x', originalLanguage: null, translations: null, likeCount: 0, replyCount: 0, effectFlags: 0, parentId: null,
          createdAt: new Date('2026-10-31T10:00:00Z'), metadata: null, author: { id: ME, username: 'me', displayName: 'Me', avatar: null },
        })),
        update: jest.fn(async () => ({})),
      },
      postMedia: { findUnique: jest.fn(), findMany: jest.fn(async () => []), update: jest.fn(), create: jest.fn(), delete: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    };
    const links = { collectContentTrackingLinks: jest.fn(async () => []) };
    return { store, service: new PostCommentService(prisma as never, links as never) };
  };

  it('commenter le post de l’autre compte envers son auteur', async () => {
    const { store, service } = buildComment(null);
    await service.addComment('p1', ME, 'Bravo');
    await settle();

    expect(store.days()).toHaveLength(1);
    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: AUTHOR, byLowComment: 1 });
  });

  it('répondre au commentaire d’un tiers compte aussi envers lui', async () => {
    const THIRD = '5f0000000000000000000003';
    const { store, service } = buildComment(THIRD);
    await service.addComment('p1', ME, 'Bravo', { parentId: 'parent' });
    await settle();

    expect(store.days().map((d) => d.userHighId).sort()).toEqual([AUTHOR, THIRD]);
  });
});

describe('vue d’un post', () => {
  const buildViews = () => {
    const store = pairInteractionStore();
    const post = { id: 'p1', authorId: AUTHOR, repostOfId: null, originalRepostOfId: null, type: 'POST', expiresAt: null };
    const views: Array<{ postId: string; userId: string }> = [];
    const prisma = {
      ...store.prisma,
      post: { findFirst: jest.fn(async () => post), update: jest.fn(async () => ({})), updateMany: jest.fn(async () => ({ count: 1 })) },
      postMention: { findUnique: jest.fn(async () => null) },
      $runCommandRaw: jest.fn(async () => ({ ok: 1 })),
      postView: {
        findUnique: jest.fn(async ({ where }: { where: { postId_userId: { postId: string; userId: string } } }) =>
          views.find((v) => v.postId === where.postId_userId.postId && v.userId === where.postId_userId.userId) ?? null),
        create: jest.fn(async ({ data }: { data: { postId: string; userId: string } }) => {
          views.push({ postId: data.postId, userId: data.userId });
          return { id: 'v' };
        }),
        update: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    };
    return { store, deps: { prisma: prisma as never, visibilityFilter: async () => ({}) } };
  };

  it('une NOUVELLE vue du contenu de l’autre compte envers son auteur ; la revoir ne recompte pas', async () => {
    const { store, deps } = buildViews();
    await recordView(deps, 'p1', ME);
    await settle();
    expect(store.days()).toHaveLength(1);
    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: AUTHOR, byLowPostView: 1 });

    await recordView(deps, 'p1', ME);
    await settle();
    expect(store.days()[0].byLowPostView).toBe(1);
  });

  it('l’auteur qui rouvre son propre contenu ne compte pour personne', async () => {
    const { store, deps } = buildViews();
    await recordView(deps, 'p1', AUTHOR);
    await settle();

    expect(store.days()).toHaveLength(0);
  });
});

describe('republication', () => {
  it('republier le contenu de l’autre compte un partage envers son auteur', async () => {
    const store = pairInteractionStore();
    noteRepostInteraction(store.prisma as never, { actorId: ME, source: { authorId: AUTHOR } });
    await settle();

    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: AUTHOR, byLowShare: 1 });
  });

  it('ne compte pas la republication de son propre contenu ni une source illisible', async () => {
    const store = pairInteractionStore();
    noteRepostInteraction(store.prisma as never, { actorId: ME, source: { authorId: ME } });
    noteRepostInteraction(store.prisma as never, { actorId: ME, source: null });
    await settle();

    expect(store.days()).toHaveLength(0);
  });
});

describe('appel décroché', () => {
  const callDb = (userIds: Array<string | null>) => {
    const store = pairInteractionStore();
    return {
      store,
      prisma: { ...store.prisma, callParticipant: { findMany: jest.fn(async () => userIds.map((userId) => ({ participant: { userId } }))) } },
    };
  };

  it('un appel à deux compte dans les DEUX sens', async () => {
    const { store, prisma } = callDb([ME, AUTHOR]);
    noteAnsweredCall(prisma as never, { callId: 'call1', at: new Date('2026-10-31T10:00:00Z') });
    await settle();

    expect(store.days()[0]).toMatchObject({ userLowId: ME, userHighId: AUTHOR, byLowCall: 1, byHighCall: 1 });
  });

  it('un appel de groupe n’adresse personne : rien n’est compté', async () => {
    const { store, prisma } = callDb([ME, AUTHOR, '5f0000000000000000000003']);
    noteAnsweredCall(prisma as never, { callId: 'call1' });
    await settle();

    expect(store.days()).toHaveLength(0);
  });

  it('un appel avec un participant anonyme ne compte pas', async () => {
    const { store, prisma } = callDb([ME, null]);
    noteAnsweredCall(prisma as never, { callId: 'call1' });
    await settle();

    expect(store.days()).toHaveLength(0);
  });
});
