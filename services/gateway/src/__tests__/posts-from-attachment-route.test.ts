/**
 * Route tests — POST /posts/from-attachment.
 *
 * Couvre les deux défauts corrigés (audit iOS-01 / iOS-02) :
 *  - iOS-01 : un média PROTÉGÉ (vue unique / flou / chiffré) est refusé 400
 *    PROTECTED_MEDIA avant toute duplication ;
 *  - iOS-02 : la visibilité par défaut suit le TYPE (STORY → FRIENDS, sinon
 *    PUBLIC), et la publication n'est plus SILENCIEUSE — elle diffuse en temps
 *    réel et résout les mentions du contenu.
 *
 * Harnais calqué sur posts-share-route.test.ts (fastify.inject + mocks Prisma).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCreatePost = jest.fn<any>();
const mockDuplicate = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();

const mockExtractMentions = jest.fn<any>().mockReturnValue([]);
const mockResolveUsernames = jest.fn<any>().mockResolvedValue(new Map());
const mockCreatePostMentions = jest.fn<any>().mockResolvedValue(undefined);

const mockCreatePostMentionNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);
const mockCreateFriendContentNotificationsBatch = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../services/PostService', () => ({
  PostService: jest.fn().mockImplementation(() => ({
    createPost: (...args: any[]) => mockCreatePost(...args),
  })),
}));

jest.mock('../services/MediaService', () => ({
  MediaService: jest.fn().mockImplementation(() => ({
    duplicate: (...args: any[]) => mockDuplicate(...args),
  })),
}));

jest.mock('../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  MentionService: jest.fn().mockImplementation(() => ({
    extractMentions: (...args: any[]) => mockExtractMentions(...args),
    resolveUsernames: (...args: any[]) => mockResolveUsernames(...args),
    createPostMentions: (...args: any[]) => mockCreatePostMentions(...args),
  })),
}));

jest.mock('../services/HashtagService', () => ({
  HashtagService: jest.fn().mockImplementation(() => ({
    extractHashtags: jest.fn<any>().mockReturnValue([]),
    createPostHashtags: jest.fn<any>().mockResolvedValue(undefined),
    reconcileRemovedHashtags: jest.fn<any>().mockResolvedValue(undefined),
  })),
}));

jest.mock('../services/posts/PostTranslationService', () => ({
  PostTranslationService: {
    shared: {
      translatePost: jest.fn<any>().mockResolvedValue(undefined),
      translateOnDemand: jest.fn<any>().mockResolvedValue(undefined),
    },
  },
}));

jest.mock('../middleware/rate-limiter', () => ({
  createPostRouteRateLimitConfig: jest.fn<any>().mockReturnValue({}),
}));

jest.mock('../utils/withMutationLog', () => ({
  ...(jest.requireActual('../utils/withMutationLog') as object),
  withMutationLog: jest.fn<any>().mockImplementation(({ op }: any) => op()),
}));

jest.mock('../utils/sanitize.js', () => ({
  SecuritySanitizer: { sanitizeText: jest.fn((t: string) => t) },
}));

// #4147 — POST /posts/from-attachment tire son plafond de création d'un
// compteur PARTAGÉ qui lit Redis directement, fail-closed
// (createSharedWriteRateLimitPreHandler, routes/posts/socialRateLimit.ts) :
// sans ce double, `getCacheStore().getNativeClient()` rend `null` en test
// (aucun REDIS_URL) et CHAQUE publication serait refusée avant d'atteindre
// ce que ce fichier vérifie — détail complet dans
// unit/routes/posts/core.test.ts, premier fichier de la série à le poser.
// `incr` répond toujours « premier appel » : ce fichier ne teste PAS le
// plafond (son témoin dédié vit dans social-write-rate-limit.test.ts) —
// juste un Redis DISPONIBLE.
jest.mock('../services/CacheStore', () => ({
  getCacheStore: () => ({
    getNativeClient: () => ({
      incr: async () => 1,
      pexpire: async () => 1,
      pttl: async () => -1,
    }),
  }),
}));// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerCoreRoutes } from '../routes/posts/core';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = '507f1f77bcf86cd799439047';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// La protection vit à DEUX niveaux, qui ne suivent PAS l'un l'autre :
//  - la PIÈCE JOINTE (isViewOnce/isBlurred/effectFlags) — lue par maskedAttachment ;
//  - le MESSAGE PARENT (messageType/isViewOnce/isBlurred/isEncrypted/effectFlags/
//    expiresAt/createdAt) — lu par protectedPreview, et c'est LÀ que
//    MessageProcessor.saveMessage range une vraie vue-unique / flou / éphémère.
// Le second paramètre cible le message, pour prouver le cas que l'ancienne
// version (garde au seul niveau attachment) laissait passer.
const makeAttachmentRow = (
  overrides: Record<string, unknown> = {},
  messageOverrides: Record<string, unknown> = {},
) => ({
  id: ATTACHMENT_ID,
  messageId: '507f1f77bcf86cd799439041',
  mimeType: 'image/jpeg',
  fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/08/u1/photo.jpg',
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
  ...overrides,
  message: {
    conversationId: 'conv-1',
    conversation: { identifier: 'conv-1' },
    messageType: 'image',
    isViewOnce: false,
    isBlurred: false,
    isEncrypted: false,
    effectFlags: 0,
    expiresAt: null,
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    ...messageOverrides,
  },
});

const DUPLICATED = {
  fileUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/08/u2/copie.jpg',
  filePath: '2026/08/u2/copie.jpg',
  fileName: 'copie.jpg',
  fileSize: 4242,
  mimeType: 'image/jpeg',
};

// ─── Harness ──────────────────────────────────────────────────────────────────

function makePreValidationAuth() {
  return async (req: FastifyRequest) => {
    (req as any).authContext = {
      isAuthenticated: true,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
}

async function buildApp(prismaOverrides: Record<string, unknown> = {}): Promise<{
  app: FastifyInstance;
  social: Record<string, any>;
}> {
  const app = Fastify({ logger: false });
  const prisma = {
    messageAttachment: { findUnique: jest.fn<any>().mockResolvedValue(makeAttachmentRow()) },
    postMedia: { create: jest.fn<any>().mockResolvedValue({ id: 'pm-1' }) },
    postMention: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...prismaOverrides,
  } as any;

  app.decorate('notificationService', {
    createPostMentionNotificationsBatch: (...args: any[]) => mockCreatePostMentionNotificationsBatch(...args),
    createFriendContentNotificationsBatch: (...args: any[]) => mockCreateFriendContentNotificationsBatch(...args),
  } as any);

  const social = {
    broadcastPostCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStoryCreated: jest.fn<any>().mockResolvedValue(undefined),
    broadcastStatusCreated: jest.fn<any>().mockResolvedValue(undefined),
  };
  app.decorate('socialEvents', social as any);

  registerCoreRoutes(app, prisma, makePreValidationAuth());
  await app.ready();
  return { app, social };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockCreatePost.mockReset();
  mockDuplicate.mockReset().mockResolvedValue(DUPLICATED);
  mockCanAccessConversation.mockReset().mockResolvedValue(true);
  mockExtractMentions.mockReset().mockReturnValue([]);
  mockResolveUsernames.mockReset().mockResolvedValue(new Map());
  mockCreatePostMentions.mockReset().mockResolvedValue(undefined);
});

describe('POST /posts/from-attachment — iOS-01 : refus d\'un média protégé', () => {
  const expectRefused = async (row: unknown) => {
    const findUnique = jest.fn<any>().mockResolvedValue(row);
    const { app } = await buildApp({ messageAttachment: { findUnique } });

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('PROTECTED_MEDIA');
    expect(mockDuplicate).not.toHaveBeenCalled();
    expect(mockCreatePost).not.toHaveBeenCalled();
    await app.close();
  };

  it('refuse une pièce jointe à VUE UNIQUE au niveau ATTACHEMENT', async () => {
    await expectRefused(makeAttachmentRow({ isViewOnce: true }));
  });

  // Le cœur de la régression : pour une vraie vue-unique, les colonnes de
  // l'ATTACHEMENT valent false — la protection vit sur le MESSAGE parent.
  // L'ancienne garde (attachment seul) laissait donc passer ce cas EN CLAIR.
  it('refuse une vue-unique portée par le MESSAGE PARENT (attachment.isViewOnce=false)', async () => {
    await expectRefused(makeAttachmentRow({ isViewOnce: false }, { isViewOnce: true }));
  });

  it('refuse quand seuls les effectFlags portent le bit VIEW_ONCE (booléens false)', async () => {
    // MESSAGE_EFFECT_FLAGS.VIEW_ONCE === 4.
    await expectRefused(makeAttachmentRow({ effectFlags: 4, isViewOnce: false, isBlurred: false }));
  });

  it("refuse un message ÉPHÉMÈRE (expiresAt non nul) — cohérent avec la bannière", async () => {
    await expectRefused(
      makeAttachmentRow({}, { expiresAt: new Date('2026-08-27T00:00:00.000Z') }),
    );
  });

  it('refuse un message CHIFFRÉ (isEncrypted sur le message parent)', async () => {
    await expectRefused(makeAttachmentRow({}, { isEncrypted: true }));
  });
});

describe('POST /posts/from-attachment — iOS-02(a) : visibilité par défaut selon le type', () => {
  it('une STORY par défaut est publiée FRIENDS, pas PUBLIC', async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-story', type: 'STORY', visibility: 'FRIENDS', createdAt: new Date() });
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID, target: 'STORY' },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'STORY', visibility: 'FRIENDS' }),
      USER_ID,
    );
    await app.close();
  });

  it('un POST par défaut reste PUBLIC', async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-pub', type: 'POST', visibility: 'PUBLIC', createdAt: new Date() });
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID },
    });

    expect(res.statusCode).toBe(200);
    expect(mockCreatePost).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'POST', visibility: 'PUBLIC' }),
      USER_ID,
    );
    await app.close();
  });
});

describe('POST /posts/from-attachment — iOS-02(b) : la publication n\'est plus silencieuse', () => {
  it('diffuse en temps réel (broadcastPostCreated) après une publication non protégée', async () => {
    mockCreatePost.mockResolvedValue({ id: 'post-b', type: 'POST', visibility: 'PUBLIC', content: 'photo', createdAt: new Date() });
    const { app, social } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID },
    });

    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(social.broadcastPostCreated).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('résout les mentions du contenu (createPostMentions) après publication', async () => {
    mockExtractMentions.mockReturnValue(['alice']);
    mockResolveUsernames.mockResolvedValue(new Map([['alice', { id: 'user-alice' }]]));
    mockCreatePost.mockResolvedValue({ id: 'post-m', type: 'POST', visibility: 'PUBLIC', content: 'Hi @alice', createdAt: new Date() });
    const { app, social } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID, content: 'Hi @alice' },
    });

    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockCreatePostMentions).toHaveBeenCalledWith(
      'post-m',
      ['user-alice'],
      expect.anything(),
    );
    expect(social.broadcastPostCreated).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('POST /posts/from-attachment — iOS-02(c) : le Prisme couvre la légende', () => {
  const translationMock = () =>
    (jest.requireMock('../services/posts/PostTranslationService') as any).PostTranslationService.shared.translatePost as jest.Mock;

  it('déclenche la traduction de la légende pour un POST/REEL avec contenu', async () => {
    translationMock().mockClear();
    mockCreatePost.mockResolvedValue({ id: 'post-tr', type: 'POST', visibility: 'PUBLIC', content: 'Bonjour', originalLanguage: 'fr', createdAt: new Date() });
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID, content: 'Bonjour' },
    });

    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(translationMock()).toHaveBeenCalledTimes(1);
    expect(translationMock()).toHaveBeenCalledWith('post-tr', 'Bonjour', 'fr', USER_ID);
    await app.close();
  });

  it('ne déclenche PAS la traduction pour une STORY (pipeline audience-driven du service)', async () => {
    translationMock().mockClear();
    mockCreatePost.mockResolvedValue({ id: 'story-tr', type: 'STORY', visibility: 'FRIENDS', content: 'Bonjour', originalLanguage: 'fr', createdAt: new Date() });
    const { app } = await buildApp();

    const res = await app.inject({
      method: 'POST', url: '/posts/from-attachment',
      payload: { attachmentId: ATTACHMENT_ID, target: 'STORY', content: 'Bonjour' },
    });

    expect(res.statusCode).toBe(200);
    await new Promise((resolve) => setImmediate(resolve));
    expect(translationMock()).not.toHaveBeenCalled();
    await app.close();
  });
});
