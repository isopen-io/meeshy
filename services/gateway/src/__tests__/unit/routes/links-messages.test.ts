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
 * L'échafaudage partagé vit dans `links-messages.harness.ts` ; les mentions,
 * dans `links-messages-mentions.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// ─── Mocks — hissés au sommet de CE module, donc déclarés ici ────────────────

jest.mock('../../../utils/logger', () => require('./links-messages.harness').loggerModule());
jest.mock('../../../utils/session-token', () => require('./links-messages.harness').sessionTokenModule());
jest.mock('../../../services/TrackingLinkService', () =>
  require('./links-messages.harness').trackingLinkServiceModule()
);
jest.mock('../../../middleware/auth', () => require('./links-messages.harness').authModule());
jest.mock('@meeshy/shared/types/api-schemas', () => require('./links-messages.harness').apiSchemasModule());
jest.mock('@meeshy/shared/types/socketio-events', () =>
  require('./links-messages.harness').socketioEventsModule()
);
jest.mock('../../../services/ConversationStatsService', () =>
  require('./links-messages.harness').conversationStatsModule()
);
jest.mock('../../../routes/links/types', () =>
  require('./links-messages.harness').linkTypesModule(
    jest.requireActual('../../../routes/links/types') as Record<string, unknown>
  )
);

// ─── Import après les mocks ──────────────────────────────────────────────────

import {
  mockProcessExplicitLinksInContent,
  mockCollectContentTrackingLinks,
  mockUpdateTrackingLinksMessageId,
  mockUpdateOnNewMessage,
  mockParse,
  MSHY_ID,
  DB_ID,
  CONV_ID,
  PART_ID,
  LINK_DB_ID,
  MSG_ID,
  PEER_USER_ID,
  mockShareLink,
  mockParticipantShareLink,
  mockAnonParticipant,
  CID,
  mockMessage,
  makePrisma,
  makeNotificationService,
  makeTranslationService,
  makeSocketIOHandler,
  buildApp,
  flushPostSaveEffects,
  VALID_BODY,
  ANON_HEADERS,
} from './links-messages.harness';

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

  it('stores the raw address untouched and its token in metadata.trackingLinks', async () => {
    mockCollectContentTrackingLinks.mockResolvedValueOnce([
      { url: 'https://example.com/a', token: 'tok-1' },
    ]);
    const prisma = makePrisma();
    const linkApp = await buildApp({ prisma });
    const res = await linkApp.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, content: 'Vois https://example.com/a' },
    });
    await linkApp.close();
    expect(res.statusCode).toBe(201);
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        content: 'Vois https://example.com/a',
        metadata: { trackingLinks: [{ url: 'https://example.com/a', token: 'tok-1' }] },
      }),
    }));
    expect(mockUpdateTrackingLinksMessageId).toHaveBeenCalledWith(['tok-1'], MSG_ID);
    expect(res.json().data.message.trackingLinks).toEqual([{ url: 'https://example.com/a', token: 'tok-1' }]);
  });

  it('collects the map from the content as stored, after the explicit <url> rewrite', async () => {
    mockProcessExplicitLinksInContent.mockResolvedValueOnce({ processedContent: 'Vois m+abc', trackingLinks: [] });
    const res = await app.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: { ...VALID_BODY, content: 'Vois <https://example.com/a>' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCollectContentTrackingLinks).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Vois m+abc' })
    );
  });

  it('writes no trackingLinks key when the content carries no address', async () => {
    const prisma = makePrisma();
    const linkApp = await buildApp({ prisma });
    await linkApp.inject({
      method: 'POST', url: `/links/${MSHY_ID}/messages`,
      headers: ANON_HEADERS, payload: VALID_BODY,
    });
    await linkApp.close();
    const data = (prisma.message.create as jest.Mock<any>).mock.calls[0][0].data;
    expect(data.metadata?.trackingLinks).toBeUndefined();
    expect(mockUpdateTrackingLinksMessageId).not.toHaveBeenCalledWith([], expect.anything());
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

  it('traduit le contenu STOCKÉ (<url> réécrite), pas le corps reçu', async () => {
    mockProcessExplicitLinksInContent.mockResolvedValueOnce({
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
      body: { content: 'Regarde <https://example.com/article>' },
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
