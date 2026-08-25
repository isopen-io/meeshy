/**
 * La clé EXPOSÉE d'une référence est `mentions` — sur TOUTES les sorties.
 *
 * Le schéma nomme la relation `Post.postMentions`, là où `PostComment.mentions`
 * et `Message.mentions` portent le nom court : toute charge utile qui sert la
 * relation telle quelle parle donc une langue que le client ne décode pas. Les
 * chemins de création, d'édition et de like l'aplatissent déjà ; ceux vérifiés
 * ici sont ceux qui restaient — republication, republication d'autrui, et les
 * ÉVÉNEMENTS temps réel, qui sont une charge utile comme une autre.
 *
 * Une story republiée garde ses lignes `PostMention` : servie sous le nom de la
 * relation, ses références disparaissent de l'app qui la reçoit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockUpdatePost = jest.fn<any>();
const mockRepublishStory = jest.fn<any>();
const mockRepostPost = jest.fn<any>();
const mockGetPostById = jest.fn<any>().mockResolvedValue(null);

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    updatePost: (...args: any[]) => mockUpdatePost(...args),
    republishStory: (...args: any[]) => mockRepublishStory(...args),
    repostPost: (...args: any[]) => mockRepostPost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: { shared: { translatePost: jest.fn<any>().mockResolvedValue(undefined) } },
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

// Le jeu de références est RELU après écriture (postReferences.readPostReferences) :
// sans ce délégué, la charge utile retomberait sur la relation chargée AVANT
// que la moindre ligne n'existe.
const mockPostMentionFindMany = jest.fn<any>().mockResolvedValue([]);

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
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

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';
import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

const USER_ID = '507f1f77bcf86cd799439011';
const POST_ID = '507f1f77bcf86cd799439022';

const MENTION_ROW = {
  display: 'NOTE' as const,
  mentionedUser: { id: 'u-alice', username: 'alice', displayName: 'Alice B.', avatar: null },
};

const FLAT_MENTION = {
  userId: 'u-alice',
  username: 'alice',
  displayName: 'Alice B.',
  avatar: null,
  display: 'NOTE',
};

function makeSocialEvents() {
  return {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusUpdated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
  };
}

async function buildApp(): Promise<{ app: FastifyInstance; socialEvents: ReturnType<typeof makeSocialEvents> }> {
  const app = Fastify({ logger: false });
  const prisma = {
    postMention: {
      findMany: (...args: any[]) => mockPostMentionFindMany(...args),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    notification: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
  } as any;
  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER', username: 'alice' },
    };
  };

  const socialEvents = makeSocialEvents();
  app.decorate('notificationService', null as any);
  app.decorate('socialEvents', socialEvents as any);

  registerCoreRoutes(app, prisma, requiredAuth);
  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return { app, socialEvents };
}

describe('la relation `postMentions` ne quitte jamais le serveur sous son nom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPostById.mockResolvedValue(null);
    mockExtractMentions.mockReturnValue([]);
    mockResolveUsernames.mockResolvedValue(new Map());
    mockPostMentionFindMany.mockResolvedValue([]);
  });

  it('aplatit les références d\'une story republiée, réponse ET événement', async () => {
    mockRepublishStory.mockResolvedValue({
      id: POST_ID, type: 'STORY', authorId: USER_ID, visibility: 'FRIENDS',
      visibilityUserIds: [], postMentions: [MENTION_ROW],
    });
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/republish` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).not.toHaveProperty('postMentions');
    expect(res.json().data.mentions).toEqual([FLAT_MENTION]);

    const broadcast = socialEvents.broadcastStoryCreated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast).not.toHaveProperty('postMentions');
    expect(broadcast.mentions).toEqual([FLAT_MENTION]);
    await app.close();
  });

  it('aplatit la charge utile d\'une republication d\'autrui', async () => {
    mockRepostPost.mockResolvedValue({
      id: 'repost-1', repostOfId: POST_ID, type: 'POST', authorId: USER_ID,
      visibility: 'PUBLIC', visibilityUserIds: [], postMentions: [],
    });
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({ method: 'POST', url: `/posts/${POST_ID}/repost`, payload: {} });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).not.toHaveProperty('postMentions');
    expect(res.json().data.mentions).toEqual([]);

    const broadcast = socialEvents.broadcastPostReposted.mock.calls[0][0] as { repost: Record<string, unknown> };
    expect(broadcast.repost).not.toHaveProperty('postMentions');
    await app.close();
  });

  it('aplatit l\'événement d\'édition d\'une story — sinon l\'édition efface ses références', async () => {
    mockUpdatePost.mockResolvedValue({
      id: POST_ID, type: 'STORY', authorId: USER_ID, visibility: 'FRIENDS',
      visibilityUserIds: [], content: 'edité', postMentions: [MENTION_ROW],
    });
    // La référence déclarée SURVIT à une édition qui ne parle pas d'elle
    // (tri-état) ; c'est le jeu RELU qui le prouve, pas la relation rendue par
    // `updatePost`, qui date d'avant la réconciliation.
    mockPostMentionFindMany
      .mockResolvedValueOnce([{ mentionedUserId: 'u-alice', display: 'NOTE' }])
      .mockResolvedValueOnce([MENTION_ROW]);
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({
      method: 'PUT', url: `/posts/${POST_ID}`, payload: { content: 'edité' },
    });

    expect(res.statusCode).toBe(200);
    const broadcast = socialEvents.broadcastStoryUpdated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast).not.toHaveProperty('postMentions');
    expect(broadcast.mentions).toEqual([FLAT_MENTION]);
    await app.close();
  });

  it('rend une liste vide, jamais une clé absente, sur un post sans référence', async () => {
    mockUpdatePost.mockResolvedValue({ id: POST_ID, type: 'POST', authorId: USER_ID });
    const { app, socialEvents } = await buildApp();

    await app.inject({ method: 'PUT', url: `/posts/${POST_ID}`, payload: { content: 'x' } });

    const broadcast = socialEvents.broadcastPostUpdated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast.mentions).toEqual([]);
    await app.close();
  });

  // La relation que `createPost` rend est vide PAR CONSTRUCTION : elle a été
  // chargée avant que la résolution n'écrive la moindre ligne. C'est le jeu
  // RELU qui doit sortir — `[]` se lirait comme un verdict chez les deux
  // clients, et l'auteur verrait son propre `@alice` en texte mort.
  it('aplatit l\'événement de création — et porte le jeu RELU, pas la relation vide', async () => {
    mockCreatePost.mockResolvedValue({
      id: POST_ID, type: 'POST', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], content: 'bravo @alice', postMentions: [],
    });
    mockExtractMentions.mockReturnValue(['alice']);
    mockResolveUsernames.mockResolvedValue(new Map([['alice', { id: 'u-alice' }]]));
    mockPostMentionFindMany.mockResolvedValue([MENTION_ROW]);
    const { app, socialEvents } = await buildApp();

    const res = await app.inject({ method: 'POST', url: '/posts', payload: { content: 'bravo @alice' } });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).not.toHaveProperty('postMentions');
    expect(res.json().data.mentions).toEqual([FLAT_MENTION]);
    const broadcast = socialEvents.broadcastPostCreated.mock.calls[0][0] as Record<string, unknown>;
    expect(broadcast).not.toHaveProperty('postMentions');
    expect(broadcast.mentions).toEqual([FLAT_MENTION]);
    await app.close();
  });

  /**
   * `GET /posts/:postId` est la SEULE route de détail, et la seule à servir un
   * post que `getPostById` a déjà aplati ET projeté pour son lecteur — la
   * racine y porte donc `mentions`, jamais la relation. Son `repostOf`, lui,
   * sort du `select` (`repostOfInclude`) sous le nom de schéma : sans le
   * remappage, la route servirait `repostOf.postMentions`, que ni le web ni
   * iOS ne décodent — et le texte CITÉ retomberait sur la regex locale du
   * client, qui linkifie n'importe quel `@handle` vers un profil inexistant.
   */
  it('aplatit les références de l\'ORIGINAL sur la route de détail', async () => {
    mockGetPostById.mockResolvedValue({
      id: 'repost-1', type: 'POST', authorId: USER_ID, visibility: 'PUBLIC',
      visibilityUserIds: [], mentions: [FLAT_MENTION],
      repostOf: { id: POST_ID, content: 'bravo @alice', postMentions: [MENTION_ROW] },
    });
    const { app } = await buildApp();

    const res = await app.inject({ method: 'GET', url: '/posts/repost-1' });

    expect(res.statusCode).toBe(200);
    const nested = res.json().data.repostOf;
    expect(nested).not.toHaveProperty('postMentions');
    expect(nested.mentions).toEqual([FLAT_MENTION]);
    // La racine, déjà projetée par le service, traverse intacte : la repasser
    // sur une relation absente rendrait une liste vide et effacerait ce que le
    // lecteur a le droit de voir.
    expect(res.json().data.mentions).toEqual([FLAT_MENTION]);
    await app.close();
  });
});
