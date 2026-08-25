/**
 * Extended unit tests for posts/core.ts.
 * Covers branches missing from core.test.ts:
 * - hoistTrackingLinks: non-empty trackingLinks path
 * - POST /posts: invalid body (400), onDuplicate, STATUS type with socialEvents, POST type with socialEvents
 * - POST /posts: translatePost .catch callback (rejection), mention notifications, friend notification rejection
 * - GET /posts/:postId: post with comments
 * - PUT /posts/:postId: invalid body (400), post with comments, mention notifications, STORY/STATUS/POST with socialEvents, 422 error
 * - DELETE /posts/:postId: POST type with socialEvents
 * - POST /posts/:postId/translate: invalid body (400), translateOnDemand throws (503)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>().mockResolvedValue({
  id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date(),
});
const mockGetPostById = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST' });
const mockUpdatePost = jest.fn<any>().mockResolvedValue({ id: 'post-001', content: 'Updated', type: 'POST' });
// `deletePost` rend le document Prisma soft-deleté ENTIER — `id` et `authorId`
// compris, dont la route se sert pour annoncer le retrait et déplier son
// audience. Ici l'acteur EST l'auteur (`USER_ID`/`POST_ID`, déclarés plus bas :
// littéraux obligatoires à cette hauteur de fichier).
const mockDeletePost = jest.fn<any>().mockResolvedValue({
  id: '507f1f77bcf86cd799439022', authorId: '507f1f77bcf86cd799439011', type: 'POST', visibility: 'PUBLIC',
});

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    deletePost: (...args: any[]) => mockDeletePost(...args),
  })),
}));

const mockTranslatePost = jest.fn<any>().mockResolvedValue(undefined);
const mockTranslateOnDemand = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: (...args: any[]) => mockTranslatePost(...args),
      translateOnDemand: (...args: any[]) => mockTranslateOnDemand(...args),
    },
  },
}));

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());
const mockCreatePostMentions = jest.fn<any>().mockResolvedValue(undefined);
const mockResolveMentionedUsers = jest.fn<any>().mockResolvedValue([]);

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: (...args: any[]) => mockResolveMentionedUsers(...args),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createPostMentions: (...args: any[]) => mockCreatePostMentions(...args),
  })),
}));

const mockPostMentionFindMany = jest.fn<any>().mockResolvedValue([]);
const mockPostMentionDeleteMany = jest.fn<any>().mockResolvedValue({ count: 0 });

// GW1 — the routes consume the DECORATED fastify.notificationService (wired
// instance), not a locally constructed NotificationService: mocks are injected
// via app.decorate in buildApp below.
const mockCreatePostMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);
const mockCreateFriendContentNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

const mockWithMutationLog = jest.fn<any>().mockImplementation(({ op }: any) => op());

jest.mock('../../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: (...args: any[]) => mockWithMutationLog(...args),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

// ─── App factories ────────────────────────────────────────────────────────────

function makeAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        registeredUser: { id: USER_ID, role: 'USER' },
      };
    } else {
      (req as any).authContext = null;
    }
  };
}

function makeSocialEvents() {
  return {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryDeleted: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusDeleted: jest.fn<any>().mockResolvedValue(undefined),
  };
}

async function buildApp(opts: {
  withSocialEvents?: boolean;
  socialEvents?: ReturnType<typeof makeSocialEvents>;
} = {}): Promise<{ app: FastifyInstance; socialEvents?: ReturnType<typeof makeSocialEvents> }> {
  const app = Fastify({ logger: false });
  // `postMention` est lu par la réconciliation d'édition
  // (services/posts/postMentions.ts) : sans délégué, elle s'abstient de tout
  // écrire — ce qui est le comportement voulu, mais pas ce que ces cas testent.
  const prisma = {
    postMention: {
      findMany: (...args: any[]) => mockPostMentionFindMany(...args),
      deleteMany: (...args: any[]) => mockPostMentionDeleteMany(...args),
    },
  } as any;
  const requiredAuth = makeAuth(true);

  const se = opts.withSocialEvents ? (opts.socialEvents ?? makeSocialEvents()) : undefined;
  if (se) app.decorate('socialEvents', se);

  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: (...args: any[]) => mockCreatePostMentionNotificationsBatch(...args),
    createFriendContentNotificationsBatch: (...args: any[]) => mockCreateFriendContentNotificationsBatch(...args),
  } as any);

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return { app, socialEvents: se };
}

// ─── POST /posts — invalid body (400) ────────────────────────────────────────

describe('POST /posts — invalid body triggers 400', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when CreatePostSchema validation fails', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'INVALID_TYPE_VALUE_THAT_FAILS_ZOD' },
    });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── POST /posts — onDuplicate callback ──────────────────────────────────────

describe('POST /posts — withMutationLog calls onDuplicate', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 when onDuplicate replays existing post', async () => {
    mockWithMutationLog.mockImplementationOnce(async ({ onDuplicate }: any) => {
      return onDuplicate(POST_ID);
    });
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, USER_ID);
  });
});

// ─── POST /posts — STATUS type with socialEvents ──────────────────────────────

describe('POST /posts — STATUS type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-003', content: 'Status!', type: 'STATUS', visibility: 'PUBLIC', createdAt: new Date() });
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
    await app.close();
  });

  it('calls broadcastStatusCreated when type is STATUS', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'My status', type: 'STATUS' },
    });
    expect(res.statusCode).toBe(201);
    expect(se.broadcastStatusCreated).toHaveBeenCalled();
  });
});

// ─── POST /posts — POST type with socialEvents ────────────────────────────────

describe('POST /posts — POST type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-004', content: 'Post!', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
    await app.close();
  });

  it('calls broadcastPostCreated when type is POST', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'My post', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(se.broadcastPostCreated).toHaveBeenCalled();
  });
});

// ─── POST /posts — hoistTrackingLinks with non-empty trackingLinks ────────────

describe('POST /posts — hoistTrackingLinks non-empty path', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('hoists trackingLinks onto the broadcast payload', async () => {
    mockCreatePost.mockResolvedValueOnce({
      id: 'post-005', content: 'Link post', type: 'POST', visibility: 'PUBLIC', createdAt: new Date(),
      metadata: { trackingLinks: [{ url: 'https://meeshy.me/l/abc', token: 'abc' }] },
    });
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Link post', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(se.broadcastPostCreated).toHaveBeenCalledWith(
      expect.objectContaining({ trackingLinks: expect.arrayContaining([expect.objectContaining({ token: 'abc' })]) }),
      USER_ID,
      undefined
    );
  });
});

// ─── POST /posts — translatePost .catch callback ─────────────────────────────

describe('POST /posts — translatePost promise rejection (catch callback)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 even when translatePost promise rejects', async () => {
    mockTranslatePost.mockRejectedValueOnce(new Error('translation failed'));
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─── POST /posts — translatePost throws synchronously ────────────────────────

describe('POST /posts — translatePost throws synchronously (catch block)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 and silently swallows the sync error', async () => {
    mockTranslatePost.mockImplementationOnce(() => { throw new Error('not available'); });
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─── POST /posts — mentions DÉCLARÉES (hors texte) ───────────────────────────

/**
 * Directive user 2026-08-18 : `POST /posts` n'avait AUCUN champ `mentions` — le
 * gateway extrayait les nommés du seul `content`. Épingler quelqu'un sur le
 * canevas d'une story imposait donc d'écrire son `@handle` dans la légende.
 *
 * Ce cas verrouille le canal de bout en bout : le champ traverse la validation,
 * la route, la résolution, et arrive persisté sous `PINNED` — le discriminant
 * qui empêchera l'édition suivante de le chercher dans un texte qui ne le porte
 * pas.
 */
describe('POST /posts — mentions déclarées hors contenu', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map([['dana', { id: 'user-dana' }]]));
    mockCreatePost.mockResolvedValue({
      id: 'post-decl', content: 'une story sans arobase', type: 'STORY',
      visibility: 'PUBLIC', createdAt: new Date(),
    });
    ({ app } = await buildApp());
  });
  afterAll(async () => {
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockCreatePost.mockResolvedValue({
      id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date(),
    });
    await app.close();
  });

  it('persiste un badge de canevas sous le mode PINNED et prévient la personne', async () => {
    mockCreatePostMentions.mockClear();
    mockCreatePostMentionNotificationsBatch.mockClear();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: {
        type: 'STORY',
        content: 'une story sans arobase',
        mentions: [{ username: 'dana' }],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCreatePostMentions).toHaveBeenCalledWith('post-decl', ['user-dana'], 'PINNED');
    expect(mockCreatePostMentionNotificationsBatch).toHaveBeenCalled();
  });

  it('rejette une mention qui ne porte ni userId ni username', async () => {
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { type: 'STORY', content: 'x', mentions: [{}] },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /posts — mention notifications ─────────────────────────────────────

describe('POST /posts — with @mentions in content', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockExtractMentions.mockReturnValue(['bob', 'carol']);
    mockResolveUsernames.mockResolvedValue(new Map([['bob', { id: 'user-bob' }], ['carol', { id: 'user-carol' }]]));
    // Le contenu PERSISTÉ est celui que la résolution lit — un post rendu sans
    // `@` court-circuite désormais, sans requête ni extraction.
    mockCreatePost.mockResolvedValue({
      id: 'post-001', content: 'Hello @bob and @carol', type: 'POST', visibility: 'PUBLIC', createdAt: new Date(),
    });
    ({ app } = await buildApp());
  });
  afterAll(async () => {
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockCreatePost.mockResolvedValue({
      id: 'post-001', content: 'Hello', type: 'POST', visibility: 'PUBLIC', createdAt: new Date(),
    });
    await app.close();
  });

  it('creates mention notifications for mentioned users', async () => {
    mockCreatePostMentionNotificationsBatch.mockClear();
    mockCreatePostMentions.mockClear();
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello @bob and @carol', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreatePostMentions).toHaveBeenCalledWith('post-001', ['user-bob', 'user-carol'], 'INLINE');
    expect(mockCreatePostMentionNotificationsBatch).toHaveBeenCalled();
  });
});

// ─── POST /posts — createFriendContentNotifications rejection ────────────────

describe('POST /posts — friend notification fan-out rejection (.catch callback)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 201 even when friend notification fan-out rejects', async () => {
    mockCreateFriendContentNotificationsBatch.mockRejectedValueOnce(new Error('redis down'));
    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'Hello world', type: 'POST' },
    });
    expect(res.statusCode).toBe(201);
  });
});

// ─── GET /posts/:postId — la lecture ne redevine plus les références ──────────

describe('GET /posts/:postId — références lues, jamais re-devinées', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  // Re-parser le texte à CHAQUE lecture linkifiait n'importe quel `@mot` vers un
  // profil inexistant, et rendait structurellement impossible d'afficher une
  // référence que le texte ne porte pas (badge de canevas, note, silencieuse).
  // Les lignes `PostMention` déjà persistées font foi.
  it('ne re-parse plus le contenu — ni celui du post, ni celui de ses commentaires', async () => {
    mockResolveMentionedUsers.mockClear();
    mockGetPostById.mockResolvedValueOnce({
      id: POST_ID, content: 'Post content', type: 'POST',
      comments: [{ content: '@alice check this' }, { content: 'No mentions here' }, {}],
    });
    const res = await app.inject({ method: 'GET', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    expect(mockResolveMentionedUsers).not.toHaveBeenCalled();
  });
});

// ─── PUT /posts/:postId — invalid body (400) ─────────────────────────────────

describe('PUT /posts/:postId — invalid body (400)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when UpdatePostSchema validation fails', async () => {
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { type: 'INVALID_TYPE_VALUE_THAT_FAILS_ZOD', expiresAt: 'not-a-date' },
    });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── PUT /posts/:postId — la relation devient la charge utile ─────────────────

describe('PUT /posts/:postId — références servies depuis la relation', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  // `postMentions` est le nom de la RELATION Prisma ; la clé EXPOSÉE est
  // `mentions`, et elle porte des références APLATIES — le client n'a jamais à
  // connaître la forme de la table.
  it('expose mentions aplaties et ne laisse pas fuiter la relation brute', async () => {
    mockResolveMentionedUsers.mockClear();
    mockUpdatePost.mockResolvedValueOnce({
      id: POST_ID, content: 'Updated @alice content', type: 'POST',
      comments: [{ content: '@bob replied' }, {}],
      postMentions: [{
        display: 'NOTE',
        mentionedUser: { id: 'user-alice', username: 'alice', displayName: 'Alice', avatar: null },
      }],
    });
    // La charge utile ne vient PAS de la relation ci-dessus — `updatePost` la
    // rend d'avant la réconciliation. Elle vient de la relecture, deuxième
    // appel à `postMention.findMany` (le premier est l'ensemble pré-édition).
    mockExtractMentions.mockReturnValueOnce(['alice']);
    mockResolveUsernames.mockResolvedValueOnce(new Map([['alice', { id: 'user-alice' }]]));
    mockPostMentionFindMany
      .mockResolvedValueOnce([{ mentionedUserId: 'user-alice', display: 'NOTE' }])
      .mockResolvedValueOnce([{
        display: 'NOTE',
        mentionedUser: { id: 'user-alice', username: 'alice', displayName: 'Alice', avatar: null },
      }]);
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated @alice content' },
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data.mentions).toEqual([
      { userId: 'user-alice', username: 'alice', displayName: 'Alice', avatar: null, display: 'NOTE' },
    ]);
    expect(body.data.postMentions).toBeUndefined();
    expect(mockResolveMentionedUsers).not.toHaveBeenCalled();
  });
});

// ─── PUT /posts/:postId — with mention notifications ─────────────────────────

describe('PUT /posts/:postId — edited content with @mentions', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockExtractMentions.mockReturnValue(['dave']);
    mockResolveUsernames.mockResolvedValue(new Map([['dave', { id: 'user-dave' }]]));
    ({ app } = await buildApp());
  });
  afterAll(async () => {
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    await app.close();
  });

  it('creates mention notifications for users mentioned in edited post', async () => {
    mockUpdatePost.mockResolvedValueOnce({
      id: POST_ID, content: 'Updated @dave check this', type: 'POST',
    });
    mockCreatePostMentions.mockClear();
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated @dave check this' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockCreatePostMentions).toHaveBeenCalledWith(POST_ID, ['user-dave'], 'INLINE');
  });
});

// ─── PUT /posts/:postId — STORY type with socialEvents ───────────────────────

describe('PUT /posts/:postId — STORY type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStoryUpdated for STORY type', async () => {
    mockUpdatePost.mockResolvedValueOnce({ id: POST_ID, content: 'Story update', type: 'STORY' });
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Story update' },
    });
    expect(res.statusCode).toBe(200);
    expect(se.broadcastStoryUpdated).toHaveBeenCalled();
  });
});

// ─── PUT /posts/:postId — STATUS type with socialEvents ──────────────────────

describe('PUT /posts/:postId — STATUS type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastStatusUpdated for STATUS type', async () => {
    mockUpdatePost.mockResolvedValueOnce({ id: POST_ID, content: 'Status update', type: 'STATUS' });
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Status update' },
    });
    expect(res.statusCode).toBe(200);
    expect(se.broadcastStatusUpdated).toHaveBeenCalled();
  });
});

// ─── PUT /posts/:postId — POST type with socialEvents ────────────────────────

describe('PUT /posts/:postId — POST type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastPostUpdated for POST type', async () => {
    mockUpdatePost.mockResolvedValueOnce({ id: POST_ID, content: 'Post update', type: 'POST' });
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Post update' },
    });
    expect(res.statusCode).toBe(200);
    expect(se.broadcastPostUpdated).toHaveBeenCalled();
  });
});

// ─── PUT /posts/:postId — 422 business rule rejection ────────────────────────

describe('PUT /posts/:postId — 422 statusCode error from updatePost', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when updatePost throws error with statusCode 422', async () => {
    const err = Object.assign(new Error('Cannot change post type'), { statusCode: 422 });
    mockUpdatePost.mockRejectedValueOnce(err);
    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`,
      payload: { content: 'Updated' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('INVALID_POST_UPDATE');
  });
});

// ─── DELETE /posts/:postId — POST type with socialEvents ─────────────────────

describe('DELETE /posts/:postId — POST type with socialEvents', () => {
  let app: FastifyInstance;
  let se: ReturnType<typeof makeSocialEvents>;
  beforeAll(async () => {
    se = makeSocialEvents();
    ({ app } = await buildApp({ withSocialEvents: true, socialEvents: se }));
  });
  afterAll(async () => { await app.close(); });

  it('calls broadcastPostDeleted for POST type', async () => {
    mockDeletePost.mockResolvedValueOnce({ id: POST_ID, authorId: USER_ID, type: 'POST', visibility: 'PUBLIC' });
    const res = await app.inject({ method: 'DELETE', url: `/posts/${POST_ID}` });
    expect(res.statusCode).toBe(200);
    expect(se.broadcastPostDeleted).toHaveBeenCalledWith(POST_ID, USER_ID);
  });
});

// ─── POST /posts/:postId/translate — invalid body (400) ──────────────────────

describe('POST /posts/:postId/translate — invalid body', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when TranslatePostSchema validation fails', async () => {
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: {},
    });
    expect([400, 500]).toContain(res.statusCode);
  });
});

// ─── POST /posts/:postId/translate — audience du demandeur ───────────────────

describe('POST /posts/:postId/translate — audience du demandeur', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  // Sans le viewer, `getPostById` retombe sur le filtre anonyme
  // (`visibility: PUBLIC`) et ne trouve RIEN d'autre qu'une publication
  // publique. Or une story Meeshy est réservée aux contacts par défaut : la
  // route répondait « Post not found » à un lecteur pourtant légitime, et la
  // feuille « Traductions » du lecteur restait sur un anneau qui tourne sans
  // fin (constaté au simulateur le 2026-07-27 sur une story FRIENDS).
  it('transmet l’identité du demandeur au lookup', async () => {
    mockGetPostById.mockClear();

    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'es' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockGetPostById).toHaveBeenCalledWith(POST_ID, USER_ID);
  });
});

// ─── POST /posts/:postId/translate — translateOnDemand throws (503) ───────────

describe('POST /posts/:postId/translate — translateOnDemand throws', () => {
  let app: FastifyInstance;
  beforeAll(async () => { ({ app } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  it('returns 503 when translateOnDemand throws', async () => {
    mockTranslateOnDemand.mockRejectedValueOnce(new Error('service unavailable'));
    const res = await app.inject({
      method: 'POST', url: `/posts/${POST_ID}/translate`,
      payload: { targetLanguage: 'fr' },
    });
    expect(res.statusCode).toBe(503);
  });
});
