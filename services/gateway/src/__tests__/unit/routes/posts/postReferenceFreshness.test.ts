/**
 * La charge utile porte le jeu FINAL des références — celui d'APRÈS l'écriture.
 *
 * `createPost` charge sa relation AVANT que la résolution n'écrive la moindre
 * ligne `PostMention`, et `updatePost` rend son document dans sa propre
 * transaction, donc AVANT la réconciliation. Servir cette relation-là rendait
 * `mentions: []` à la création — par construction — et le jeu PRÉ-édition à
 * l'édition.
 *
 * Et `[]` n'est pas neutre : les deux clients le lisent comme un VERDICT (« le
 * serveur s'est prononcé, personne ne matche » — iOS `FeedModels`, web
 * `PostContentText`). L'auteur qui publie « bravo @alice » voyait donc son
 * propre `@alice` en texte mort, persisté tel quel sur disque côté iOS ; et une
 * référence révoquée à l'édition restait affichée chez tous les lecteurs, que
 * rien n'invalidait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockUpdatePost = jest.fn<any>();
const mockGetPostById = jest.fn<any>().mockResolvedValue(null);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());
const mockCreatePostMentions = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createPostMentions: (...args: any[]) => mockCreatePostMentions(...args),
  })),
}));

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>().mockResolvedValue(undefined) } },
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  // Le module réel est ÉTALÉ d'abord : `MutationResultGone` est une CLASSE
  // dont les routes font `instanceof`, et `withMutationOutcome` est le
  // chemin réel du repost. Une usine qui ne rendait que `withMutationLog`
  // les laissait à `undefined` — `instanceof undefined` lève un TypeError
  // qui se déguise en 500 sur des chemins d'erreur sans rapport.
  ...(jest.requireActual('../../../../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

const mockPostMentionFindMany = jest.fn<any>().mockResolvedValue([]);
const mockPostMentionDeleteMany = jest.fn<any>().mockResolvedValue({ count: 0 });
const mockPostMentionUpdateMany = jest.fn<any>().mockResolvedValue({ count: 0 });
const mockUserFindMany = jest.fn<any>().mockImplementation(async (args: any) =>
  ((args?.where?.id?.in ?? []) as string[]).map((id) => ({ id }))
);
const mockNotificationFindMany = jest.fn<any>().mockResolvedValue([]);
const mockNotificationDeleteMany = jest.fn<any>().mockResolvedValue({ count: 0 });

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';
const CAROL_ID = '507f1f77bcf86cd799439033';

const ALICE_ROW = {
  display: 'INLINE' as const,
  mentionedUser: { id: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: null },
};
const ALICE = {
  userId: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: null, display: 'INLINE',
};
const CAROL_ROW = {
  display: 'SILENT' as const,
  mentionedUser: { id: CAROL_ID, username: 'carol', displayName: 'Carol', avatar: null },
};
const CAROL = {
  userId: CAROL_ID, username: 'carol', displayName: 'Carol', avatar: null, display: 'SILENT',
};

function makeSocialEvents() {
  return {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusUpdated: jest.fn<any>().mockResolvedValue(undefined),
  };
}

async function buildApp(): Promise<{ app: FastifyInstance; socialEvents: ReturnType<typeof makeSocialEvents> }> {
  const app = Fastify({ logger: false });
  const prisma = {
    postMention: {
      findMany: (...args: any[]) => mockPostMentionFindMany(...args),
      deleteMany: (...args: any[]) => mockPostMentionDeleteMany(...args),
      updateMany: (...args: any[]) => mockPostMentionUpdateMany(...args),
    },
    user: { findMany: (...args: any[]) => mockUserFindMany(...args) },
    notification: {
      findMany: (...args: any[]) => mockNotificationFindMany(...args),
      deleteMany: (...args: any[]) => mockNotificationDeleteMany(...args),
    },
  } as any;
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER', username: 'author' },
    };
  };

  const socialEvents = makeSocialEvents();
  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
  } as any);
  app.decorate('socialEvents', socialEvents as any);

  registerCoreRoutes(app, prisma, requiredAuth);
  await app.ready();
  return { app, socialEvents };
}

/** Le post que `createPost` rend : sa relation est VIDE, l'écriture n'a pas encore eu lieu. */
const FRESHLY_CREATED = {
  id: POST_ID, type: 'POST', authorId: USER_ID, visibility: 'PUBLIC',
  visibilityUserIds: [], content: 'bravo @alice', postMentions: [],
};

describe('POST /posts — le jeu servi est celui d\'APRÈS l\'écriture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    mockUserFindMany.mockImplementation(async (args: any) =>
      ((args?.where?.id?.in ?? []) as string[]).map((id) => ({ id }))
    );
    mockExtractMentions.mockReturnValue(['alice']);
    mockResolveUsernames.mockResolvedValue(new Map([['alice', { id: 'u-alice' }]]));
    mockCreatePost.mockResolvedValue(FRESHLY_CREATED);
  });

  it('sert la référence RELUE, là où la relation chargée est vide par construction', async () => {
    mockPostMentionFindMany.mockResolvedValue([ALICE_ROW]);
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/posts', payload: { content: 'bravo @alice' } });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.mentions).toEqual([ALICE]);
    const broadcast = socialEvents.broadcastPostCreated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast.mentions).toEqual([ALICE]);
    await app.close();
  });

  it('relit APRÈS la résolution — jamais avant qu\'une ligne existe', async () => {
    mockPostMentionFindMany.mockResolvedValue([ALICE_ROW]);
    const { app } = await buildApp();

    await app.inject({ method: 'POST', url: '/posts', payload: { content: 'bravo @alice' } });

    const persisted = mockCreatePostMentions.mock.invocationCallOrder[0];
    const reread = mockPostMentionFindMany.mock.invocationCallOrder[0];
    expect(reread).toBeGreaterThan(persisted);
    await app.close();
  });

  it('garde la charge utile temps réel NEUTRE : la silencieuse va à l\'auteur, pas à l\'audience', async () => {
    mockPostMentionFindMany.mockResolvedValue([ALICE_ROW, CAROL_ROW]);
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts',
      payload: { content: 'bravo @alice', mentions: [{ userId: CAROL_ID, display: 'SILENT' }] },
    });

    expect(res.json().data.mentions).toEqual([ALICE, CAROL]);
    const broadcast = socialEvents.broadcastPostCreated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast.mentions).toEqual([ALICE]);
    await app.close();
  });

  it('n\'ouvre aucune lecture quand le post ne nomme personne', async () => {
    mockExtractMentions.mockReturnValue([]);
    mockCreatePost.mockResolvedValue({ ...FRESHLY_CREATED, content: 'rien à signaler' });
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/posts', payload: { content: 'rien à signaler' } });

    expect(mockPostMentionFindMany).not.toHaveBeenCalled();
    expect(res.json().data.mentions).toEqual([]);
    const broadcast = socialEvents.broadcastPostCreated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast.mentions).toEqual([]);
    await app.close();
  });

  it('garde ce que la relation portait quand la relecture échoue — on n\'invente pas un verdict vide', async () => {
    mockCreatePost.mockResolvedValue({ ...FRESHLY_CREATED, postMentions: [ALICE_ROW] });
    mockPostMentionFindMany.mockRejectedValue(new Error('mongo down'));
    const { app } = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/posts', payload: { content: 'bravo @alice' } });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.mentions).toEqual([ALICE]);
    await app.close();
  });
});

describe('PUT /posts/:postId — l\'édition sert le jeu RÉCONCILIÉ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    mockUserFindMany.mockImplementation(async (args: any) =>
      ((args?.where?.id?.in ?? []) as string[]).map((id) => ({ id }))
    );
    // Le document rendu par `updatePost` porte le jeu PRÉ-édition : sa
    // transaction s'est fermée avant que la réconciliation ne tourne.
    mockUpdatePost.mockResolvedValue({
      id: POST_ID, type: 'POST', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], content: 'plus personne', postMentions: [ALICE_ROW],
    });
  });

  it('retire de la charge utile la référence que l\'édition révoque', async () => {
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockPostMentionFindMany.mockResolvedValue([{ mentionedUserId: 'u-alice', display: 'INLINE' }]);
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`, payload: { content: 'plus personne', mentions: [] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.mentions).toEqual([]);
    const broadcast = socialEvents.broadcastPostUpdated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast.mentions).toEqual([]);
    await app.close();
  });

  it('sert la référence ENTRANTE, absente du document rendu par l\'édition', async () => {
    mockExtractMentions.mockReturnValue(['alice']);
    mockResolveUsernames.mockResolvedValue(new Map([['alice', { id: 'u-alice' }]]));
    mockUpdatePost.mockResolvedValue({
      id: POST_ID, type: 'POST', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], content: 'bravo @alice', postMentions: [],
    });
    mockPostMentionFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ALICE_ROW]);
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`, payload: { content: 'bravo @alice' },
    });

    expect(res.json().data.mentions).toEqual([ALICE]);
    const broadcast = socialEvents.broadcastPostUpdated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast.mentions).toEqual([ALICE]);
    await app.close();
  });
});
