/**
 * GW1 — posts core routes must notify through the DECORATED
 * `fastify.notificationService` (wired with pushService + socket + email by
 * server.ts), not a bare local `new NotificationService(prisma)` whose
 * pushService/io are undefined (friend_new_post/story/mood silently lost).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks (NotificationService is deliberately NOT mocked: the route must not
//     instantiate it at all — it must use the decorated instance) ─────────────

const mockCreatePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>();
const mockUpdatePost = jest.fn<any>();

jest.mock('../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    deletePost: jest.fn<any>().mockResolvedValue({ type: 'POST', visibility: 'PUBLIC' }),
  })),
}));

jest.mock('../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: jest.fn<any>().mockResolvedValue(undefined),
      translateOnDemand: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createPostMentions: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// #4147 — POST /posts / from-attachment / repost tirent leur plafond de
// création d'un compteur PARTAGÉ qui lit Redis directement, fail-closed
// (createSharedWriteRateLimitPreHandler, routes/posts/socialRateLimit.ts) :
// sans ce double, `getCacheStore().getNativeClient()` rend `null` en test
// (aucun REDIS_URL) et CHAQUE écriture de ce type serait refusée avant
// d'atteindre ce que ce fichier vérifie — détail complet dans
// unit/routes/posts/core.test.ts, premier fichier de la série à le poser.
// `incr` répond toujours « premier appel » : ce fichier ne teste PAS le
// plafond (son témoin dédié vit dans social-write-rate-limit.test.ts) —
// juste un Redis DISPONIBLE.
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../routes/posts/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const FRIEND_ID = '507f1f77bcf86cd799439033';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAuth() {
  return async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
}

function makeDecoratedNotificationService() {
  return {
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  };
}

// `postMention` est lu par la réconciliation d'édition
// (services/posts/postMentions.ts) : sans délégué, elle s'abstient de tout
// écrire — le comportement voulu, mais pas ce que ces cas testent.
const mockPostMentionFindMany = jest.fn<any>().mockResolvedValue([]);
const mockPostMentionDeleteMany = jest.fn<any>().mockResolvedValue({ count: 0 });

function makePrisma() {
  return {
    postMention: {
      findMany: (...args: any[]) => mockPostMentionFindMany(...args),
      deleteMany: (...args: any[]) => mockPostMentionDeleteMany(...args),
    },
  } as any;
}

async function buildApp(opts: { withNotificationService?: boolean } = {}) {
  const { withNotificationService = true } = opts;
  const app = Fastify({ logger: false });
  const notificationService = makeDecoratedNotificationService();
  if (withNotificationService) {
    app.decorate('notificationService', notificationService as any);
  }
  registerCoreRoutes(app, makePrisma(), makeAuth());
  await app.ready();
  return { app, notificationService };
}

beforeEach(() => {
  mockCreatePost.mockReset().mockResolvedValue({
    id: POST_ID,
    content: 'Hello friends',
    type: 'POST',
    visibility: 'FRIENDS',
    visibilityUserIds: [FRIEND_ID],
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
  });
  mockUpdatePost.mockReset().mockResolvedValue({
    id: POST_ID,
    content: 'Edited @bob',
    type: 'POST',
  });
  mockExtractMentions.mockReset().mockReturnValue([]);
  mockResolveUsernames.mockReset().mockResolvedValue(new Map());
  mockPostMentionFindMany.mockReset().mockResolvedValue([]);
  mockPostMentionDeleteMany.mockReset().mockResolvedValue({ count: 0 });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /posts — friend content fan-out uses fastify.notificationService', () => {
  it('calls the decorated createFriendContentNotificationsBatch (wired push/socket instance)', async () => {
    const { app, notificationService } = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello friends', type: 'POST', visibility: 'FRIENDS' },
    });

    expect(res.statusCode).toBe(201);
    expect(notificationService.createFriendContentNotificationsBatch).toHaveBeenCalledTimes(1);
    expect(notificationService.createFriendContentNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        authorId: USER_ID,
        contentType: 'POST',
        visibility: 'FRIENDS',
      })
    );

    await app.close();
  });

  it('routes post-body mention notifications through the decorated instance', async () => {
    const { app, notificationService } = await buildApp();
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: FRIEND_ID }]]));
    // Le contenu PERSISTÉ est celui que la résolution lit.
    mockCreatePost.mockResolvedValue({
      id: POST_ID,
      content: 'Hello @bob',
      type: 'POST',
      visibility: 'FRIENDS',
      visibilityUserIds: [FRIEND_ID],
      createdAt: new Date('2026-07-20T10:00:00.000Z'),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello @bob', type: 'POST', visibility: 'FRIENDS' },
    });

    expect(res.statusCode).toBe(201);
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        posterId: USER_ID,
        mentionedUserIds: [FRIEND_ID],
        // L'audience du post PERSISTÉ voyage jusqu'au lot, qui décide seul qui a
        // le droit d'être prévenu. Sans elle, nommer quelqu'un hors audience lui
        // poussait un extrait du contenu sur son écran verrouillé.
        visibility: 'FRIENDS',
        visibilityUserIds: [FRIEND_ID],
      })
    );
    expect(notificationService.createFriendContentNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ excludeUserIds: [FRIEND_ID] })
    );

    await app.close();
  });

  it('still creates the post when notificationService is not decorated (degraded boot)', async () => {
    const { app } = await buildApp({ withNotificationService: false });

    const res = await app.inject({
      method: 'POST',
      url: '/posts',
      payload: { content: 'Hello friends', type: 'POST', visibility: 'FRIENDS' },
    });

    expect(res.statusCode).toBe(201);

    await app.close();
  });
});

describe('PUT /posts/:postId — edit mentions use fastify.notificationService', () => {
  it('calls the decorated createPostMentionNotificationsBatch on edit', async () => {
    const { app, notificationService } = await buildApp();
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: FRIEND_ID }]]));

    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Edited @bob' },
    });

    expect(res.statusCode).toBe(200);
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: POST_ID,
        posterId: USER_ID,
        mentionedUserIds: [FRIEND_ID],
      })
    );

    await app.close();
  });

  // Restreindre la visibilité ET nommer quelqu'un dans la MÊME requête doit
  // appliquer la NOUVELLE règle : c'est le document rendu par `updatePost` qui
  // porte l'audience, pas celui d'avant l'édition. Sinon on notifierait selon
  // une audience que l'auteur vient précisément de retirer.
  it('transmet l’audience APRÈS édition, pas celle d’avant', async () => {
    const { app, notificationService } = await buildApp();
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: FRIEND_ID }]]));
    mockUpdatePost.mockResolvedValue({
      id: POST_ID,
      content: 'Edited @bob',
      type: 'POST',
      visibility: 'ONLY',
      visibilityUserIds: [USER_ID],
    });

    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Edited @bob', visibility: 'ONLY', visibilityUserIds: [USER_ID] },
    });

    expect(res.statusCode).toBe(200);
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        visibility: 'ONLY',
        visibilityUserIds: [USER_ID],
      })
    );

    await app.close();
  });

  // Le défaut que cette route portait : la persistance était idempotente
  // (P2002 avalé), la notification ne l'était pas. Corriger une faute de frappe
  // repingeait tous les mentionnés — et changer la seule visibilité aussi.
  it('ne renotifie pas un mentionné que le post nommait déjà', async () => {
    const { app, notificationService } = await buildApp();
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: FRIEND_ID }]]));
    mockPostMentionFindMany.mockResolvedValue([{ mentionedUserId: FRIEND_ID }]);

    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Edited @bob' },
    });

    expect(res.statusCode).toBe(200);
    expect(notificationService.createPostMentionNotificationsBatch).not.toHaveBeenCalled();

    await app.close();
  });

  // Éditer « bravo @alice » en « bravo @bob » laissait Alice mentionnée à vie :
  // la route créait sans jamais supprimer.
  it('retire les lignes PostMention de ceux que le post ne nomme plus', async () => {
    const DEPARTED_ID = '507f1f77bcf86cd799439044';
    const { app, notificationService } = await buildApp();
    mockExtractMentions.mockReturnValue(['bob']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: FRIEND_ID }]]));
    mockPostMentionFindMany.mockResolvedValue([{ mentionedUserId: DEPARTED_ID }]);

    const res = await app.inject({
      method: 'PUT',
      url: `/posts/${POST_ID}`,
      payload: { content: 'Edited @bob' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPostMentionDeleteMany).toHaveBeenCalledWith({
      where: { postId: POST_ID, mentionedUserId: { in: [DEPARTED_ID] } },
    });
    expect(notificationService.createPostMentionNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedUserIds: [FRIEND_ID] })
    );

    await app.close();
  });
});
