/**
 * #9603 — un REJEU d'idempotence (même `X-Client-Mutation-Id`) d'une
 * publication ne crédite ni n'annonce une seconde fois : le crédit de la
 * publication, sa diffusion et l'éventail d'amis n'ont lieu qu'à la PREMIÈRE
 * exécution. Le rejeu resert la publication.
 *
 * Le VRAI `withMutationLog` et le VRAI `MutationLogService` sur un journal en
 * mémoire qui tient son index unique : le verdict « rejoué » est celui de la
 * production, y compris pour deux envois concurrents.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockCreatePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));
jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));
jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>().mockResolvedValue(undefined) } },
}));
jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../middleware/rate-limiter', () => ({ createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}) }));
jest.mock('../../../../utils/sanitize.js', () => ({ SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) } }));
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ getNativeClient: () => ({ incr: async () => 1, pexpire: async () => 1, pttl: async () => -1 }) }),
}));
const mockRecordActivity = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: (...args: any[]) => mockRecordActivity(...args),
  })),
}));

import { registerCoreRoutes } from '../../../../routes/posts/core';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';
import { inMemoryMutationLog } from '../../../helpers/inMemoryMutationLog';

const AUTHOR = '507f1f77bcf86cd799439011';
const CMID = 'cmid_550e8400-e29b-41d4-a716-446655449613';
const OTHER_CMID = 'cmid_550e8400-e29b-41d4-a716-446655449614';

const published = (id: string) => ({
  id,
  authorId: AUTHOR,
  type: 'POST',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  content: 'Bonjour tout le monde',
  originalLanguage: 'fr',
  createdAt: '2026-10-07T10:00:00.000Z',
});

async function build() {
  const app = Fastify({ logger: false });
  const prisma = { postMention: { findMany: jest.fn<any>().mockResolvedValue([]) } };
  const broadcastPostCreated = jest.fn<any>().mockResolvedValue(undefined);
  const createFriendContentNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);
  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch,
  } as never);
  app.decorate('socialEvents', {
    broadcastPostCreated,
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
  } as never);
  registerClientMutationIdHook(app);
  app.decorate('mutationLogService', inMemoryMutationLog().service as never);
  const auth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { emailVerifiedAt: new Date(), id: AUTHOR, role: 'USER', username: 'bob' },
    };
  };
  registerCoreRoutes(app, prisma as never, auth);
  await app.ready();
  return { app, broadcastPostCreated, createFriendContentNotificationsBatch };
}

const publish = (app: FastifyInstance, cmid: string) =>
  app.inject({ method: 'POST', url: '/posts', headers: { 'x-client-mutation-id': cmid }, payload: { content: 'Bonjour tout le monde' } });

const settled = () => new Promise((resolve) => setTimeout(resolve, 30));

let seq = 0;
beforeEach(() => {
  seq = 0;
  mockRecordActivity.mockClear();
  mockCreatePost.mockReset().mockImplementation(async () => {
    seq += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return published(`507f1f77bcf86cd7994390${String(seq).padStart(2, '0')}`);
  });
  mockGetPostById.mockReset().mockImplementation(async (id: string) => ({ ...published(id), mentions: [] }));
});

describe('POST /posts — un rejeu ne crédite ni n’annonce une seconde fois (#9603)', () => {
  it('la première exécution crédite la publication, la diffuse et prévient les amis — une fois', async () => {
    const { app, broadcastPostCreated, createFriendContentNotificationsBatch } = await build();

    const res = await publish(app, CMID);
    await settled();
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(mockRecordActivity.mock.calls.map((call) => call[1])).toEqual(['content.post', 'tool.direct_publish']);
    expect(broadcastPostCreated).toHaveBeenCalledTimes(1);
    expect(createFriendContentNotificationsBatch).toHaveBeenCalledTimes(1);
  });

  it('le rejeu resert la publication, sans crédit, sans diffusion, sans éventail d’amis', async () => {
    const { app, broadcastPostCreated, createFriendContentNotificationsBatch } = await build();
    const first = await publish(app, CMID);
    await settled();
    const creditsAfterFirst = mockRecordActivity.mock.calls.length;

    const replay = await publish(app, CMID);
    await settled();
    await app.close();

    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.id).toBe(first.json().data.id);
    expect(replay.json().data.content).toBe(first.json().data.content);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    expect(mockRecordActivity).toHaveBeenCalledTimes(creditsAfterFirst);
    expect(broadcastPostCreated).toHaveBeenCalledTimes(1);
    expect(createFriendContentNotificationsBatch).toHaveBeenCalledTimes(1);
  });

  it('deux envois CONCURRENTS du même cmid : une publication, un crédit — le second attend son tour (409)', async () => {
    const { app, broadcastPostCreated } = await build();

    const [a, b] = await Promise.all([publish(app, CMID), publish(app, CMID)]);
    await settled();
    await app.close();

    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    expect(mockRecordActivity.mock.calls.map((call) => call[1])).toEqual(['content.post', 'tool.direct_publish']);
    expect(broadcastPostCreated).toHaveBeenCalledTimes(1);
  });

  it('deux cmid DIFFÉRENTS sont deux publications : deux crédits', async () => {
    const { app } = await build();

    await publish(app, CMID);
    await publish(app, OTHER_CMID);
    await settled();
    await app.close();

    expect(mockRecordActivity.mock.calls.filter((call) => call[1] === 'content.post')).toHaveLength(2);
  });
});
