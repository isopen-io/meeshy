/**
 * DELETE /posts/:postId — le retrait d'une story CITÉE part vers les
 * conversations qui la citent (#7969), pour que la carte passe « Story
 * indisponible » sans navigation. Le détail (requête, charge, expiration)
 * est tenu par `announceCitedPostWithdrawal.test.ts` ; ici, le CÂBLAGE.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

const mockDeletePost = jest.fn<any>();

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: jest.fn(),
    getPostById: jest.fn(),
    updatePost: jest.fn(),
    deletePost: (...args: any[]) => mockDeletePost(...args),
  })),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn(), translateOnDemand: jest.fn() } },
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: jest.fn<any>().mockReturnValue([]),
    resolveUsernames: jest.fn<any>().mockResolvedValue(new Map()),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { registerCoreRoutes } from '../core';

const POST_ID = '507f1f77bcf86cd799439011';
const AUTHOR_ID = '507f1f77bcf86cd799439031';
const CITING_CONV = '507f1f77bcf86cd799439aaa';
const DELETED_AT = new Date('2026-09-25T10:00:00Z');

type Emission = { room: string; event: string; payload: unknown };

async function buildApp(withSocket: boolean) {
  const app = Fastify({ logger: false });
  const emissions: Emission[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
        return true;
      },
    }),
  };
  const findMany = jest.fn<any>().mockResolvedValue([{ conversationId: CITING_CONV }]);
  app.decorate('socialEvents', {
    broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
  } as any);
  if (withSocket) app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) } as any);

  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = { isAuthenticated: true, registeredUser: { id: AUTHOR_ID, role: 'USER' } };
  };
  registerCoreRoutes(app, { message: { findMany } } as any, requiredAuth);
  await app.ready();
  return { app, emissions, findMany };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('DELETE /posts/:postId — annonce aux conversations qui citent', () => {
  beforeEach(() => {
    mockDeletePost.mockReset().mockResolvedValue({
      id: POST_ID, authorId: AUTHOR_ID, type: 'STORY', visibility: 'FRIENDS', visibilityUserIds: [],
      deletedAt: DELETED_AT, expiresAt: new Date('2026-09-26T10:00:00Z'),
    });
  });

  it('émet message:cited-post-withdrawn vers la room de la conversation qui cite la story', async () => {
    const { app, emissions } = await buildApp(true);

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    await flush();

    expect(res.statusCode).toBe(200);
    expect(emissions).toEqual([
      {
        room: ROOMS.conversation(CITING_CONV),
        event: SERVER_EVENTS.MESSAGE_CITED_POST_WITHDRAWN,
        payload: { conversationId: CITING_CONV, postId: POST_ID, deletedAt: DELETED_AT.toISOString() },
      },
    ]);
    await app.close();
  });

  it("supprime sans broncher quand aucun serveur temps réel n'est monté", async () => {
    const { app, emissions, findMany } = await buildApp(false);

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    await flush();

    expect(res.statusCode).toBe(200);
    expect(emissions).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('une lecture qui échoue ne transforme pas le retrait en erreur', async () => {
    const { app, findMany } = await buildApp(true);
    findMany.mockRejectedValue(new Error('mongo down'));

    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    await flush();

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
