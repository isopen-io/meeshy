/**
 * #4151 — « Une publication entre par une seule porte », côté CORPS.
 *
 * Le module offre trois portes qui écrivent toutes une ligne `Post` :
 * `POST /posts`, `POST /posts/from-attachment` et `POST /posts/:postId/repost`.
 * Les deux premières portaient ~200 lignes RECOPIÉES (traduction Prisme,
 * `resolvePostMentions`, `finalReferences`, les trois branches de diffusion) —
 * et la copie avait DÉJÀ dérivé : from-attachment n'indexait aucun hashtag et
 * ne prévenait aucun ami, deux effets que `POST /posts` déclenche depuis
 * toujours. La divergence silencieuse que l'issue prédit était déjà là.
 *
 * Ce fichier est le témoin de la FUSION. Il tient trois affirmations :
 *
 *  1. **Même ligne, même corps.** Servies la MÊME ligne écrite, les trois
 *     portes rendent le MÊME JSON, au même statut. Assertions sur le corps
 *     SÉRIALISÉ (`app.inject()`), jamais sur un code de statut seul : le dépôt
 *     ne déclare aucun `schema.response` sur ces routes (cf. le témoin
 *     `GET /posts/:postId` de `core.test.ts`), donc ce qui sort est exactement
 *     ce que la route compose.
 *  2. **Mêmes effets de publication.** Hashtags, éventail d'amis, traduction,
 *     mentions et branche de diffusion partent des DEUX portes créatrices.
 *  3. **Preuve par mutation.** Chaque règle vérifiée ici l'est sur les DEUX
 *     portes dans le même `describe` : muter la règle DANS LE NOYAU
 *     (`routes/posts/publication.ts`) fait tomber les deux témoins ensemble.
 *     Si un seul tombe, il reste une copie. Mesuré à la livraison, deux fois :
 *
 *       - branche de diffusion neutralisée (`postType === 'STORY'` → `false`)
 *         ⇒ 2 échecs, `POST /posts` ET `POST /posts/from-attachment` ;
 *       - règle de mention aveuglée (`content: postContent` → `undefined`)
 *         ⇒ 2 échecs, les mêmes deux portes.
 *
 *     Un témoin de branche de diffusion ne peut PAS s'écrire sur le cas
 *     nominal (`POST`) seul : c'est la branche par défaut, et neutraliser le
 *     discriminant y rend le même verdict. Le témoin qui tombe est celui de la
 *     STORY — même raison qu'un témoin de RANG du Prisme, qui ne s'écrit jamais
 *     sur le rang 1.
 *
 * Aucun mock de `withMutationLog` : sans en-tête `x-client-mutation-id`,
 * `withMutationLog`/`withMutationOutcome` exécutent `op()` directement. Mocker
 * le module rendrait ce fichier vert que les routes l'enveloppent ou non.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockRepostPost = jest.fn<any>();
const mockGetPostById = jest.fn<any>();
const mockDuplicate = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();

jest.mock('../../../../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
    repostPost: (...args: any[]) => mockRepostPost(...args),
    getPostById: (...args: any[]) => mockGetPostById(...args),
    republishStory: jest.fn<any>().mockResolvedValue(null),
    deletePost: jest.fn<any>().mockResolvedValue(null),
    updatePost: jest.fn<any>().mockResolvedValue(null),
  })),
}));

jest.mock('../../../../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({
    duplicate: (...args: any[]) => mockDuplicate(...args),
  })),
}));

jest.mock('../../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

const mockExtractMentions = jest.fn<any>();
const mockResolveUsernames = jest.fn<any>();
const mockCreatePostMentions = jest.fn<any>();

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createPostMentions: (...args: any[]) => mockCreatePostMentions(...args),
  })),
}));

const mockExtractHashtags = jest.fn<any>();
const mockCreatePostHashtags = jest.fn<any>();

jest.mock('../../../../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: (...args: any[]) => mockExtractHashtags(...args),
    createPostHashtags: (...args: any[]) => mockCreatePostHashtags(...args),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

const mockTranslatePost = jest.fn<any>();

jest.mock('../../../../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: (...args: any[]) => mockTranslatePost(...args),
      translateOnDemand: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../../../../services/TrackingLinkService', () => ({
  resolveFrontendBaseUrl: jest.fn<any>().mockReturnValue('https://app.example.com'),
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../../../../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// #4147 — les trois portes tirent leur plafond de création d'un compteur
// PARTAGÉ qui lit Redis DIRECTEMENT, fail-closed : sans ce double, chaque
// écriture serait refusée avant d'atteindre ce que ce fichier vérifie. `incr`
// répond toujours « premier appel » — le plafond a son témoin dédié
// (social-write-rate-limit.test.ts).
jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../../../../routes/posts/core';
import { registerInteractionRoutes } from '../../../../routes/posts/interactions';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const SOURCE_POST_ID = '507f1f77bcf86cd799439022';
const ATTACHMENT_ID = '507f1f77bcf86cd799439047';
const ALICE_ID = '507f1f77bcf86cd799439055';

/**
 * LA LIGNE ÉCRITE — une seule, servie identiquement par les trois doubles de
 * service. C'est le pivot du témoin « même ligne ⇒ même corps » : si les trois
 * portes rendent des JSON différents à partir d'ELLE, la divergence est dans
 * la composition de la réponse, seul endroit qui reste.
 *
 * Elle porte `metadata.location` parce que le hoist du lieu fait partie de ce
 * qu'une porte SERT — `POST /posts` le posait, le repost non.
 */
const PUBLISHED_ROW = {
  id: '507f1f77bcf86cd799439033',
  authorId: USER_ID,
  type: 'POST',
  visibility: 'PUBLIC',
  visibilityUserIds: [],
  content: 'Bonjour @alice #voyage',
  originalLanguage: 'fr',
  createdAt: '2026-09-02T10:00:00.000Z',
  metadata: {
    location: { latitude: 48.8566, longitude: 2.3522, name: 'Paris', address: null, category: null },
  },
} as const;

const storyRow = (type: 'STORY' | 'STATUS') => ({
  ...PUBLISHED_ROW,
  id: `${PUBLISHED_ROW.id}-${type}`,
  type,
  visibility: type === 'STORY' ? 'FRIENDS' : 'PUBLIC',
});

const ATTACHMENT_ROW = {
  id: ATTACHMENT_ID,
  messageId: '507f1f77bcf86cd799439041',
  mimeType: 'image/jpeg',
  fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/09/u1/photo.jpg',
  thumbnailUrl: null,
  originalName: 'photo.jpg',
  width: 1200,
  height: 900,
  duration: null,
  codec: null,
  thumbHash: 'abc',
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  message: {
    conversationId: 'conv-1',
    conversation: { identifier: 'conv-1' },
    messageType: 'image',
    isViewOnce: false,
    isBlurred: false,
    isEncrypted: false,
    effectFlags: 0,
    expiresAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
  },
};

const DUPLICATED = {
  fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/09/u2/copie.jpg',
  filePath: '2026/09/u2/copie.jpg',
  fileName: 'copie.jpg',
  fileSize: 4242,
  mimeType: 'image/jpeg',
};

// ─── Harness ──────────────────────────────────────────────────────────────────

type Harness = {
  app: FastifyInstance;
  social: Record<string, jest.Mock<any>>;
  notif: Record<string, jest.Mock<any>>;
};

async function buildApp(): Promise<Harness> {
  const app = Fastify({ logger: false });

  const prisma = {
    messageAttachment: { findUnique: jest.fn<any>().mockResolvedValue(ATTACHMENT_ROW) },
    postMedia: { create: jest.fn<any>().mockResolvedValue({ id: 'pm-1' }) },
    postMention: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;

  const notif = {
    createPostMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createFriendContentNotificationsBatch: jest.fn<any>().mockResolvedValue(undefined),
    createPostRepostNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
  app.decorate('notificationService', notif as any);

  const social = {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastPostReposted: jest.fn<any>().mockResolvedValue(undefined),
  };
  app.decorate('socialEvents', social as any);

  const requiredAuth = async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER', username: 'bob' },
    };
  };

  registerCoreRoutes(app, prisma, requiredAuth);
  registerInteractionRoutes(app, prisma, requiredAuth);
  await app.ready();
  return { app, social, notif };
}

/** Les trois portes, appelées avec le corps MINIMAL de chacune. */
const parPorte = {
  'POST /posts': (app: FastifyInstance, payload: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: '/posts', payload: { content: PUBLISHED_ROW.content, ...payload } }),
  'POST /posts/from-attachment': (app: FastifyInstance, payload: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID, content: PUBLISHED_ROW.content, ...payload },
    }),
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockCreatePost.mockReset().mockResolvedValue(PUBLISHED_ROW);
  mockRepostPost.mockReset().mockResolvedValue(PUBLISHED_ROW);
  mockGetPostById.mockReset().mockResolvedValue({ ...PUBLISHED_ROW, id: SOURCE_POST_ID });
  mockDuplicate.mockReset().mockResolvedValue(DUPLICATED);
  mockCanAccessConversation.mockReset().mockResolvedValue(true);
  mockExtractMentions.mockReset().mockReturnValue([]);
  mockResolveUsernames.mockReset().mockResolvedValue(new Map());
  mockCreatePostMentions.mockReset().mockResolvedValue(undefined);
  mockExtractHashtags.mockReset().mockReturnValue([]);
  mockCreatePostHashtags.mockReset().mockResolvedValue(undefined);
  mockTranslatePost.mockReset().mockResolvedValue(undefined);
});

// ─── 1. Même ligne écrite ⇒ même corps servi ─────────────────────────────────

describe('#4151 — les trois portes servent le MÊME corps pour la MÊME ligne', () => {
  it('POST /posts et POST /posts/from-attachment rendent un JSON identique, au même statut', async () => {
    const { app } = await buildApp();

    const viaPosts = await parPorte['POST /posts'](app);
    const viaAttachment = await parPorte['POST /posts/from-attachment'](app);

    expect(viaAttachment.statusCode).toBe(viaPosts.statusCode);
    expect(viaPosts.statusCode).toBe(201);
    expect(viaAttachment.json()).toEqual(viaPosts.json());

    await app.close();
  });

  it('POST /posts/:postId/repost rend le même JSON pour la même ligne', async () => {
    const { app } = await buildApp();

    const viaPosts = await parPorte['POST /posts'](app);
    const viaRepost = await app.inject({
      method: 'POST',
      url: `/posts/${SOURCE_POST_ID}/repost`,
      payload: { isQuote: false, targetType: 'POST' },
    });

    expect(viaRepost.statusCode).toBe(201);
    expect(viaRepost.json()).toEqual(viaPosts.json());

    await app.close();
  });

  it('le lieu est HISSÉ en racine sur les trois portes — le corps servi, pas le code', async () => {
    const { app } = await buildApp();

    const corps = [
      (await parPorte['POST /posts'](app)).json(),
      (await parPorte['POST /posts/from-attachment'](app)).json(),
      (
        await app.inject({
          method: 'POST',
          url: `/posts/${SOURCE_POST_ID}/repost`,
          payload: { isQuote: false, targetType: 'POST' },
        })
      ).json(),
    ];

    for (const body of corps) {
      expect(body.data.location).toEqual({
        latitude: 48.8566, longitude: 2.3522, name: 'Paris', address: null, category: null,
      });
      // `mentions` est la clé EXPOSÉE — jamais `postMentions`, jamais absente.
      expect(Array.isArray(body.data.mentions)).toBe(true);
    }

    await app.close();
  });
});

// ─── 2. Les effets de publication partent des DEUX portes créatrices ─────────

describe('#4151 — un hashtag posé est indexé, quelle que soit la porte', () => {
  it.each(Object.keys(parPorte) as (keyof typeof parPorte)[])('%s indexe #voyage', async (porte) => {
    mockExtractHashtags.mockReturnValue(['voyage']);
    const { app } = await buildApp();

    const res = await parPorte[porte](app);
    await settle();

    expect(mockExtractHashtags).toHaveBeenCalledWith(PUBLISHED_ROW.content);
    expect(mockCreatePostHashtags).toHaveBeenCalledWith(PUBLISHED_ROW.id, ['voyage']);
    expect(res.statusCode).toBe(201);

    await app.close();
  });
});

describe('#4151 — les amis sont prévenus, quelle que soit la porte', () => {
  it.each(Object.keys(parPorte) as (keyof typeof parPorte)[])('%s ouvre l\'éventail d\'amis', async (porte) => {
    const { app, notif } = await buildApp();

    const res = await parPorte[porte](app);
    await settle();

    expect(notif.createFriendContentNotificationsBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        postId: PUBLISHED_ROW.id,
        authorId: USER_ID,
        contentType: 'POST',
        visibility: 'PUBLIC',
      }),
    );
    expect(res.statusCode).toBe(201);

    await app.close();
  });
});

describe('#4151 — la règle de MENTION est la même des deux côtés', () => {
  it.each(Object.keys(parPorte) as (keyof typeof parPorte)[])(
    '%s résout @alice depuis le contenu du post écrit',
    async (porte) => {
      mockExtractMentions.mockReturnValue(['alice']);
      mockResolveUsernames.mockResolvedValue(new Map([['alice', { id: ALICE_ID }]]));
      const { app } = await buildApp();

      const res = await parPorte[porte](app);
      await settle();

      expect(mockCreatePostMentions).toHaveBeenCalledWith(
        PUBLISHED_ROW.id,
        [ALICE_ID],
        expect.anything(),
      );
      expect(res.statusCode).toBe(201);

      await app.close();
    },
  );
});

describe('#4151 — le Prisme couvre la légende, quelle que soit la porte', () => {
  it.each(Object.keys(parPorte) as (keyof typeof parPorte)[])('%s déclenche translatePost', async (porte) => {
    const { app } = await buildApp();

    const res = await parPorte[porte](app);
    await settle();

    expect(mockTranslatePost).toHaveBeenCalledWith(
      PUBLISHED_ROW.id, PUBLISHED_ROW.content, 'fr', USER_ID,
    );
    expect(res.statusCode).toBe(201);

    await app.close();
  });
});

// ─── 3. La branche de diffusion — la règle qu'on MUTE pour la preuve ─────────

describe('#4151 — la branche de diffusion suit le TYPE, sur les deux portes', () => {
  it.each([
    ['POST /posts', { type: 'STORY' }],
    ['POST /posts/from-attachment', { target: 'STORY' }],
  ] as const)('%s diffuse story:created pour une STORY', async (porte, payload) => {
    mockCreatePost.mockResolvedValue(storyRow('STORY'));
    const { app, social } = await buildApp();

    const res = await parPorte[porte as keyof typeof parPorte](app, payload as Record<string, unknown>);
    await settle();

    expect(social.broadcastStoryCreated).toHaveBeenCalledTimes(1);
    expect(social.broadcastPostCreated).not.toHaveBeenCalled();
    expect(social.broadcastStatusCreated).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);

    await app.close();
  });

  it.each(Object.keys(parPorte) as (keyof typeof parPorte)[])(
    '%s diffuse post:created pour un POST',
    async (porte) => {
      const { app, social } = await buildApp();

      const res = await parPorte[porte](app);
      await settle();

      expect(social.broadcastPostCreated).toHaveBeenCalledTimes(1);
      expect(social.broadcastStoryCreated).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(201);

      await app.close();
    },
  );
});
