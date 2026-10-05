/**
 * #9073 — les services de publication câblent la carte de liens suivis sur
 * TOUS les textes affichés, à la création comme à l'édition.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostService } from '../../../services/PostService';
import { PostCommentService } from '../../../services/PostCommentService';
import type { ContentTrackingLink, TrackingLinkService } from '../../../services/TrackingLinkService';

jest.mock('../../../services/posts/PostAudioService', () => ({
  PostAudioService: {
    shared: { processPostAudio: jest.fn().mockReturnValue(Promise.resolve()) },
    init: jest.fn(),
  },
}));

const POST_ID = '507f1f77bcf86cd799439011';
const COMMENT_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439099';

const urlsIn = (content: string): string[] => content.match(/https?:\/\/\S+/g) ?? [];

const fakeTracking = () => {
  const collect = jest.fn(async (params: { content: string }): Promise<ContentTrackingLink[]> =>
    [...new Set(urlsIn(params.content))].map((url) => ({ url, token: `tok:${url}` })));
  return { service: { collectContentTrackingLinks: collect } as unknown as TrackingLinkService, collect };
};

type Row = Record<string, unknown>;

const metadataWrites = (update: jest.Mock): unknown[] =>
  update.mock.calls
    .map((call) => call[0] as { data?: { metadata?: unknown } })
    .filter((arg) => arg?.data !== undefined && 'metadata' in arg.data && Object.keys(arg.data).length === 1)
    .map((arg) => arg.data?.metadata);

function postPrisma(persisted: Row) {
  const prisma = {
    post: {
      findFirst: jest.fn(async () => persisted),
      findUnique: jest.fn(async () => persisted),
      create: jest.fn(async () => persisted),
      update: jest.fn(async () => persisted),
    },
    postMedia: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      update: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    sound: { findMany: jest.fn(async () => []) },
    postView: { deleteMany: jest.fn(async () => ({})) },
    postReaction: { deleteMany: jest.fn(async () => ({})) },
    postImpression: { deleteMany: jest.fn(async () => ({})) },
    notification: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
    $transaction: jest.fn(async (arg: unknown): Promise<unknown> =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as Promise<unknown>[])),
  };
  return prisma;
}

const makePostService = (prisma: ReturnType<typeof postPrisma>, tracking: TrackingLinkService) =>
  new PostService(prisma as unknown as PrismaClient, undefined, undefined, undefined, tracking);

const persistedPost = (overrides: Row): Row => ({
  id: POST_ID,
  authorId: USER_ID,
  type: 'POST',
  visibility: 'PUBLIC',
  content: null,
  storyEffects: null,
  metadata: null,
  repostOfId: null,
  originalLanguage: 'fr',
  deletedAt: null,
  media: [],
  ...overrides,
});

describe('PostService — carte de liens suivis', () => {
  it('story LÉGENDÉE avec une URL dans un calque de texte ⇒ les deux URL reçoivent un jeton', async () => {
    const storyEffects = { v: 3, scenes: [{ id: 's', objects: [{ id: 'o', kind: 'text', payload: { text: 'https://layer.example' } }] }] };
    const prisma = postPrisma(persistedPost({ type: 'STORY', content: 'légende https://body.example', storyEffects }));
    const { service } = fakeTracking();

    const created = await makePostService(prisma, service).createPost(
      { type: 'STORY', visibility: 'PUBLIC', content: 'légende https://body.example', storyEffects } as never,
      USER_ID,
    );

    const expected = {
      trackingLinks: [
        { url: 'https://body.example', token: 'tok:https://body.example' },
        { url: 'https://layer.example', token: 'tok:https://layer.example' },
      ],
    };
    expect(metadataWrites(prisma.post.update)).toEqual([expected]);
    expect((created as Row).metadata).toEqual(expected);
  });

  it('URL dans la légende d’un média ⇒ jeton', async () => {
    const prisma = postPrisma(persistedPost({ content: 'sans lien', media: [{ id: 'm1', caption: 'source https://cap.example' }] }));
    const { service } = fakeTracking();

    const created = await makePostService(prisma, service).createPost(
      { type: 'POST', visibility: 'PUBLIC', content: 'sans lien', mediaIds: ['m1'], mediaCaption: { m1: 'source https://cap.example' } } as never,
      USER_ID,
    );

    expect((created as Row).metadata).toEqual({ trackingLinks: [{ url: 'https://cap.example', token: 'tok:https://cap.example' }] });
  });

  it('édition ⇒ carte recalculée et rendue (la diffusion socket hisse la nouvelle carte)', async () => {
    const before = persistedPost({
      content: 'https://gone.example',
      metadata: { trackingLinks: [{ url: 'https://gone.example', token: 'OLD' }] },
    });
    const after = { ...before, content: 'nouveau https://new.example' };
    const prisma = postPrisma(before);
    prisma.post.update.mockImplementation(async () => after);
    const { service } = fakeTracking();

    const updated = await makePostService(prisma, service).updatePost(POST_ID, USER_ID, { content: 'nouveau https://new.example' });

    const expected = { trackingLinks: [{ url: 'https://new.example', token: 'tok:https://new.example' }] };
    expect(metadataWrites(prisma.post.update)).toEqual([expected]);
    expect((updated as Row).metadata).toEqual(expected);
  });
});

function commentPrisma(comment: Row, media: Row[]) {
  return {
    post: {
      findFirst: jest.fn(async () => ({ id: POST_ID })),
      update: jest.fn(async () => ({})),
    },
    postComment: {
      create: jest.fn(async () => comment),
      findFirst: jest.fn(async () => ({ id: COMMENT_ID, postId: POST_ID, authorId: USER_ID, content: 'avant' })),
      update: jest.fn(async () => comment),
    },
    postMedia: {
      findMany: jest.fn(async () => media),
      updateMany: jest.fn(async () => ({ count: media.length })),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
      count: jest.fn(async () => media.length),
    },
    notification: { findMany: jest.fn(async () => []), updateMany: jest.fn(async () => ({ count: 0 })) },
  };
}

const commentRow = (overrides: Row): Row => ({ id: COMMENT_ID, postId: POST_ID, content: '', metadata: null, ...overrides });

describe('PostCommentService — carte de liens suivis', () => {
  it('commentaire + légende de son média ⇒ jetons pour les deux', async () => {
    const prisma = commentPrisma(commentRow({ content: 'vu https://body.example' }), [{ id: 'm1', caption: 'https://cap.example' }]);
    const { service } = fakeTracking();
    const svc = new PostCommentService(prisma as unknown as PrismaClient, service);

    prisma.postMedia.findMany.mockImplementationOnce(async () => [{ id: 'm1', postId: null, commentId: null }]);
    const comment = await svc.addComment(POST_ID, USER_ID, 'vu https://body.example', { mediaIds: ['m1'] });

    expect((comment as Row).metadata).toEqual({
      trackingLinks: [
        { url: 'https://body.example', token: 'tok:https://body.example' },
        { url: 'https://cap.example', token: 'tok:https://cap.example' },
      ],
    });
  });

  it('édition d’un commentaire ⇒ carte recalculée', async () => {
    const prisma = commentPrisma(
      commentRow({ content: 'https://new.example', metadata: { trackingLinks: [{ url: 'https://gone.example', token: 'OLD' }] } }),
      [],
    );
    const { service } = fakeTracking();
    const svc = new PostCommentService(prisma as unknown as PrismaClient, service);

    const updated = await svc.updateComment(COMMENT_ID, USER_ID, { content: 'https://new.example' });

    const expected = { trackingLinks: [{ url: 'https://new.example', token: 'tok:https://new.example' }] };
    expect(metadataWrites(prisma.postComment.update)).toEqual([expected]);
    expect((updated as Row).metadata).toEqual(expected);
  });
});
