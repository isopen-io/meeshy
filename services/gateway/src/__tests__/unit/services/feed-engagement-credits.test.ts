/**
 * Les crédits du barème (#8959) posés par les gestes du fil : réagir à un
 * post, aimer un commentaire (deux chemins, un seul crédit), répondre à un
 * sondage — et la reprise des points d'un contenu lourd retiré.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { PostReactionService } from '../../../services/PostReactionService';
import { CommentReactionService } from '../../../services/CommentReactionService';
import { PostCommentService } from '../../../services/PostCommentService';
import { PostInteractiveResponseService } from '../../../services/PostInteractiveResponseService';
import { applyPostRemovalEffects } from '../../../services/posts/postRemovalEffects';
import {
  creditStoryViewed,
  STORY_VIEWED_MIN_DURATION_MS,
} from '../../../services/posts/postEngagementCredits';

const POST_ID = '507f1f77bcf86cd799439011';
const COMMENT_ID = '507f1f77bcf86cd799439022';
const READER_ID = '64a000000000000000000001';
const AUTHOR_ID = '64a000000000000000000002';
const MODERATOR_ID = '64a000000000000000000003';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function makeRecorder() {
  return {
    recordActivity: jest.fn<any>().mockResolvedValue(undefined),
    reclaimContent: jest.fn<any>().mockResolvedValue(0),
  };
}

const reactionRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'reaction-1',
  postId: POST_ID,
  commentId: COMMENT_ID,
  userId: READER_ID,
  emoji: '❤️',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('tool.post_reaction — PostReactionService.addReaction', () => {
  function makePrisma(existing: unknown) {
    return {
      post: { findUnique: jest.fn<any>().mockResolvedValue({ id: POST_ID, deletedAt: null, authorId: AUTHOR_ID }) },
      postReaction: {
        findFirst: jest.fn<any>().mockResolvedValue(existing),
        count: jest.fn<any>().mockResolvedValue(0),
        create: jest.fn<any>().mockResolvedValue(reactionRow()),
      },
      $transaction: jest.fn<any>().mockResolvedValue(undefined),
    };
  }

  it('crédite le réacteur sur une réaction CRÉÉE, avec le post et son auteur', async () => {
    const recorder = makeRecorder();
    const service = new PostReactionService(makePrisma(null) as any, recorder);

    const result = await service.addReaction({ postId: POST_ID, userId: READER_ID, emoji: '❤️' });
    await settle();

    expect(result?.unchanged).toBe(false);
    expect(recorder.recordActivity).toHaveBeenCalledWith(READER_ID, 'tool.post_reaction', {
      targetId: POST_ID,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it('ne crédite rien quand la réaction existait déjà (unchanged)', async () => {
    const recorder = makeRecorder();
    const service = new PostReactionService(makePrisma(reactionRow()) as any, recorder);

    const result = await service.addReaction({ postId: POST_ID, userId: READER_ID, emoji: '❤️' });
    await settle();

    expect(result?.unchanged).toBe(true);
    expect(recorder.recordActivity).not.toHaveBeenCalled();
  });

  it('un crédit en échec ne fait pas échouer la réaction', async () => {
    const recorder = makeRecorder();
    recorder.recordActivity.mockRejectedValue(new Error('mongo down'));
    const service = new PostReactionService(makePrisma(null) as any, recorder);

    await expect(service.addReaction({ postId: POST_ID, userId: READER_ID, emoji: '❤️' })).resolves.toMatchObject({
      unchanged: false,
    });
    await settle();
  });
});

describe('tool.comment_like — un like, un crédit, par l’un ou l’autre chemin', () => {
  it('socket (CommentReactionService) : crédite une réaction créée, avec l’auteur du commentaire', async () => {
    const recorder = makeRecorder();
    const prisma = {
      postComment: { findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, deletedAt: null, authorId: AUTHOR_ID }) },
      commentReaction: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        count: jest.fn<any>().mockResolvedValue(0),
        create: jest.fn<any>().mockResolvedValue(reactionRow()),
      },
      $transaction: jest.fn<any>().mockResolvedValue(undefined),
    };
    const service = new CommentReactionService(prisma as any, recorder);

    await service.addReaction({ commentId: COMMENT_ID, userId: READER_ID, emoji: '❤️' });
    await settle();

    expect(recorder.recordActivity).toHaveBeenCalledWith(READER_ID, 'tool.comment_like', {
      targetId: COMMENT_ID,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it('socket : une réaction déjà posée ne recrédite pas', async () => {
    const recorder = makeRecorder();
    const prisma = {
      postComment: { findUnique: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, deletedAt: null, authorId: AUTHOR_ID }) },
      commentReaction: { findFirst: jest.fn<any>().mockResolvedValue(reactionRow()) },
    };
    const service = new CommentReactionService(prisma as any, recorder);

    await service.addReaction({ commentId: COMMENT_ID, userId: READER_ID, emoji: '❤️' });
    await settle();

    expect(recorder.recordActivity).not.toHaveBeenCalled();
  });

  function makeRestPrisma(alreadyHasThisEmoji: boolean) {
    return {
      postComment: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, authorId: AUTHOR_ID }),
        update: jest.fn<any>().mockResolvedValue({ id: COMMENT_ID, likeCount: 1, reactionSummary: {} }),
      },
      commentReaction: {
        findFirst: jest.fn<any>().mockResolvedValue(alreadyHasThisEmoji ? { id: 'reaction-1' } : null),
        count: jest.fn<any>().mockResolvedValue(0),
        upsert: jest.fn<any>().mockResolvedValue({}),
        groupBy: jest.fn<any>().mockResolvedValue([]),
      },
    };
  }

  it('REST (PostCommentService.likeComment) : crédite un emoji qui n’était pas posé', async () => {
    const recorder = makeRecorder();
    const service = new PostCommentService(makeRestPrisma(false) as any, undefined, recorder);

    await service.likeComment(COMMENT_ID, READER_ID, '❤️');
    await settle();

    expect(recorder.recordActivity).toHaveBeenCalledWith(READER_ID, 'tool.comment_like', {
      targetId: COMMENT_ID,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it('REST en repli derrière un socket qui a déjà posé l’emoji : aucun second crédit', async () => {
    const recorder = makeRecorder();
    const service = new PostCommentService(makeRestPrisma(true) as any, undefined, recorder);

    await service.likeComment(COMMENT_ID, READER_ID, '❤️');
    await settle();

    expect(recorder.recordActivity).not.toHaveBeenCalled();
  });
});

describe('tool.poll_answered — PostInteractiveResponseService.submitResponse', () => {
  function makePrisma(previous: unknown) {
    return {
      post: { findUnique: jest.fn<any>().mockResolvedValue({ id: POST_ID, deletedAt: null, authorId: AUTHOR_ID }) },
      postInteractiveResponse: {
        findUnique: jest.fn<any>().mockResolvedValue(previous),
        upsert: jest.fn<any>().mockResolvedValue({
          id: 'response-1', postId: POST_ID, objectId: 'poll-1', userId: READER_ID,
          choice: 'a', numericValue: null, text: null, createdAt: new Date(), updatedAt: new Date(),
        }),
      },
    };
  }

  it('crédite la PREMIÈRE réponse, cible = post:objet, propriétaire = auteur du post', async () => {
    const recorder = makeRecorder();
    const service = new PostInteractiveResponseService(makePrisma(null) as any, recorder);

    await service.submitResponse({ postId: POST_ID, objectId: 'poll-1', userId: READER_ID, choice: 'a' });
    await settle();

    expect(recorder.recordActivity).toHaveBeenCalledWith(READER_ID, 'tool.poll_answered', {
      targetId: `${POST_ID}:poll-1`,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it('changer son vote ne recrédite pas', async () => {
    const recorder = makeRecorder();
    const service = new PostInteractiveResponseService(makePrisma({ id: 'response-1' }) as any, recorder);

    await service.submitResponse({ postId: POST_ID, objectId: 'poll-1', userId: READER_ID, choice: 'b' });
    await settle();

    expect(recorder.recordActivity).not.toHaveBeenCalled();
  });
});

describe('tool.story_viewed — une vue NOUVELLE d’une story, regardée au moins cinq secondes', () => {
  const story = { id: POST_ID, authorId: AUTHOR_ID, type: 'STORY' };
  const view = (overrides: Partial<Parameters<typeof creditStoryViewed>[1]> = {}) => ({
    viewerId: READER_ID,
    story,
    isNewView: true,
    durationMs: STORY_VIEWED_MIN_DURATION_MS,
    ...overrides,
  });

  it('crédite le lecteur, cible = story, propriétaire = auteur', async () => {
    const recorder = makeRecorder();
    creditStoryViewed({} as any, view(), recorder);
    await settle();

    expect(recorder.recordActivity).toHaveBeenCalledWith(READER_ID, 'tool.story_viewed', {
      targetId: POST_ID,
      targetOwnerId: AUTHOR_ID,
    });
  });

  it.each([
    ['une vue déjà comptée', { isNewView: false }],
    ['une vue sans durée déclarée', { durationMs: undefined }],
    ['une story passée en moins de cinq secondes', { durationMs: STORY_VIEWED_MIN_DURATION_MS - 1 }],
    ['un POST, pas une story', { story: { ...story, type: 'POST' } }],
  ])('ne crédite pas %s', async (_label, overrides) => {
    const recorder = makeRecorder();
    creditStoryViewed({} as any, view(overrides), recorder);
    await settle();

    expect(recorder.recordActivity).not.toHaveBeenCalled();
  });
});

describe('reprise anti-abus — applyPostRemovalEffects', () => {
  const prisma = {
    adminAuditLog: { create: jest.fn<any>().mockResolvedValue({}) },
    trackingLink: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    notification: { deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ cursor: { firstBatch: [], id: 0 }, ok: 1 }),
  } as any;
  const soundCapture = { releasePost: jest.fn<any>().mockResolvedValue(undefined) };

  it.each([
    ['POST', 'content.post'],
    ['STORY', 'content.story'],
    ['REEL', 'content.reel'],
  ])('un %s retiré par son auteur rend ses points (%s)', async (type, operationKey) => {
    const recorder = makeRecorder();
    await applyPostRemovalEffects(prisma, { id: POST_ID, authorId: AUTHOR_ID, type }, { id: AUTHOR_ID }, soundCapture, undefined, recorder);
    await settle();

    expect(recorder.reclaimContent).toHaveBeenCalledWith(AUTHOR_ID, operationKey, POST_ID);
  });

  it('un retrait par un modérateur reprend les points de l’AUTEUR, pas du modérateur', async () => {
    const recorder = makeRecorder();
    await applyPostRemovalEffects(prisma, { id: POST_ID, authorId: AUTHOR_ID, type: 'POST' }, { id: MODERATOR_ID }, soundCapture, undefined, recorder);
    await settle();

    expect(recorder.reclaimContent).toHaveBeenCalledWith(AUTHOR_ID, 'content.post', POST_ID);
  });

  it('un STATUS retiré ne reprend rien — ce n’est pas un contenu lourd', async () => {
    const recorder = makeRecorder();
    await applyPostRemovalEffects(prisma, { id: POST_ID, authorId: AUTHOR_ID, type: 'STATUS' }, { id: AUTHOR_ID }, soundCapture, undefined, recorder);
    await settle();

    expect(recorder.reclaimContent).not.toHaveBeenCalled();
  });

  it('une reprise en échec ne fait pas échouer le retrait', async () => {
    const recorder = makeRecorder();
    recorder.reclaimContent.mockRejectedValue(new Error('mongo down'));

    await expect(
      applyPostRemovalEffects(prisma, { id: POST_ID, authorId: AUTHOR_ID, type: 'REEL' }, { id: AUTHOR_ID }, soundCapture, undefined, recorder),
    ).resolves.toBeUndefined();
    await settle();
  });
});
