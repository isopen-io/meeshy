/**
 * #16961 — l'accusé de REMISE d'un message décrit CE message, pas le dernier
 * du fil.
 *
 * `broadcastReadStatus` sait servir un résumé EXACT par message depuis G-5
 * (#7347), et ne le faisait que pour `read` : `receipts.ts` ne lui passait
 * `messageIds` que dans ce cas, et son repli agrégé
 * (`getLatestMessageSummary`) décrit alors le DERNIER message non supprimé de
 * la conversation. L'écriture, elle, était déjà par message — `markFor` boucle
 * sur le lot vetté et appelle `markMessagesAsReceived` message par message pour
 * `delivered`. Seule la DIFFUSION nommait autre chose que ce qu'on venait
 * d'acquitter.
 *
 * Ce que l'expéditeur perdait : son ✓✓ « remis » sur M1 ne bougeait JAMAIS en
 * direct dès que M1 n'était pas le dernier du fil — c'est-à-dire chaque fois que
 * plusieurs messages arrivent pendant que le destinataire est hors ligne. iOS
 * n'applique le résumé qu'à `summary.messageId` (`ConversationSocketHandler`,
 * doc-comment #7433 : « le résumé décrit UN message … et ne touche que lui »),
 * donc le résumé servi n'était pas FAUX — il décrivait correctement le dernier
 * message — il portait le mauvais sujet.
 *
 * PANNE MESURÉE, pas piège armé : le producteur primaire de cet accusé est
 * l'extension de notification iOS, qui poste un reçu PAR push reçu
 * (`MeeshyNotificationExtension/NSEDataSync.swift` →
 * `POST …/messages/:mid/delivery-receipt`, l'adaptateur `type: 'delivered'`).
 *
 * ─── Pourquoi `received` garde son repli agrégé ──────────────────────────────
 *
 * Parce que son ÉCRITURE n'est pas par message. `markFor` le dit : « `received`
 * : toute la conversation, en une passe », un curseur qui avance sur tout le
 * préfixe. Lui servir des résumés pour les seuls ids rapportés décrirait MOINS
 * que ce que l'appel a figé. `messageIds` ne veut donc pas dire « ce que le
 * client a rapporté » mais **« le lot exact que cette écriture a figé »** — et
 * le site qui a composé l'écriture est le seul à le savoir. C'est lui qui
 * remplit le champ ; `broadcastReadStatus` le croit.
 *
 * ─── Le témoin ne peut pas se poser au dernier rang ──────────────────────────
 *
 * Au dernier message du fil, le repli agrégé et la forme juste rendent le MÊME
 * verdict : un témoin posé là ne peut pas tomber (leçon 261). M1 est donc
 * délibérément l'avant-dernier, et `getLatestMessageSummary` rend M_LAST.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const M1 = '507f1f77bcf86cd799439101';
const M_LAST = '507f1f77bcf86cd799439199';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439099';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd799439044';
const USER_ID = 'user-receipts-1';
const READ_STATUS_UPDATED = 'read-status:updated';

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockShouldShowReadReceipts = jest.fn<any>();
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts,
  })),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any, reply: any) => {
    if (!request.headers['authorization']) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
    request.authContext = {
      userId: USER_ID,
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      hasFullAccess: true,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => ({ PrismaClient: jest.fn() }));

const mockMarkMessagesAsRead = jest.fn<any>();
const mockMarkMessagesAsReceived = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();
const mockGetConversationReadStatuses = jest.fn<any>();
const mockGetLatestMessageSummary = jest.fn<any>();

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: mockMarkMessagesAsRead,
    markMessagesAsReceived: mockMarkMessagesAsReceived,
    getUnreadCount: mockGetUnreadCount,
    getConversationReadStatuses: mockGetConversationReadStatuses,
    getLatestMessageSummary: mockGetLatestMessageSummary,
    getMessageStatusDetails: jest.fn<any>(),
    filterReadReceiptVisible: jest.fn<any>(),
    getMessageReadStatus: jest.fn<any>(),
  })),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { conversationReceiptsRoutes } from '../../../routes/conversations/receipts';
import { makeChainableIO } from '../../helpers/chainable-io';

const mockPrisma: any = {
  participant: { findFirst: jest.fn<any>(), findMany: jest.fn<any>(), findUnique: jest.fn<any>() },
  message: { findFirst: jest.fn<any>(), findMany: jest.fn<any>(), findUnique: jest.fn<any>(), count: jest.fn<any>() },
  conversationReadCursor: {
    findUnique: jest.fn<any>(),
    findMany: jest.fn<any>(),
    upsert: jest.fn<any>(),
    update: jest.fn<any>(),
    updateMany: jest.fn<any>(),
  },
};

async function buildApp(): Promise<{ app: FastifyInstance; io: ReturnType<typeof makeChainableIO> }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const io = makeChainableIO();
  app.decorate('prisma', mockPrisma);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) } as unknown);
  await app.register(conversationReceiptsRoutes);
  await app.ready();
  return { app, io };
}

const postReceipt = (app: FastifyInstance, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: `/conversations/${CONVERSATION_ID}/receipts`,
    headers: { authorization: 'Bearer test-token' },
    payload: payload as any,
  });

/** Les diffusions de FIL (plusieurs rooms chaînées), pas la copie personnelle. */
const fanOut = (io: ReturnType<typeof makeChainableIO>) =>
  io._sendsFor(READ_STATUS_UPDATED).filter((s) => s.rooms.length > 1);

beforeEach(() => {
  jest.clearAllMocks();

  mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
  // Les coches sont VISIBLES : sans cela la diffusion de fil court-circuite et
  // le témoin serait vert à vide.
  mockShouldShowReadReceipts.mockResolvedValue(true);

  mockPrisma.participant.findFirst.mockResolvedValue({
    id: PARTICIPANT_ID,
    role: 'member',
    joinedAt: new Date('2020-01-01T00:00:00Z'),
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: null,
    anonymousSession: null,
    user: null,
  });
  mockPrisma.participant.findMany.mockResolvedValue([
    { id: PARTICIPANT_ID, userId: USER_ID },
    { id: PEER_PARTICIPANT_ID, userId: 'peer-user' },
  ]);
  mockPrisma.message.findMany.mockImplementation(async (args: any) =>
    (args?.where?.id?.in ?? []).map((id: string) => ({
      id,
      senderId: SENDER_PARTICIPANT_ID,
      createdAt: new Date('2024-06-01T00:00:00Z'),
    }))
  );
  mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);

  mockMarkMessagesAsReceived.mockResolvedValue(1);
  mockMarkMessagesAsRead.mockResolvedValue(1);
  mockGetUnreadCount.mockResolvedValue(0);

  // Le repli AGRÉGÉ décrit le DERNIER message du fil — jamais celui qu'on
  // vient d'acquitter.
  mockGetLatestMessageSummary.mockResolvedValue({
    messageId: M_LAST,
    totalMembers: 2,
    deliveredCount: 2,
    readCount: 0,
  });
  mockGetConversationReadStatuses.mockImplementation(
    async (_conv: string, ids: string[]) =>
      new Map(ids.map((id) => [id, { totalMembers: 2, receivedCount: 1, readCount: 0, readByAllAt: null }]))
  );
});

describe("#16961 — l'accusé de remise nomme le message acquitté", () => {
  it('`delivered` sur M1, qui N’EST PAS le dernier du fil, diffuse un résumé qui nomme M1', async () => {
    const { app, io } = await buildApp();

    const res = await postReceipt(app, { type: 'delivered', messageIds: [M1] });
    expect(res.statusCode).toBe(200);

    const summaries = fanOut(io).map((s) => s.payload.summary);
    expect(summaries).toEqual([
      { messageId: M1, totalMembers: 2, deliveredCount: 1, readCount: 0, readByAllAt: null },
    ]);

    await app.close();
  });

  it('le résumé est demandé pour le lot EXACT, dans la conversation appelante', async () => {
    const { app, io } = await buildApp();

    await postReceipt(app, { type: 'delivered', messageIds: [M1] });

    expect(mockGetConversationReadStatuses).toHaveBeenCalledWith(CONVERSATION_ID, [M1], null);

    await app.close();
  });

  it('`received` — écriture en UNE passe sur tout le fil — garde son repli agrégé', async () => {
    const { app, io } = await buildApp();

    const res = await postReceipt(app, { type: 'received', messageIds: [M1] });
    expect(res.statusCode).toBe(200);

    // Décision écrite, pas un oubli : servir les seuls ids rapportés décrirait
    // MOINS que ce que `markMessagesAsReceived(participant, conversation)`
    // vient de figer.
    expect(mockGetConversationReadStatuses).not.toHaveBeenCalled();
    expect(fanOut(io).map((s) => s.payload.summary.messageId)).toEqual([M_LAST]);

    await app.close();
  });

  it('`read` garde la forme par message que G-5 lui a donnée', async () => {
    const { app, io } = await buildApp();

    const res = await postReceipt(app, { type: 'read', messageIds: [M1] });
    expect(res.statusCode).toBe(200);

    expect(fanOut(io).map((s) => s.payload.summary.messageId)).toEqual([M1]);

    await app.close();
  });
});
