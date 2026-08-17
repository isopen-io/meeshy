/**
 * Route tests — la QUATRIÈME porte des accusés de lecture disait « lu » sans
 * demander la permission, et sans prévenir l'acteur.
 *
 * `POST /messages/:messageId/status` (routes/messages.ts) est le dernier des
 * quatre émetteurs de `read-status:updated`. Les trois autres — les deux routes
 * de `message-read-status.ts` et celle de `conversations/messages.ts` — ont
 * convergé cycle après cycle vers une seule forme. Celui-ci ne l'a jamais
 * rejointe, et il en manque trois pièces :
 *
 *   1. **La préférence `showReadReceipts` n'est jamais consultée.** Les trois
 *      autres portes suppriment la diffusion quand l'acteur a retiré ses
 *      accusés. Celle-ci diffuse un événement NOMINATIF — `participantId`,
 *      `userId`, `type: 'read'`, horodaté — à toute la conversation, quelle que
 *      soit la préférence. Un réglage qui tient à trois portes sur quatre n'est
 *      pas un réglage, c'est un défaut de couverture : il suffit d'entrer par
 *      la quatrième. Que `summary` retire déjà les opt-out de ses compteurs ne
 *      rachète rien — c'est l'identité de l'acteur qui fuit, pas le compteur.
 *
 *   2. **`lastReadAt` / `unreadCount` ne partent nulle part.** Les deux champs
 *      existent pour la synchro MULTI-APPAREILS du curseur de l'acteur, et le
 *      contrat (`ReadStatusUpdatedEventData`) les déclare « présents sur un
 *      `read`, dans la copie ADRESSÉE À L'ACTEUR ». Cette porte n'émet qu'une
 *      copie, celle des pairs : les autres appareils de l'acteur ne recalent
 *      jamais leur curseur. C'est le symétrique exact de la fuite corrigée au
 *      cycle 41 — là-bas les champs allaient à tout le monde, ici à personne.
 *
 *   3. **Le badge ne se remet jamais à zéro.** Aucun `conversation:unread-updated`
 *      n'est émis, alors que c'est de la synchro interne — elle doit partir sur
 *      les DEUX branches de la préférence, y compris quand l'accusé est tu.
 *
 * Ce que ces tests verrouillent, dans l'ordre où ils comptent :
 *   - opt-out ⇒ AUCUN accusé nominatif ne quitte le serveur ;
 *   - opt-out ⇒ le badge de l'acteur se recale quand même ;
 *   - opt-in  ⇒ l'éventail des pairs ne porte pas l'arriéré de l'acteur ;
 *   - opt-in  ⇒ la room personnelle de l'acteur reçoit, elle, la version
 *     complète, et l'éventail l'exclut pour qu'aucun socket n'ait les deux.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { makeChainableIO } from '../../helpers/chainable-io';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439011';
const ACTOR_USER_ID = '507f1f77bcf86cd799439077';
const ACTOR_PARTICIPANT_ID = '507f1f77bcf86cd799439066';
const PEER_USER_ID = '507f1f77bcf86cd799439055';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const ANONYMOUS_PARTICIPANT_ID = '507f1f77bcf86cd799439088';
const UNREAD_COUNT = 7;
const LAST_READ_AT = new Date('2026-08-16T10:00:00.000Z');

/**
 * Le SEUL nom d'accusé de lecture sur le fil. L'alias
 * `message:read-status-updated`, dual-émis du 2026-07-05 au cycle 64, n'a jamais
 * eu de client — voir tasks/socketio-events-cleanup.md § 3.
 */
const READ_STATUS_EVENTS = ['read-status:updated'] as const;

// --- module mocks (le préfixe `mock` est requis par le hoisting de jest) ---

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthContext: { current: Record<string, unknown> } = { current: {} };
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = mockAuthContext.current;
  },
  isRegisteredUser: (ctx: any) => ctx?.type === 'user',
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    deleteAttachment: jest.fn(),
  })),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

jest.mock('../../../validation/messages-schemas', () => ({
  MessageParamsSchema: {},
  AttachmentParamsSchema: {},
  UpdateMessageBodySchema: {},
  MessageStatusBodySchema: {},
  MessageStatusDetailsQuerySchema: {},
  AttachmentStatusBodySchema: {},
}));

const mockShouldShowReadReceipts = jest.fn<any>();
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts,
  })),
}));

const mockGetUnreadCount = jest.fn<any>();
const mockMarkMessagesAsRead = jest.fn<any>();
const mockGetLatestMessageSummary = jest.fn<any>();
const mockRecordMessageLanguageView = jest.fn<any>();
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCount: mockGetUnreadCount,
    markMessagesAsRead: mockMarkMessagesAsRead,
    getLatestMessageSummary: mockGetLatestMessageSummary,
    recordMessageLanguageView: mockRecordMessageLanguageView,
    getConversationReadStatuses: jest.fn<any>().mockResolvedValue(new Map()),
    getMessageStatusDetails: jest.fn<any>().mockResolvedValue({ statuses: [], pagination: {} }),
    getAttachmentStatusDetails: jest.fn<any>().mockResolvedValue({ statuses: [], pagination: {} }),
  })),
}));

import messageRoutes from '../../../routes/messages';

const ACTIVE_PARTICIPANTS = [
  { id: ACTOR_PARTICIPANT_ID, userId: ACTOR_USER_ID },
  { id: PEER_PARTICIPANT_ID, userId: PEER_USER_ID },
  { id: ANONYMOUS_PARTICIPANT_ID, userId: null },
];

/** Le message lu : envoyé par un PAIR, sinon la route refuse (400). */
function readableMessage() {
  return {
    id: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    senderId: PEER_PARTICIPANT_ID,
    deletedAt: null,
    conversation: {
      id: CONVERSATION_ID,
      participants: [{ id: ACTOR_PARTICIPANT_ID, userId: ACTOR_USER_ID }],
    },
  };
}

const mockPrisma: any = {
  message: { findFirst: jest.fn<any>(), findUnique: jest.fn<any>(), update: jest.fn<any>(), updateMany: jest.fn<any>(), findUniqueOrThrow: jest.fn<any>() },
  participant: { findMany: jest.fn<any>(), findFirst: jest.fn<any>() },
  user: { findUnique: jest.fn<any>().mockResolvedValue({ role: 'USER' }) },
  messageAttachment: { findFirst: jest.fn<any>() },
  conversation: { findUnique: jest.fn<any>(), update: jest.fn<any>(), updateMany: jest.fn<any>() },
  trackingLink: { updateMany: jest.fn<any>() },
  conversationReadCursor: { findUnique: jest.fn<any>() },
};

let io: ReturnType<typeof makeChainableIO>;

/** L'émission de l'éventail : celle dont la chaîne compte plus d'une room. */
function fanOutSends() {
  return io._sendsFor('read-status:updated').filter((send) => send.rooms.length > 1);
}

/** L'émission ciblée : la chaîne d'une seule room personnelle. */
function personalSendTo(event: string, room: string) {
  return io._sendsFor(event).find((send) => send.rooms.length === 1 && send.rooms[0] === room);
}

async function markRead(app: FastifyInstance) {
  mockPrisma.message.findFirst.mockResolvedValueOnce(readableMessage());
  return app.inject({
    method: 'POST',
    url: `/messages/${MESSAGE_ID}/status`,
    payload: { status: 'read' },
  });
}

describe('POST /messages/:messageId/status — la quatrième porte des accusés', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', mockPrisma);
    app.decorate('translationService', { retranslateMessageAsync: jest.fn<any>() });
    app.decorate('socketIOHandler', {
      getManager: () => ({ getIO: () => io }),
    } as never);
    await app.register(messageRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    io = makeChainableIO();
    mockShouldShowReadReceipts.mockReset().mockResolvedValue(true);
    mockGetUnreadCount.mockReset().mockResolvedValue(UNREAD_COUNT);
    mockMarkMessagesAsRead.mockReset().mockResolvedValue(undefined);
    mockRecordMessageLanguageView.mockReset().mockResolvedValue(undefined);
    mockGetLatestMessageSummary.mockReset().mockResolvedValue({
      messageId: MESSAGE_ID, totalMembers: 3, deliveredCount: 2, readCount: 1,
    });
    mockPrisma.message.findFirst.mockReset();
    mockPrisma.participant.findMany.mockReset().mockResolvedValue(ACTIVE_PARTICIPANTS);
    mockPrisma.conversationReadCursor.findUnique.mockReset().mockResolvedValue({ lastReadAt: LAST_READ_AT });
    mockAuthContext.current = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ACTOR_USER_ID,
      hasFullAccess: true,
    };
  });

  // ─── 1. La préférence, la pièce manquante la plus grave ────────────────────

  it('ne diffuse AUCUN accusé quand l\'acteur a retiré ses accusés de lecture', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);

    const response = await markRead(app);

    expect(response.statusCode).toBe(200);
    for (const event of READ_STATUS_EVENTS) {
      expect(io._sendsFor(event)).toHaveLength(0);
    }
  });

  it('consulte la préférence de l\'acteur, pas celle d\'un autre', async () => {
    await markRead(app);

    expect(mockShouldShowReadReceipts).toHaveBeenCalledWith(ACTOR_USER_ID, false);
  });

  it('avance quand même le curseur quand l\'accusé est tu — la préférence tait la diffusion, pas la lecture', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);

    const response = await markRead(app);

    expect(response.statusCode).toBe(200);
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(
      ACTOR_PARTICIPANT_ID, CONVERSATION_ID, MESSAGE_ID, expect.any(Object)
    );
  });

  // ─── 2. Le badge : synchro interne, donc sur les DEUX branches ─────────────

  it('recale le badge de l\'acteur même quand l\'accusé est tu', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);

    await markRead(app);

    const badge = personalSendTo('conversation:unread-updated', `user:${ACTOR_USER_ID}`);
    expect(badge?.payload).toEqual({ conversationId: CONVERSATION_ID, unreadCount: UNREAD_COUNT });
  });

  it('recale le badge de l\'acteur avec l\'arriéré RÉEL, pas un zéro écrit en dur', async () => {
    await markRead(app);

    const badge = personalSendTo('conversation:unread-updated', `user:${ACTOR_USER_ID}`);
    expect(badge?.payload).toEqual({ conversationId: CONVERSATION_ID, unreadCount: UNREAD_COUNT });
  });

  // ─── 3. L'arriéré ne concerne que l'acteur ────────────────────────────────

  it('ne diffuse à la conversation NI la frontière de lecture NI l\'arriéré de l\'acteur', async () => {
    await markRead(app);

    const sends = fanOutSends();
    expect(sends.length).toBeGreaterThan(0);
    for (const send of sends) {
      expect(send.payload).not.toHaveProperty('lastReadAt');
      expect(send.payload).not.toHaveProperty('unreadCount');
    }
  });

  it('adresse la version complète à la seule room personnelle de l\'acteur', async () => {
    await markRead(app);

    for (const event of READ_STATUS_EVENTS) {
      const send = personalSendTo(event, `user:${ACTOR_USER_ID}`);
      expect(send?.payload).toMatchObject({
        conversationId: CONVERSATION_ID,
        participantId: ACTOR_PARTICIPANT_ID,
        userId: ACTOR_USER_ID,
        type: 'read',
        lastReadAt: LAST_READ_AT,
        unreadCount: UNREAD_COUNT,
      });
    }
  });

  it('exclut l\'acteur de l\'éventail — sinon la room de conversation lui livre une seconde copie, amputée', async () => {
    await markRead(app);

    for (const event of READ_STATUS_EVENTS) {
      expect(io._exceptsFor(event)).toContain(`user:${ACTOR_USER_ID}`);
    }
  });

  // ─── 4. Non-régressions : ce que la porte faisait déjà bien ────────────────

  it('atteint les pairs sous les DEUX noms d\'événement, résumé compris', async () => {
    await markRead(app);

    for (const event of READ_STATUS_EVENTS) {
      const send = io._sendsFor(event).find((s) => s.rooms.length > 1);
      expect(send?.rooms).toContain(`conversation:${CONVERSATION_ID}`);
      expect(send?.rooms).toContain(`user:${PEER_USER_ID}`);
      expect(send?.payload).toMatchObject({
        conversationId: CONVERSATION_ID,
        participantId: ACTOR_PARTICIPANT_ID,
        type: 'read',
        summary: expect.objectContaining({ readCount: 1 }),
      });
    }
  });

  it('adresse un participant sans compte par son participant id', async () => {
    await markRead(app);

    expect(io._roomsFor('read-status:updated')).toContain(`user:${ANONYMOUS_PARTICIPANT_ID}`);
  });

  it('ne diffuse rien quand aucun manager Socket.IO n\'est disponible', async () => {
    const solo = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    solo.decorate('prisma', mockPrisma);
    solo.decorate('translationService', { retranslateMessageAsync: jest.fn<any>() });
    solo.decorate('socketIOHandler', { getManager: () => null } as never);
    await solo.register(messageRoutes);
    await solo.ready();

    const response = await markRead(solo);

    expect(response.statusCode).toBe(200);
    expect(io._sent).toHaveLength(0);
    await solo.close();
  });
});
