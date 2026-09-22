/**
 * Issue #7358 — G9 — Dettes des accusés gateway
 *
 * readDevice ne doit pas être servi pour les autres membres.
 * Il ne devrait être servi que pour le viewer lui-même (#7358).
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { conversationReceiptsRoutes } from '../../../routes/conversations/receipts';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const VIEWER_PARTICIPANT_ID = '507f1f77bcf86cd799439011';
const ALICE_PARTICIPANT_ID = '507f1f77bcf86cd799439021';
const BOB_PARTICIPANT_ID = '507f1f77bcf86cd799439022';
const USER_ID = 'user-receipts-test';

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
    const asUser = (request.headers['x-test-user-id'] as string) ?? USER_ID;
    request.authContext = {
      userId: asUser,
      type: 'registered',
      isAnonymous: false,
      hasFullAccess: true,
    };
  },
}));

jest.mock('@meeshy/shared/prisma/client', () => ({ PrismaClient: jest.fn() }));

const mockGetMessageStatusDetails = jest.fn<any>();
const mockFilterReadReceiptVisible = jest.fn<any>();

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageStatusDetails: mockGetMessageStatusDetails,
    filterReadReceiptVisible: mockFilterReadReceiptVisible,
  })),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const mockPrisma: any = {
  participant: { findFirst: jest.fn<any>(), findMany: jest.fn<any>() },
  message: { findFirst: jest.fn<any>(), findMany: jest.fn<any>() },
  conversationReadCursor: { findFirst: jest.fn<any>() },
};

const AUTH = { authorization: 'Bearer test-token' };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', mockPrisma);
  await app.register(conversationReceiptsRoutes);
  await app.ready();
  return app;
}

const get = (app: FastifyInstance, query: string, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'GET',
    url: `/conversations/${CONVERSATION_ID}/receipts?${query}`,
    headers: { ...AUTH, ...headers },
  });

describe('Conversation Receipts — readDevice privacy (#7358)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(true);
    mockPrisma.participant.findFirst.mockResolvedValue({
      id: VIEWER_PARTICIPANT_ID,
      role: 'member',
    });
  });

  it('serves readDevice only for the viewer, null for other participants', async () => {
    // Setup: message exists and belongs to the conversation
    mockPrisma.message.findFirst.mockResolvedValue({ id: MESSAGE_ID });

    // Setup: three participants with readDevice info
    // - Viewer (VIEWER_PARTICIPANT_ID) has readDevice 'ios'
    // - Alice (ALICE_PARTICIPANT_ID) has readDevice 'web'
    // - Bob (BOB_PARTICIPANT_ID) has readDevice 'android'
    mockGetMessageStatusDetails.mockResolvedValue({
      statuses: [
        {
          participantId: VIEWER_PARTICIPANT_ID,
          displayName: 'Viewer',
          avatar: null,
          deliveredAt: new Date('2025-01-01T10:00:00Z'),
          receivedAt: new Date('2025-01-01T10:05:00Z'),
          readAt: new Date('2025-01-01T10:10:00Z'),
          readDevice: 'ios', // Viewer's device
        },
        {
          participantId: ALICE_PARTICIPANT_ID,
          displayName: 'Alice',
          avatar: null,
          deliveredAt: new Date('2025-01-01T10:00:00Z'),
          receivedAt: new Date('2025-01-01T10:05:00Z'),
          readAt: new Date('2025-01-01T10:10:00Z'),
          readDevice: 'web', // Should be masked
        },
        {
          participantId: BOB_PARTICIPANT_ID,
          displayName: 'Bob',
          avatar: null,
          deliveredAt: new Date('2025-01-01T10:00:00Z'),
          receivedAt: new Date('2025-01-01T10:05:00Z'),
          readAt: new Date('2025-01-01T10:11:00Z'),
          readDevice: 'android', // Should be masked
        },
      ],
      pagination: { total: 3, limit: 20, offset: 0, hasMore: false },
    });

    // Setup: all participants are visible
    mockPrisma.participant.findMany.mockResolvedValue([
      { id: VIEWER_PARTICIPANT_ID, userId: USER_ID },
      { id: ALICE_PARTICIPANT_ID, userId: 'user-alice' },
      { id: BOB_PARTICIPANT_ID, userId: 'user-bob' },
    ]);
    mockFilterReadReceiptVisible.mockResolvedValue([
      { id: VIEWER_PARTICIPANT_ID },
      { id: ALICE_PARTICIPANT_ID },
      { id: BOB_PARTICIPANT_ID },
    ]);

    const app = await buildApp();
    const response = await get(app, `messageIds=${MESSAGE_ID}&detail=people`);

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.detail).toBe('people');
    expect(data.people).toHaveLength(3);

    // Viewer's readDevice is served
    const viewerRow = data.people.find((p: any) => p.participantId === VIEWER_PARTICIPANT_ID);
    expect(viewerRow.readDevice).toBe('ios');

    // Other participants' readDevice is masked (null)
    const aliceRow = data.people.find((p: any) => p.participantId === ALICE_PARTICIPANT_ID);
    expect(aliceRow.readDevice).toBeNull();

    const bobRow = data.people.find((p: any) => p.participantId === BOB_PARTICIPANT_ID);
    expect(bobRow.readDevice).toBeNull();
  });

  it('respects readDevice null when viewer has no device info', async () => {
    mockPrisma.message.findFirst.mockResolvedValue({ id: MESSAGE_ID });

    mockGetMessageStatusDetails.mockResolvedValue({
      statuses: [
        {
          participantId: VIEWER_PARTICIPANT_ID,
          displayName: 'Viewer',
          avatar: null,
          deliveredAt: new Date('2025-01-01T10:00:00Z'),
          receivedAt: new Date('2025-01-01T10:05:00Z'),
          readAt: new Date('2025-01-01T10:10:00Z'),
          readDevice: null, // Viewer has no device info
        },
      ],
      pagination: { total: 1, limit: 20, offset: 0, hasMore: false },
    });

    mockPrisma.participant.findMany.mockResolvedValue([
      { id: VIEWER_PARTICIPANT_ID, userId: USER_ID },
    ]);
    mockFilterReadReceiptVisible.mockResolvedValue([
      { id: VIEWER_PARTICIPANT_ID },
    ]);

    const app = await buildApp();
    const response = await get(app, `messageIds=${MESSAGE_ID}&detail=people`);

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    const viewerRow = data.people[0];

    // Viewer's readDevice is still served, even if null
    expect(viewerRow.readDevice).toBeNull();
  });
});
