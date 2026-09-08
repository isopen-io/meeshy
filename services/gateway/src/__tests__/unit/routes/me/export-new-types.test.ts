/**
 * Route-level tests for the sections GET /me/export gained in #3633:
 * posts, stories, comments, reactions, media, voiceProfile, sessions —
 * plus the shared `limit`/`offset` pagination and `<type>HasMore` flags.
 *
 * Fichier SÉPARÉ de `me-export.test.ts` / `me/export.test.ts` (déjà bien
 * remplis avec profile/messages/contacts) pour rester sous le budget de
 * taille du fichier de test — patron déjà suivi pour #3627.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { dataExportRoutes } from '../../../../routes/me/export';

const USER_ID = '507f1f77bcf86cd799439011';

function basePrisma(overrides: Record<string, any> = {}) {
  return {
    user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    post: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postComment: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    commentReaction: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    postMedia: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    userVoiceModel: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    userSession: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    ...overrides,
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, userId: USER_ID, registeredUser: { id: USER_ID } };
  });
  await app.register(dataExportRoutes);
  await app.ready();
  return app;
}

describe('GET /export — posts', () => {
  it('returns posts, postsCount and postsHasMore', async () => {
    const prisma = basePrisma({
      post: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'p1', type: 'POST' }]),
        count: jest.fn<any>().mockResolvedValue(3),
      },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=posts&limit=1' });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.posts).toEqual([{ id: 'p1', type: 'POST' }]);
    expect(body.postsCount).toBe(3);
    expect(body.postsHasMore).toBe(true);
    await app.close();
  });
});

describe('GET /export — stories', () => {
  it('returns stories independently of posts', async () => {
    const prisma = basePrisma({
      post: { findMany: jest.fn<any>().mockResolvedValue([{ id: 's1', type: 'STORY' }]), count: jest.fn<any>().mockResolvedValue(1) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=stories' });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.stories).toEqual([{ id: 's1', type: 'STORY' }]);
    expect(body.storiesCount).toBe(1);
    expect(body.posts).toBeUndefined();
    await app.close();
  });
});

describe('GET /export — comments', () => {
  it('returns comments, commentsCount, commentsHasMore', async () => {
    const prisma = basePrisma({
      postComment: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'c1' }]), count: jest.fn<any>().mockResolvedValue(1) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=comments' });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.comments).toEqual([{ id: 'c1' }]);
    expect(body.commentsHasMore).toBe(false);
    await app.close();
  });
});

describe('GET /export — reactions', () => {
  it('resolves participant ids once and returns the three reaction sub-sections', async () => {
    const prisma = basePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-1' }]) },
      reaction: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'r1', emoji: '👍' }]), count: jest.fn<any>().mockResolvedValue(1) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=reactions' });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.reactions.messages).toEqual([{ id: 'r1', emoji: '👍' }]);
    expect(body.reactions.posts).toEqual([]);
    expect(body.reactions.comments).toEqual([]);
    expect(body.reactionsCount).toEqual({ messages: 1, posts: 0, comments: 0 });
    expect(prisma.reaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { participantId: { in: ['part-1'] } } })
    );
    await app.close();
  });

  it('does not call participant.findMany a second time when messages is ALSO requested', async () => {
    const participantFindMany = jest.fn<any>().mockResolvedValue([{ id: 'part-1' }]);
    const prisma = basePrisma({ participant: { findMany: participantFindMany } });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=messages,reactions' });
    expect(res.statusCode).toBe(200);
    expect(participantFindMany).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('GET /export — media', () => {
  it('returns attachments and postMedia as two sub-sections', async () => {
    const prisma = basePrisma({
      messageAttachment: {
        findMany: jest.fn<any>().mockResolvedValue([{ id: 'a1', mimeType: 'image/jpeg' }]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=media' });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.media.attachments).toEqual([{ id: 'a1', mimeType: 'image/jpeg' }]);
    expect(body.media.postMedia).toEqual([]);
    expect(body.mediaCount).toEqual({ attachments: 1, postMedia: 0 });
    await app.close();
  });
});

describe('GET /export — voiceProfile', () => {
  it('returns null when the user has none, without erroring', async () => {
    const app = await buildApp(basePrisma());
    const res = await app.inject({ method: 'GET', url: '/export?types=voiceProfile' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.voiceProfile).toBeNull();
    await app.close();
  });

  it('returns the profile metadata when present', async () => {
    const profile = { profileId: 'vfp_1', qualityScore: 0.8, audioCount: 3 };
    const prisma = basePrisma({ userVoiceModel: { findFirst: jest.fn<any>().mockResolvedValue(profile) } });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=voiceProfile' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.voiceProfile).toEqual(profile);
    await app.close();
  });
});

describe('GET /export — sessions', () => {
  it('returns sessions, sessionsCount, sessionsHasMore', async () => {
    const prisma = basePrisma({
      userSession: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'sess-1' }]), count: jest.fn<any>().mockResolvedValue(1) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=sessions' });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.sessions).toEqual([{ id: 'sess-1' }]);
    expect(body.sessionsHasMore).toBe(false);
    await app.close();
  });
});

describe('GET /export — pagination applies uniformly across requested list-type sections', () => {
  it('passes the same limit/offset to posts, comments, and sessions', async () => {
    const prisma = basePrisma();
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?types=posts,comments,sessions&limit=25&offset=50' });
    expect(res.statusCode).toBe(200);
    expect(prisma.post.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25, skip: 50 }));
    expect(prisma.postComment.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25, skip: 50 }));
    expect(prisma.userSession.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 25, skip: 50 }));
    await app.close();
  });
});

describe('GET /export — CSV format for the new sections', () => {
  it('flattens posts/comments/sessions as flat CSV sections', async () => {
    const prisma = basePrisma({
      post: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'p1', type: 'POST' }]), count: jest.fn<any>().mockResolvedValue(1) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=posts' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.csv.posts).toContain('p1');
    await app.close();
  });

  it('flattens reactions/media sub-tables under a dotted key', async () => {
    const prisma = basePrisma({
      participant: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'part-1' }]) },
      reaction: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'r1', emoji: '❤️' }]), count: jest.fn<any>().mockResolvedValue(1) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=reactions' });
    expect(res.statusCode).toBe(200);
    const csv = res.json().data.csv;
    expect(csv['reactions.messages']).toContain('r1');
    expect(csv).not.toHaveProperty('reactions.posts');
    await app.close();
  });

  it('renders voiceProfile as a single-row CSV section, like profile', async () => {
    const prisma = basePrisma({
      userVoiceModel: { findFirst: jest.fn<any>().mockResolvedValue({ profileId: 'vfp_1', qualityScore: 0.9 }) },
    });
    const app = await buildApp(prisma);
    const res = await app.inject({ method: 'GET', url: '/export?format=csv&types=voiceProfile' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.csv.voiceProfile).toContain('vfp_1');
    await app.close();
  });
});
