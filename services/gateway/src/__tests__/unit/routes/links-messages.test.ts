/**
 * Unit tests for links/messages routes.
 * Tests POST /links/:identifier/messages — le SEUL transport d'envoi par lien.
 *
 * `POST /links/:identifier/messages/auth` a été RETIRÉE (#4188). Aucun des
 * quatre clients ne l'appelait, et pour le fil global `meeshy` elle fabriquait
 * un participant SYNTHÉTIQUE `{ id: userId }` : le message partait avec un
 * `User.id` dans `Message.senderId`, colonne qui attend un `Participant.id`, et
 * la garde d'appartenance était court-circuitée. Un membre inscrit écrit par le
 * transport nominal. Les deux tables paramétrées plus bas (contrat du corps 201,
 * obligations post-commit) ont donc perdu leur ligne `authenticated` : ce
 * qu'elles verrouillent reste dû par le jumeau anonyme, seul survivant.
 * L'absence de la route est verrouillée par `dead-doors-are-not-mounted.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token: string) => 'hashed-' + token),
}));

const mockProcessMessageLinks = jest.fn<any>().mockResolvedValue({
  processedContent: 'Hello!',
  trackingLinks: [],
});
const mockUpdateTrackingLinksMessageId = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processMessageLinks: (...a: any[]) => mockProcessMessageLinks(...a),
    updateTrackingLinksMessageId: (...a: any[]) => mockUpdateTrackingLinksMessageId(...a),
  })),
}));

const mockAuthMiddleware = jest.fn<any>();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
  UnifiedAuthRequest: {},
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  // Le module réel est ÉTALÉ d'abord — PROLONGER, jamais REMPLACER
  // (`services/gateway/CLAUDE.md` § « Un double PARTIEL d'un module perd en
  // silence tout ce que le module GAGNE »). Une usine qui n'énumère que les
  // schémas dont CE fichier a besoin rend `undefined` tous les autres : le
  // jour où un module VOISIN en compose un au chargement — ce que fait
  // `api-schemas-attachments.ts`, réexporté par le barillet `types/index.ts` —
  // la suite entière cesse de se charger, sur un `TypeError` sans rapport avec
  // ce qu'elle teste. Les surcharges ci-dessous restent PRIORITAIRES : elles
  // sont posées après l'étalement.
  ...(jest.requireActual('@meeshy/shared/types/api-schemas') as object),
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
      message: { type: 'string' },
      code: { type: 'string' },
    },
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { LINK_MESSAGE_NEW: 'link:message-new' },
  ROOMS: { conversation: (id: string) => `conversation:${id}` },
}));

// Post-save language stats: a real singleton driven by a mock prisma would only
// exercise its own error path here. The route's obligation is that it FIRES,
// which is what the double records.
const mockUpdateOnNewMessage = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...a: any[]) => mockUpdateOnNewMessage(...a),
  },
}));

// Controllable parse mock
const mockParse = jest.fn<any>((body: any) => ({
  content: body?.content ?? 'Hello!',
  originalLanguage: body?.originalLanguage ?? 'fr',
  messageType: body?.messageType ?? 'text',
  clientMessageId: body?.clientMessageId ?? 'cid_test',
}));

// Only `sendMessageSchema.parse` is stubbed (to drive Zod failures); every
// response-shaping constant is the REAL one. A permissive stand-in
// (`additionalProperties: true`) would make fast-json-stringify echo whatever
// the route hands it, so a truncating schema would still look correct here —
// exactly the coincidence the cycle-7 review flagged (D4).
jest.mock('../../../routes/links/types', () => ({
  ...(jest.requireActual('../../../routes/links/types') as Record<string, unknown>),
  sendMessageSchema: { parse: (...a: any[]) => mockParse(...a) },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMessageRoutes } from '../../../routes/links/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const MSHY_ID = 'mshy_link_abc123';
const DB_ID = '507f1f77bcf86cd799439055';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const LINK_DB_ID = '507f1f77bcf86cd799439011';
const MSG_ID = '507f1f77bcf86cd799439044';
const PEER_USER_ID = '507f1f77bcf86cd799439055';
const SESSION_TOKEN = 'anon_session_token';

const mockShareLink = {
  id: LINK_DB_ID, linkId: MSHY_ID, conversationId: CONV_ID,
  isActive: true, expiresAt: null, allowAnonymousMessages: true,
  conversation: { id: CONV_ID, identifier: 'some-conv', title: 'Test', type: 'group' },
};

const mockParticipantShareLink = {
  id: LINK_DB_ID, conversationId: CONV_ID,
  isActive: true, allowAnonymousMessages: true, expiresAt: null,
};

const mockAnonParticipant = {
  id: PART_ID, conversationId: CONV_ID, type: 'anonymous',
  displayName: 'anon', language: 'fr',
  sessionTokenHash: 'hashed-' + SESSION_TOKEN,
  isActive: true,
  permissions: { canSendMessages: true, canSendFiles: false },
  anonymousSession: { shareLinkId: LINK_DB_ID },
};

const CID = 'cid_550e8400-e29b-41d4-a716-446655440000';

const mockMessage = {
  id: MSG_ID, content: 'Hello!', originalLanguage: 'fr', messageType: 'text',
  clientMessageId: CID,
  isEdited: false, editedAt: null, deletedAt: null, replyToId: null,
  createdAt: new Date(), updatedAt: new Date(),
  sender: { id: PART_ID, userId: null, displayName: 'anon', avatar: null, type: 'anonymous', language: 'fr', user: null },
};

const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockImplementation(async (opts: any) => {
        if (opts?.where?.id === LINK_DB_ID) return mockParticipantShareLink;
        return mockShareLink;
      }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockAnonParticipant),
      // Éventail de notifications : résolution de l'identité de l'expéditeur.
      findUnique: jest.fn<any>().mockResolvedValue({
        userId: null, displayName: 'anon', avatar: null,
      }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        username: 'alice', displayName: 'Alice', avatar: null,
      }),
    },
    message: {
      create: jest.fn<any>().mockResolvedValue(mockMessage),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      // Écriture de `validatedMentions` : la seule trace durable qu'un `@`
      // envoyé par lien a été reconnu.
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue(undefined),
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Test', type: 'group', participants: [{ userId: PEER_USER_ID }],
      }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

/**
 * Le résolveur de mentions, sous la seule forme structurale que
 * `resolveMessageMentions` consomme. Par défaut il reconnaît `@bob` et le
 * résout vers le pair inscrit de la conversation.
 */
function makeMentionResolver(overrides: Record<string, any> = {}) {
  return {
    extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['bob']),
    resolveUsernames: jest.fn<any>().mockResolvedValue(
      new Map([['bob', { id: PEER_USER_ID, username: 'bob' }]])
    ),
    validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: [PEER_USER_ID] }),
    createMentions: jest.fn<any>().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeNotificationService() {
  return {
    createReplyNotification: jest.fn<any>().mockResolvedValue(null),
    createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createMessageNotification: jest.fn<any>().mockResolvedValue(null),
  };
}

function makeTranslationService() {
  return { handleNewMessage: jest.fn<any>().mockResolvedValue({ status: 'queued' }) };
}

function makeSocketIOHandler(hasManager = false) {
  if (!hasManager) {
    return {
      getManager: () => null,
      to: jest.fn(),
      emit: jest.fn(),
      enqueueOfflineLinkMessage: jest.fn(),
      emitUnreadCountsToRecipients: jest.fn(),
      autoDeliverToOnlineRecipients: jest.fn(),
    };
  }
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  // The manager's offline-queue surface is part of what a link message send
  // must exercise: the room emit only reaches CONNECTED sockets, so without
  // this second call an offline participant never learns the message exists.
  const enqueueOfflineLinkMessage = jest.fn<any>().mockResolvedValue(undefined);
  // Third audience: every recipient's unread badge. The room emit announces the
  // message, the queue replays it — neither moves the counter.
  const emitUnreadCountsToRecipients = jest.fn<any>().mockResolvedValue(undefined);
  // Quatrième obligation, et la seule tournée vers l'EXPÉDITEUR : l'accusé de
  // livraison. Sans elle, l'indicateur de l'auteur d'un message par lien reste
  // sur « envoyé » à vie, même quand tous ses destinataires sont connectés.
  const autoDeliverToOnlineRecipients = jest.fn<any>().mockResolvedValue(undefined);
  return {
    getManager: () => ({
      getIO: () => ({ to }),
      enqueueOfflineLinkMessage,
      emitUnreadCountsToRecipients,
      autoDeliverToOnlineRecipients,
    }),
    to,
    emit,
    enqueueOfflineLinkMessage,
    emitUnreadCountsToRecipients,
    autoDeliverToOnlineRecipients,
  };
}

async function buildApp(opts: {
  prisma?: any;
  socketIOHandler?: any;
  authContext?: any;
  translationService?: any;
  notificationService?: any;
  mentionService?: any;
} = {}): Promise<FastifyInstance> {
  const ctx = opts.authContext ?? mockAuthContext;
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = ctx;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', opts.prisma ?? makePrisma());
  app.decorate('socketIOHandler', opts.socketIOHandler ?? makeSocketIOHandler(false));
  app.decorate(
    'translationService',
    opts.translationService === null ? undefined : opts.translationService ?? makeTranslationService()
  );
  app.decorate(
    'notificationService',
    opts.notificationService === null ? undefined : opts.notificationService ?? makeNotificationService()
  );
  app.decorate(
    'mentionService',
    opts.mentionService === null ? undefined : opts.mentionService ?? makeMentionResolver()
  );
  await registerMessageRoutes(app);
  await app.ready();
  return app;
}

/** Les effets post-commit sont fire-and-forget : ils se règlent après le 201. */
const flushPostSaveEffects = () => new Promise((resolve) => setImmediate(resolve));

const VALID_BODY = { content: 'Hello!', clientMessageId: CID };
const ANON_HEADERS = { 'x-session-token': SESSION_TOKEN };

// ═══════════════════════════════════════════════════════════════════════════════
// Anonymous route: POST /links/:identifier/messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /links/:id/messages — anonymous: missing session token header', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when x-session-token header is absent (AJV required header)', async () => {
    const res = await app.inject({ method: 'POST', url: `/links/${MSHY_ID}/messages`, payload: VALID_BODY });
    expect([400, 401]).toContain(res.statusCode);
  });
});

describe('POST /links/:id/messages — anonymous: empty session token', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when x-session-token is empty string', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: { 'x-session-token': '' }, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /links/:id/messages — anonymous: share link not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockResolvedValue(null);
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 404 when share link not found', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /links/:id/messages — anonymous: non-mshy_ identifier', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockImplementation(async (opts: any) => {
      if (opts?.where?.id === DB_ID) return mockShareLink;
      if (opts?.where?.id === LINK_DB_ID) return mockParticipantShareLink;
      return null;
    });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 using db id path (non-mshy_ identifier)', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${DB_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /links/:id/messages — anonymous: participant not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(null);
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when anonymous participant not found', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /links/:id/messages — anonymous: participantShareLink null', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    const anonWithNoShareLink = { ...mockAnonParticipant, anonymousSession: { shareLinkId: null } };
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue(anonWithNoShareLink);
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when anonymousSession.shareLinkId is null', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /links/:id/messages — anonymous: participantShareLink inactive', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>()
      .mockResolvedValueOnce(mockShareLink)
      .mockResolvedValueOnce({ ...mockParticipantShareLink, isActive: false });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when participantShareLink is inactive', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(410);
  });
});

describe('POST /links/:id/messages — anonymous: participantShareLink expired', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>()
      .mockResolvedValueOnce(mockShareLink)
      .mockResolvedValueOnce({ ...mockParticipantShareLink, expiresAt: new Date('2020-01-01') });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 when participantShareLink has expired', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(410);
  });
});

// Les deux routes de lien de partage CONTOURNENT
// `MessagingService.handleMessage` — le point de convergence où la règle « une
// conversation close n'accepte plus d'écriture » est posée pour REST et socket.
// Elles gardaient déjà l'état terminal du LIEN (`isActive`, `expiresAt`) ;
// aucune ne regardait celui de la CONVERSATION. Le lien de partage est par
// ailleurs le seul transport d'envoi d'un invité anonyme : sans cette garde,
// fermer une conversation ne fermait rien pour l'inconnu qui détient l'URL.
const CLOSED_AT = new Date('2026-08-15T10:00:00.000Z');

/**
 * Le double PROJETTE, comme la vraie base.
 *
 * Un double qui rend son objet entier quel que soit le `select` prouve que la
 * route sait décider — jamais qu'elle a DEMANDÉ de quoi décider. La première
 * version de cette garde n'avait été posée que sur la seconde branche de
 * résolution du lien authentifié (`where: { id }`), laissant la première
 * (`where: { linkId: 'mshy_…' }`, celle des URLs réelles) sans les colonnes
 * d'état terminal : la garde y lisait `undefined` et admettait tout. Les deux
 * témoins ci-dessous étaient VERTS sur ce code inerte.
 *
 * Même remède que le double d'`earlyDedup` dans `MessagingService.test.ts` :
 * ne rendre une colonne que si la requête l'a réclamée.
 */
const projectConversation = (args: any, conversation: Record<string, unknown>) => {
  const select = args?.include?.conversation?.select ?? args?.select?.conversation?.select;
  if (!select) return undefined;
  return Object.fromEntries(
    Object.keys(select).filter((k) => select[k]).map((k) => [k, conversation[k]])
  );
};

describe('POST /links/:id/messages — anonymous: conversation close', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>()
      .mockImplementationOnce(async () => mockShareLink)
      .mockImplementationOnce(async (args: any) => ({
        ...mockParticipantShareLink,
        conversation: projectConversation(args, { isActive: false, closedAt: CLOSED_AT }),
      }));
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 410 and writes nothing when the conversation is closed', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(410);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe('POST /links/:id/messages — anonymous: allowAnonymousMessages=false', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>()
      .mockResolvedValueOnce(mockShareLink)
      .mockResolvedValueOnce({ ...mockParticipantShareLink, allowAnonymousMessages: false });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous messages not allowed', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /links/:id/messages — anonymous: canSendMessages=false', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.participant.findFirst = jest.fn<any>().mockResolvedValue({
      ...mockAnonParticipant,
      permissions: { canSendMessages: false, canSendFiles: false },
    });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when participant canSendMessages is false', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
  });
});

// Le RANG d'écriture, sur les mêmes deux routes. Les droits du LIEN vérifiés
// autour disent ce que le lien autorise ; ils ne disent rien de ce que la
// conversation accepte. Un lien anonyme ouvert sur un canal d'annonces est la
// contradiction que la garde tranche — et sans elle, le lien de partage restait
// le seul tuyau par lequel un simple membre y publiait.

describe('POST /links/:id/messages — anonymous: canal d’annonces', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => {
    prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>()
      .mockImplementationOnce(async () => mockShareLink)
      .mockImplementationOnce(async (args: any) => ({
        ...mockParticipantShareLink,
        conversation: projectConversation(args, {
          type: 'group',
          isActive: true,
          closedAt: null,
          isAnnouncementChannel: true,
          defaultWriteRole: 'admin',
        }),
      }));
    prisma.participant.findUnique = jest.fn<any>().mockResolvedValue({
      role: 'member', user: null,
    });
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 and writes nothing for a plain member', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(403);
    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});

describe('POST /links/:id/messages — anonymous: with tracking links', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('calls updateTrackingLinksMessageId when trackingLinks is non-empty', async () => {
    mockProcessMessageLinks.mockResolvedValueOnce({
      processedContent: 'Hi [tracked]!',
      trackingLinks: [{ token: 'tok-1' }, { token: 'tok-2' }],
    });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(mockUpdateTrackingLinksMessageId).toHaveBeenCalledWith(['tok-1', 'tok-2'], MSG_ID);
  });
});

describe('POST /links/:id/messages — anonymous: originalLanguage canonicalization', () => {
  let app: FastifyInstance;
  let prisma: any;
  beforeAll(async () => { prisma = makePrisma(); app = await buildApp({ prisma }); });
  afterAll(async () => { await app.close(); });

  it('canonicalizes a region-tagged claim at the write boundary', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, originalLanguage: 'en-US' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'en' }) })
    );
  });

  it('keeps an irreducible claim verbatim', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, originalLanguage: 'bas' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'bas' }) })
    );
  });
});

describe('POST /links/:id/messages — anonymous: socketIO emit', () => {
  let app: FastifyInstance;
  let socketIOHandler: ReturnType<typeof makeSocketIOHandler>;
  beforeAll(async () => {
    socketIOHandler = makeSocketIOHandler(true);
    app = await buildApp({ socketIOHandler });
  });
  afterAll(async () => { await app.close(); });

  it('returns 201 and emits socket event when socketIO manager is available', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
    expect(res.json().data.messageId).toBe(MSG_ID);
  });

  // Le seul routage dont dispose un client : la charge utile elle-même. Le nom
  // de la room n'est pas transporté par Socket.IO côté réception, donc un
  // message sans `conversationId` est indélivrable — le client ne sait dans
  // quelle conversation l'insérer.
  it('carries the conversationId of the room it was emitted to', () => {
    expect(socketIOHandler.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
    const [, payload] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    expect(payload.message.conversationId).toBe(CONV_ID);
  });

  it('carries the senderId of the anonymous participant that authored it', () => {
    const [, payload] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    expect(payload.message.senderId).toBe(PART_ID);
  });

  // La room ne contient que des sockets CONNECTÉS. Sans cette seconde audience,
  // un participant hors ligne à cet instant n'apprend jamais l'existence du
  // message : `_drainPendingMessages` n'a rien à rejouer à sa reconnexion et le
  // client web ne refetch pas (`staleTime: Infinity`).
  it('queues the message for participants who are offline right now', () => {
    expect(socketIOHandler.enqueueOfflineLinkMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        actorParticipantId: PART_ID,
        messageId: MSG_ID,
      })
    );
  });

  // Le rejeu doit livrer EXACTEMENT ce que les pairs connectés ont reçu : même
  // événement, même charge utile débarrassée du `clientMessageId`. Un rejeu
  // porteur du cid fuiterait l'id optimiste de l'auteur chez un tiers.
  it('queues the same peer payload the live room received, cid stripped', () => {
    const [, live] = socketIOHandler.emit.mock.calls[0] as [string, unknown];
    const [queued] = socketIOHandler.enqueueOfflineLinkMessage.mock.calls[0] as [{ payload: unknown }];
    expect(queued.payload).toEqual(live);
    expect((queued.payload as { message: Record<string, unknown> }).message).not.toHaveProperty('clientMessageId');
  });

  // Le handler web `link:message:new` remonte la conversation et son aperçu,
  // mais ne touche PAS au compteur — et la liste est en `staleTime: Infinity`.
  // Sans ce troisième signal, la conversation saute en tête avec un nouvel
  // aperçu pendant que sa pastille affiche encore sa valeur d'avant.
  it('pushes a fresh unread badge to every recipient', () => {
    expect(socketIOHandler.emitUnreadCountsToRecipients).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      senderId: PART_ID,
    });
  });

  // Les trois audiences précédentes servent les DESTINATAIRES. Celle-ci sert
  // l'EXPÉDITEUR : `read-status:updated` est le seul signal qui fasse passer sa
  // coche de « envoyé » à « remis ». Le chemin nominal l'émet depuis ses deux
  // transports (`broadcastNewMessage` et `_broadcastNewMessage`) ; la route de
  // lien n'a jamais eu de quoi l'atteindre, donc l'auteur d'un message par lien
  // regardait une coche unique définitivement figée.
  it('acks delivery to the sender for recipients who are online right now', () => {
    expect(socketIOHandler.autoDeliverToOnlineRecipients).toHaveBeenCalledWith(
      { id: MSG_ID, senderId: PART_ID },
      CONV_ID
    );
  });
});

// Un accusé de livraison est un canal latéral : il ne doit ni rallonger le 201,
// ni pouvoir le transformer en 500, et une promesse rejetée sans handler tue le
// processus sous Node 22 (`--unhandled-rejections=throw`).
describe('POST /links/:id/messages — anonymous: delivery receipt failures never reach the sender', () => {
  it('still returns 201 when the receipt rejects', async () => {
    const socketIOHandler = makeSocketIOHandler(true);
    socketIOHandler.autoDeliverToOnlineRecipients.mockRejectedValue(new Error('read-status down'));
    const app = await buildApp({ socketIOHandler });

    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(201);
    await flushPostSaveEffects();
    await app.close();
  });

  it('still returns 201 when the manager has no receipt method at all', async () => {
    // Un manager d'une version antérieure, ou un double partiel : l'appel lève
    // SYNCHRONEMENT, avant qu'aucune promesse n'existe.
    const socketIOHandler = makeSocketIOHandler(true);
    const manager = socketIOHandler.getManager() as unknown as Record<string, unknown>;
    delete manager.autoDeliverToOnlineRecipients;
    const app = await buildApp({
      socketIOHandler: { ...socketIOHandler, getManager: () => manager },
    });

    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(201);
    await app.close();
  });
});

// Le badge, la room et la file hors ligne ne parlent qu'à un client OUVERT.
// Un destinataire qui n'a pas l'application au premier plan n'apprend
// l'existence du message que par une notification — push APNs/FCM, événement
// in-app, ligne `Notification`. Le chemin de lien contournant
// `MessagingService.handleMessage`, donc `MessageProcessor` en entier, aucune
// des trois ne partait : silence complet, pas dégradation.
describe('POST /links/:id/messages — anonymous: notification fan-out', () => {
  let app: FastifyInstance;
  let notificationService: ReturnType<typeof makeNotificationService>;

  beforeAll(async () => {
    notificationService = makeNotificationService();
    app = await buildApp({ socketIOHandler: makeSocketIOHandler(true), notificationService });
    await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
  });
  afterAll(async () => { await app.close(); });

  it('notifies every registered recipient of the conversation', () => {
    expect(notificationService.createMessageNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: PEER_USER_ID,
        messageId: MSG_ID,
        conversationId: CONV_ID,
      })
    );
  });

  // L'expéditeur d'un lien de partage est ANONYME : il n'a pas de ligne `User`.
  // Sans profil pré-résolu, `createMessageNotification` recharge l'expéditeur,
  // ne trouve rien et abandonne — c'est exactement ce qui faisait taire tout
  // l'éventail pour cette population.
  it('names the anonymous author from its participant profile', () => {
    const params = notificationService.createMessageNotification.mock.calls[0][0] as any;
    expect(params.senderId).toBe(PART_ID);
    expect(params.senderProfile).toEqual({ username: 'anon', displayName: 'anon', avatar: null });
  });
});

describe('POST /links/:id/messages — anonymous: notification failures never reach the sender', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const notificationService = makeNotificationService();
    notificationService.createMessageNotification.mockRejectedValue(new Error('APNs down'));
    app = await buildApp({ socketIOHandler: makeSocketIOHandler(true), notificationService });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 201 when the fan-out throws', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /links/:id/messages — anonymous: no notification service wired', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ socketIOHandler: makeSocketIOHandler(true), notificationService: null });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 201', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
    expect(res.statusCode).toBe(201);
  });
});

describe('POST /links/:id/messages — anonymous: ZodError catch', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when body parse throws ZodError', async () => {
    mockParse.mockImplementationOnce(() => {
      throw new z.ZodError([{ code: 'custom', message: 'Invalid', path: ['content'] }]);
    });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /links/:id/messages — anonymous: DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const prisma = makePrisma();
    prisma.conversationShareLink.findUnique = jest.fn<any>().mockRejectedValue(new Error('DB failure'));
    app = await buildApp({ prisma });
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on unexpected DB error', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Language canonicalisation at the write boundary (iteration 219)
// The share-link message-create paths bypass the MessagingService funnel (which
// normalizes `originalLanguage` since iteration 218), so they must canonicalise
// the client-claimed locale themselves before persisting — otherwise a raw
// platform locale (`fr-FR`, `en_US`, `FR`) fragments every downstream consumer
// keyed on `Message.originalLanguage` (NLLB source, translation cache, stats).
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /links/:id/messages — anonymous: originalLanguage canonicalisation', () => {
  it('normalizes a region-tagged locale (fr-FR) to its canonical code (fr) before persisting', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, originalLanguage: 'fr-FR' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'fr' }) })
    );
    await app.close();
  });

  it('keeps an irreducible code (bas) verbatim — no data loss', async () => {
    const prisma = makePrisma();
    const app = await buildApp({ prisma });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, originalLanguage: 'bas' },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ originalLanguage: 'bas' }) })
    );
    await app.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 201 response body contract — what the AUTHOR gets back
//
// The socket payload (asserted above) is what every OTHER participant receives;
// the 201 body is the only thing the author itself sees. The two are built from
// the same message but travel different pipes: the socket emit is raw, while the
// REST body passes through fast-json-stringify, which drops every property the
// response schema does not declare. A field missing from the schema is therefore
// truncated in SILENCE — no error, no log, just an absent key.
// ═══════════════════════════════════════════════════════════════════════════════

const PLACE = { latitude: 48.8566, longitude: 2.3522, name: 'Paris', address: 'Île-de-France', category: 'city' };

function messageBodyOf(res: { json: () => any }): Record<string, any> {
  return res.json().data.message;
}

describe.each([
  {
    label: 'anonymous',
    url: `/links/${MSHY_ID}/messages`,
    headers: ANON_HEADERS,
    prisma: () => makePrisma(),
  },
])('201 body contract — $label route', ({ url, headers, prisma: makeRoutePrisma }) => {
  async function post(messageOverrides: Record<string, unknown> = {}, body: Record<string, unknown> = {}) {
    const prisma = makeRoutePrisma();
    prisma.message.create = jest.fn<any>().mockResolvedValue({ ...mockMessage, ...messageOverrides });
    const app = await buildApp({ prisma });
    const res = await app.inject({ method: 'POST', url, headers, payload: { ...VALID_BODY, ...body } });
    await app.close();
    return res;
  }

  it('routes the message it returns: conversationId and senderId are present', async () => {
    const res = await post();
    expect(res.statusCode).toBe(201);
    expect(messageBodyOf(res).conversationId).toBe(CONV_ID);
    expect(messageBodyOf(res).senderId).toBe(PART_ID);
  });

  it('returns the sender the route resolved, not a nulled placeholder', async () => {
    const res = await post();
    expect(messageBodyOf(res).sender).toMatchObject({ id: PART_ID, displayName: 'anon', type: 'anonymous' });
  });

  it('preserves a shared place instead of dropping it on serialization', async () => {
    const res = await post({ metadata: { location: PLACE } }, { location: PLACE });
    expect(messageBodyOf(res).location).toMatchObject({ latitude: PLACE.latitude, longitude: PLACE.longitude, name: 'Paris' });
  });

  it('preserves the edit / delete / reply envelope the route builds', async () => {
    const res = await post({ isEdited: true, editedAt: new Date('2026-08-07T10:00:00.000Z'), replyToId: MSG_ID });
    const message = messageBodyOf(res);
    expect(message.isEdited).toBe(true);
    expect(message.editedAt).toBe('2026-08-07T10:00:00.000Z');
    expect(message.replyToId).toBe(MSG_ID);
    expect(message.updatedAt).toEqual(expect.any(String));
    expect(message).toHaveProperty('deletedAt', null);
  });

  it('echoes the clientMessageId back to the author, so the optimistic row can be reconciled', async () => {
    const res = await post();
    expect(messageBodyOf(res).clientMessageId).toBe(CID);
  });

  it('withholds the clientMessageId from the other participants, exactly like the nominal path', async () => {
    const socketIOHandler = makeSocketIOHandler(true);
    const app = await buildApp({ prisma: makeRoutePrisma(), socketIOHandler });
    await app.inject({ method: 'POST', url, headers, payload: VALID_BODY });
    await app.close();

    const [, emitted] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    expect(emitted.message).not.toHaveProperty('clientMessageId');
  });

  it('returns the same message the other participants receive over the socket, modulo the clientMessageId', async () => {
    const socketIOHandler = makeSocketIOHandler(true);
    const prisma = makeRoutePrisma();
    const app = await buildApp({ prisma, socketIOHandler });
    const res = await app.inject({ method: 'POST', url, headers, payload: VALID_BODY });
    await app.close();

    const [, emitted] = socketIOHandler.emit.mock.calls[0] as [string, { message: Record<string, unknown> }];
    const { clientMessageId: _authorOnly, ...sharedWithPeers } = messageBodyOf(res);
    expect(sharedWithPeers).toEqual(JSON.parse(JSON.stringify(emitted.message)));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Post-save obligations (cycle 16)
//
// Les deux routes contournent `MessagingService.handleMessage`, donc RIEN d'autre
// n'exécute ce que tout message committé doit à sa conversation. Sans ces effets :
//   • `Message.translations` reste vide À VIE — le Prisme Linguistique est éteint
//     sur le seul transport d'envoi dont dispose un participant anonyme ;
//   • `Conversation.lastMessageAt` reste périmé, donc `GET /conversations`
//     (`orderBy: { lastMessageAt: 'desc' }` + curseur sur ce même champ) redescend
//     au refetch la conversation que le client venait de remonter.
// ═══════════════════════════════════════════════════════════════════════════════

describe.each([
  {
    label: 'anonymous',
    url: `/links/${MSHY_ID}/messages`,
    headers: ANON_HEADERS,
    prisma: () => makePrisma(),
  },
])('post-save obligations — $label route', ({ url, headers, prisma: makeRoutePrisma }) => {
  async function post(opts: { prisma?: any; translationService?: any; body?: Record<string, unknown> } = {}) {
    const prisma = opts.prisma ?? makeRoutePrisma();
    const translationService = opts.translationService ?? makeTranslationService();
    const app = await buildApp({ prisma, translationService });
    const res = await app.inject({ method: 'POST', url, headers, payload: { ...VALID_BODY, ...(opts.body ?? {}) } });
    await flushPostSaveEffects();
    await app.close();
    return { res, prisma, translationService };
  }

  it('remonte la conversation : lastMessageAt est bumpé', async () => {
    const { res, prisma } = await post();
    expect(res.statusCode).toBe(201);
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: CONV_ID },
      data: { lastMessageAt: expect.any(Date) },
    });
  });

  it('pousse le message au translator sous son id persisté', async () => {
    const { translationService } = await post();
    expect(translationService.handleNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: MSG_ID, conversationId: CONV_ID, senderId: PART_ID })
    );
  });

  it('traduit le contenu STOCKÉ (URLs réécrites), pas le corps reçu', async () => {
    mockProcessMessageLinks.mockResolvedValueOnce({
      processedContent: 'Regarde https://mshy.link/t/tok',
      trackingLinks: [],
    });
    const prisma = makeRoutePrisma();
    prisma.message.create = jest.fn<any>().mockResolvedValue({
      ...mockMessage,
      content: 'Regarde https://mshy.link/t/tok',
    });

    const { translationService } = await post({
      prisma,
      body: { content: 'Regarde https://example.com/article' },
    });

    expect(translationService.handleNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Regarde https://mshy.link/t/tok' })
    );
  });

  it('pousse la langue source NORMALISÉE, celle qui est persistée', async () => {
    const { translationService } = await post({ body: { originalLanguage: 'pt-BR' } });
    expect(translationService.handleNewMessage).toHaveBeenCalledWith(
      expect.objectContaining({ originalLanguage: 'pt' })
    );
  });

  it('comptabilise le message dans les statistiques de langue', async () => {
    mockUpdateOnNewMessage.mockClear();
    await post({ body: { originalLanguage: 'de' } });
    expect(mockUpdateOnNewMessage).toHaveBeenCalledWith(expect.anything(), CONV_ID, 'de', expect.any(Function));
  });

  it('rend quand même 201 quand le translator est en panne', async () => {
    const { res, prisma } = await post({
      translationService: { handleNewMessage: jest.fn<any>().mockRejectedValue(new Error('ZMQ down')) },
    });
    expect(res.statusCode).toBe(201);
    expect(prisma.conversation.update).toHaveBeenCalled();
  });

  it('rend quand même 201 quand le bump de conversation échoue', async () => {
    const prisma = makeRoutePrisma();
    prisma.conversation.update = jest.fn<any>().mockRejectedValue(new Error('mongo down'));
    const { res, translationService } = await post({ prisma });
    expect(res.statusCode).toBe(201);
    expect(translationService.handleNewMessage).toHaveBeenCalled();
  });

  it('rend quand même 201 quand aucun service de traduction n\'est câblé', async () => {
    const prisma = makeRoutePrisma();
    const app = await buildApp({ prisma, translationService: null });
    const res = await app.inject({ method: 'POST', url, headers, payload: VALID_BODY });
    await flushPostSaveEffects();
    await app.close();

    expect(res.statusCode).toBe(201);
    expect(prisma.conversation.update).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Mentions — `Message.validatedMentions`, lignes `Mention`, notification dédiée
//
// Les deux routes de lien contournent `MessagingService.handleMessage`, donc
// `MessageProcessor` en entier — et `processMentionsInDB` vivait sous DEUX
// niveaux de `private` à l'intérieur. Un `@alice` envoyé par lien ne produisait
// AUCUNE ligne `Mention` (absent de l'inbox `/mentions`), AUCUN
// `validatedMentions` (le web surligne depuis ce champ : le texte restait brut,
// à vie) et AUCUNE notification de mention — le mentionné ne recevait que la
// notification « message régulier », muette pour qui a coché « mentions
// seulement » ou mis la conversation en sourdine.
// ═══════════════════════════════════════════════════════════════════════════════

const MENTION_MESSAGE = { ...mockMessage, content: 'salut @bob' };

function makeMentionPrisma() {
  const prisma = makePrisma();
  prisma.message.create = jest.fn<any>().mockResolvedValue(MENTION_MESSAGE);
  return prisma;
}

describe('POST /links/:id/messages — anonymous: mentions', () => {
  let app: FastifyInstance;
  let prisma: any;
  let mentionService: ReturnType<typeof makeMentionResolver>;
  let notificationService: ReturnType<typeof makeNotificationService>;
  let body: any;

  beforeAll(async () => {
    prisma = makeMentionPrisma();
    mentionService = makeMentionResolver();
    notificationService = makeNotificationService();
    app = await buildApp({
      prisma, mentionService, notificationService,
      socketIOHandler: makeSocketIOHandler(true),
    });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    body = res.json();
    await flushPostSaveEffects();
  });
  afterAll(async () => { await app.close(); });

  it('creates the Mention rows the /mentions inbox reads', () => {
    expect(mentionService.createMentions).toHaveBeenCalledWith(MSG_ID, [PEER_USER_ID]);
  });

  it('persists the validated usernames on the message', () => {
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: MSG_ID },
      data: { validatedMentions: ['bob'] },
    });
  });

  // Le schéma de réponse 201 ne laisse passer que ce qu'il NOMME : un champ
  // ajouté au payload sans l'être au schéma est tronqué sans erreur ni log.
  it('serves the validated mentions back to the author', () => {
    expect(body.data.message.validatedMentions).toEqual(['bob']);
  });

  // La validation compare l'expéditeur aux `Participant.userId` des membres,
  // donc à des `User.id`. Un participant de lien ANONYME n'en possède aucun :
  // `null` dit qu'il n'est aucun des mentionnés. Lui passer son `Participant.id`
  // comparait deux espaces disjoints — une inégalité toujours vraie, donc une
  // règle d'auto-mention qui ne se déclenchait jamais.
  it('validates the mention against the conversation, with no user identity for an anonymous sender', () => {
    expect(mentionService.validateMentionPermissions).toHaveBeenCalledWith(
      CONV_ID, [PEER_USER_ID], null
    );
  });

  // Une mention perce la sourdine ; la notification régulière, non. Le
  // mentionné doit donc quitter l'éventail régulier pour le lot dédié.
  it('notifies the mentioned recipient as a mention, not as a regular message', () => {
    expect(notificationService.createMentionNotificationsBatch).toHaveBeenCalledWith(
      [PEER_USER_ID],
      expect.objectContaining({ conversationId: CONV_ID, messageId: MSG_ID }),
      [PEER_USER_ID]
    );
    expect(notificationService.createMessageNotification).not.toHaveBeenCalled();
  });
});

describe('POST /links/:id/messages — anonymous: a message without @ costs nothing', () => {
  let app: FastifyInstance;
  let prisma: any;
  let mentionService: ReturnType<typeof makeMentionResolver>;

  beforeAll(async () => {
    prisma = makePrisma();
    mentionService = makeMentionResolver();
    app = await buildApp({ prisma, mentionService, socketIOHandler: makeSocketIOHandler(true) });
    await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
  });
  afterAll(async () => { await app.close(); });

  it('skips every mention query when the content carries no @', () => {
    expect(mentionService.extractMentionsWithParticipants).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});

describe('POST /links/:id/messages — anonymous: no mention service wired', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      prisma: makeMentionPrisma(), mentionService: null,
      socketIOHandler: makeSocketIOHandler(true),
    });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 201, with an empty mention set', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
    expect(res.statusCode).toBe(201);
    expect(res.json().data.message.validatedMentions).toEqual([]);
  });
});

describe('POST /links/:id/messages — anonymous: mention failures never reach the sender', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({
      prisma: makeMentionPrisma(),
      mentionService: makeMentionResolver({
        resolveUsernames: jest.fn<any>().mockRejectedValue(new Error('mongo down')),
      }),
      socketIOHandler: makeSocketIOHandler(true),
    });
  });
  afterAll(async () => { await app.close(); });

  it('still returns 201 when mention resolution throws', async () => {
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await flushPostSaveEffects();
    expect(res.statusCode).toBe(201);
    expect(res.json().data.message.validatedMentions).toEqual([]);
  });
});

