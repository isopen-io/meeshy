/**
 * #9476 — `POST /posts` publie une story ET son réel d'un seul geste, et un
 * client qui n'envoie que `type` publie exactement comme avant.
 *
 * La route est montée pour de vrai ; seul `PostService` est doublé — c'est la
 * PORTE qu'on mesure : ce qu'elle remet à `createPost`, combien de fois, avec
 * quels médias, et ce qu'elle répond.
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { registerCoreRoutes } from '../core';

jest.mock('../../../services/PostService', () => ({ PostService: jest.fn() }));

jest.mock('../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({
    duplicate: jest.fn(async (url: string) => ({
      fileName: 'copy.jpg', filePath: '2026/10/copy.jpg', fileUrl: `${url}#copy`, fileSize: 10, mimeType: 'image/jpeg',
    })),
    delete: jest.fn(async () => undefined),
  })),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../services/posts/StoryTextObjectTranslationService', () => ({
  StoryTextObjectTranslationService: {
    shared: { handleTranslationCompleted: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) },
  },
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn(() => []),
    resolveUsernames: jest.fn(async () => new Map()),
    createPostMentions: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn(({ op }: { op: () => Promise<unknown> }) => op()),
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }),
  }),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

const AUTHOR_ID = '64b000000000000000000001';
const PHOTO = '64c000000000000000000001';
const SOUND = '64d000000000000000000001';

type CreateArgs = { type: string; mediaIds?: string[]; alsoAsReel?: unknown; storyEffects?: unknown };

const STORY_DU_PORTEUR = {
  type: 'STORY',
  content: 'Le marché ce matin',
  mediaIds: [PHOTO],
  storyEffects: {
    mediaObjects: [{ id: 'm1', postMediaId: PHOTO, kind: 'image' }],
    audioPlayerObjects: [{ id: 'a1', soundId: SOUND, duration: 238 }],
  },
};

function makePrisma(options: { readonly soundDurationMs: number }) {
  let created = 0;
  return {
    postMedia: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.includes(PHOTO)
          ? [{
              id: PHOTO, fileName: 'p.jpg', originalName: 'p.jpg', mimeType: 'image/jpeg', fileSize: 10,
              filePath: 'p.jpg', fileUrl: '/f/p.jpg', width: 1, height: 1, thumbnailUrl: null,
              thumbHash: null, duration: null, codec: null,
            }]
          : []),
      create: jest.fn(async () => { created += 1; return { id: `64e00000000000000000000${created}` }; }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    sound: {
      findMany: jest.fn(async () => [
        { id: SOUND, durationMs: options.soundDurationMs, isPublic: true, uploaderId: 'other', mutedAt: null },
      ]),
    },
  };
}

async function publish(payload: Record<string, unknown>, options = { soundDurationMs: 238_000 }) {
  const createPost = jest.fn(async (args: CreateArgs) => ({
    id: args.type === 'REEL' ? 'reel-1' : 'story-1',
    type: args.type,
    authorId: AUTHOR_ID,
    visibility: 'FRIENDS',
    content: 'Le marché ce matin',
    originalLanguage: 'fr',
    storyEffects: args.storyEffects,
    mediaIds: args.mediaIds,
  }));
  const deletePost = jest.fn(async () => ({}));
  const { PostService } = await import('../../../services/PostService');
  (PostService as unknown as jest.Mock).mockImplementation(() => ({
    createPost, deletePost, getPostById: jest.fn(), updatePost: jest.fn(),
  }));

  const app: FastifyInstance = Fastify({ logger: false });
  const broadcasts = {
    broadcastStoryCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    broadcastPostCreated: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  (app as unknown as Record<string, unknown>).socialEvents = broadcasts;
  const requiredAuth = async (request: import('fastify').FastifyRequest) => {
    (request as unknown as Record<string, unknown>).authContext = {
      isAuthenticated: true,
      registeredUser: { id: AUTHOR_ID, emailVerifiedAt: new Date() },
    };
  };
  registerCoreRoutes(app, makePrisma(options) as never, requiredAuth);
  await app.ready();
  const res = await app.inject({ method: 'POST', url: '/posts', payload });
  await app.close();
  return { res, body: res.json() as Record<string, any>, createPost, deletePost, broadcasts };
}

describe('POST /posts — « aussi en réel » (#9476)', () => {
  it('un ANCIEN client (seul `type`) publie UNE story, comme avant, sans champ `reel`', async () => {
    const { res, body, createPost } = await publish(STORY_DU_PORTEUR);

    expect(res.statusCode).toBe(201);
    expect(createPost).toHaveBeenCalledTimes(1);
    expect(createPost.mock.calls[0][0]).toMatchObject({ type: 'STORY', mediaIds: [PHOTO] });
    expect(createPost.mock.calls[0][0]).not.toHaveProperty('alsoAsReel');
    expect(body.data.id).toBe('story-1');
    expect(body.data).not.toHaveProperty('reel');
  });

  it('`alsoAsReel` publie la story PUIS un réel sur ses propres médias, et rend les deux', async () => {
    const { res, body, createPost, broadcasts } = await publish({ ...STORY_DU_PORTEUR, alsoAsReel: true });

    expect(res.statusCode).toBe(201);
    expect(createPost.mock.calls.map(([args]) => args.type)).toEqual(['STORY', 'REEL']);
    const storyMedia = createPost.mock.calls[0][0].mediaIds ?? [];
    const reelMedia = createPost.mock.calls[1][0].mediaIds ?? [];
    expect(storyMedia).toEqual([PHOTO]);
    expect(reelMedia).toHaveLength(1);
    expect(reelMedia[0]).not.toBe(PHOTO);
    expect(body.data.id).toBe('story-1');
    expect(body.data.type).toBe('STORY');
    expect(body.data.reel).toMatchObject({ id: 'reel-1', type: 'REEL' });
    expect(broadcasts.broadcastStoryCreated).toHaveBeenCalledTimes(1);
    expect(broadcasts.broadcastPostCreated).toHaveBeenCalledTimes(1);
  });

  it('`alsoAsReel` sur autre chose qu’une story est refusé AVANT toute écriture', async () => {
    const { res, body, createPost } = await publish({ ...STORY_DU_PORTEUR, type: 'POST', alsoAsReel: true });

    expect(res.statusCode).toBe(400);
    expect(body.code).toBe('ALSO_AS_REEL_REQUIRES_STORY');
    expect(createPost).not.toHaveBeenCalled();
  });

  it('un réel qui ne qualifie pas (son de 2 s) refuse le geste entier en 422, rien ne part', async () => {
    const { res, body, createPost } = await publish(
      { ...STORY_DU_PORTEUR, alsoAsReel: true },
      { soundDurationMs: 2000 },
    );

    expect(res.statusCode).toBe(422);
    expect(body.code).toBe('REEL_NOT_QUALIFIED');
    expect(createPost).not.toHaveBeenCalled();
  });
});
