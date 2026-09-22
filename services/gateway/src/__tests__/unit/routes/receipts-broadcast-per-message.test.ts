/**
 * G-5 (#7347) — « répondre émet l'événement pour l'arriéré figé » (G-8).
 *
 * `applyReceipt` (`routes/conversations/receipts.ts`) connaît, pour un
 * `POST …/receipts {type:'read', messageIds:[...]}`, le lot EXACT vetté par
 * `vetReportedMessages` — les messages RÉELLEMENT figés par
 * `freezeMessageStatus` en mode exact, PAS le lot brut rapporté (qui peut
 * contenir les propres messages de l'appelant, écartés par la garde
 * d'appartenance). Ce fichier fige que CE lot, et rien d'autre, atteint
 * `broadcastReadStatus`, qui en tire UN `read-status:updated` PAR message.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { conversationReceiptsRoutes } from '../../../routes/conversations/receipts';
import { makeChainableIO } from '../../helpers/chainable-io';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439099';
const USER_ID = 'user-receipts-broadcast-1';
const M1 = '507f1f77bcf86cd799439101';
const M2 = '507f1f77bcf86cd799439102';
const M3 = '507f1f77bcf86cd799439103';
const OWN_MESSAGE_ID = '507f1f77bcf86cd799439104';
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
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = {
      userId: USER_ID,
      type: 'registered',
      isAnonymous: false,
      hasFullAccess: true,
    };
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => ({ PrismaClient: jest.fn() }));

const mockMarkMessagesAsRead = jest.fn<any>();
const mockGetUnreadCount = jest.fn<any>();
const mockGetConversationReadStatuses = jest.fn<any>();
const mockGetLatestMessageSummary = jest.fn<any>();

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    markMessagesAsRead: mockMarkMessagesAsRead,
    markMessagesAsReceived: jest.fn(),
    getUnreadCount: mockGetUnreadCount,
    getConversationReadStatuses: mockGetConversationReadStatuses,
    getMessageStatusDetails: jest.fn(),
    filterReadReceiptVisible: jest.fn(async (rows: any[]) => rows),
    getLatestMessageSummary: mockGetLatestMessageSummary,
    getMessageReadStatus: jest.fn(),
  })),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const messageRow = (id: string, senderId = SENDER_PARTICIPANT_ID) => ({
  id,
  senderId,
  createdAt: new Date('2024-06-01T00:00:00Z'),
});

const mockPrisma: any = {
  participant: {
    findFirst: jest.fn<any>().mockResolvedValue({
      id: PARTICIPANT_ID,
      role: 'member',
      joinedAt: new Date('2020-01-01T00:00:00Z'),
      shareLinkId: null,
      historyVisibleFrom: null,
      permissions: null,
      anonymousSession: null,
      user: null,
    }),
    findMany: jest.fn<any>().mockResolvedValue([
      { id: PARTICIPANT_ID, userId: USER_ID },
      { id: SENDER_PARTICIPANT_ID, userId: 'peer-user-1' },
    ]),
  },
  message: {
    findMany: jest.fn<any>().mockImplementation(async (args: any) =>
      (args?.where?.id?.in ?? []).map((id: string) => messageRow(id))
    ),
    findFirst: jest.fn<any>(),
  },
  conversationReadCursor: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
  },
};

let io: ReturnType<typeof makeChainableIO>;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', mockPrisma);
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) } as never);
  await app.register(conversationReceiptsRoutes);
  await app.ready();
  return app;
}

const postReceipt = (app: FastifyInstance, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: `/conversations/${CONVERSATION_ID}/receipts`,
    headers: { authorization: 'Bearer test-token' },
    payload: payload as any,
  });

describe('applyReceipt → broadcastReadStatus — le lot FIGÉ, pas le lot RAPPORTÉ (G-5/#7347, G-8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    io = makeChainableIO();
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(true);
    mockMarkMessagesAsRead.mockResolvedValue(3);
    mockGetUnreadCount.mockResolvedValue(0);
    mockGetLatestMessageSummary.mockResolvedValue({ totalMembers: 1, deliveredCount: 1, readCount: 1 });
    mockGetConversationReadStatuses.mockResolvedValue(
      new Map([
        [M1, { totalMembers: 1, receivedCount: 1, readCount: 1, readByAllAt: null }],
        [M2, { totalMembers: 1, receivedCount: 1, readCount: 1, readByAllAt: null }],
        [M3, { totalMembers: 1, receivedCount: 1, readCount: 1, readByAllAt: null }],
      ])
    );
  });

  it('transmet le lot VETTÉ (targeted) à `getConversationReadStatuses`, jamais le lot brut rapporté', async () => {
    const app = await buildApp();

    const response = await postReceipt(app, { type: 'read', messageIds: [M1, M2, M3] });

    expect(response.statusCode).toBe(200);
    expect(mockGetConversationReadStatuses).toHaveBeenCalledWith(CONVERSATION_ID, [M1, M2, M3], null);
  });

  it('émet TROIS `read-status:updated`, un par message figé — une rafale M1 M2 M3 lue', async () => {
    const app = await buildApp();

    await postReceipt(app, { type: 'read', messageIds: [M1, M2, M3] });

    const fanOut = io._sendsFor(READ_STATUS_UPDATED).filter((s) => s.rooms.length > 1);
    expect(fanOut).toHaveLength(3);
    expect((fanOut as any[]).map((s) => s.payload.summary.messageId)).toEqual([M1, M2, M3]);
  });

  it("écarte le propre message de l'appelant du lot transmis — un accusé de soi à soi n'émet rien pour lui", async () => {
    const app = await buildApp();
    mockPrisma.message.findMany.mockImplementation(async (args: any) =>
      (args?.where?.id?.in ?? []).map((id: string) =>
        id === OWN_MESSAGE_ID ? messageRow(id, PARTICIPANT_ID) : messageRow(id)
      )
    );

    await postReceipt(app, { type: 'read', messageIds: [M1, OWN_MESSAGE_ID] });

    expect(mockGetConversationReadStatuses).toHaveBeenCalledWith(CONVERSATION_ID, [M1], null);
  });

  it("ne passe AUCUN messageId à `broadcastReadStatus` pour un accusé de RÉCEPTION global — repli agrégé intact", async () => {
    const app = await buildApp();

    await postReceipt(app, { type: 'received' });

    expect(mockGetConversationReadStatuses).not.toHaveBeenCalled();
    expect(mockGetLatestMessageSummary).toHaveBeenCalledWith(CONVERSATION_ID);
  });
});
