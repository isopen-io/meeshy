/**
 * #10205 — un INVITÉ (session sans compte) ne lit pas la liste NOMINATIVE des
 * destinataires d'un message (`detail=people`) : page après page, elle rendait
 * le roster entier que `GET /participants` lui refuse (audit adversarial du
 * 2026-10-11). 403 ACCOUNT_REQUIRED, avant toute lecture. Un compte garde tout.
 *
 * @jest-environment node
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
    request.authContext = request.headers['x-test-guest']
      ? { userId: VIEWER_PARTICIPANT_ID, participantId: VIEWER_PARTICIPANT_ID, type: 'anonymous', isAuthenticated: true, isAnonymous: true, hasFullAccess: false }
      : { userId: asUser, type: 'user', isAuthenticated: true, isAnonymous: false, hasFullAccess: true, registeredUser: { id: asUser, role: 'USER' } };
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

describe('#10205 — detail=people refusé à un invité', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveConversationId.mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockResolvedValue(true);
    mockPrisma.participant.findFirst.mockResolvedValue({ id: VIEWER_PARTICIPANT_ID, role: 'member' });
    mockPrisma.message.findFirst.mockResolvedValue({ id: MESSAGE_ID });
    mockGetMessageStatusDetails.mockResolvedValue({ statuses: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } });
    mockPrisma.participant.findMany.mockResolvedValue([]);
    mockFilterReadReceiptVisible.mockResolvedValue([]);
  });

  it('répond 403 ACCOUNT_REQUIRED à un invité, sans lire un destinataire', async () => {
    const app = await buildApp();
    const res = await get(app, `detail=people&messageIds=${MESSAGE_ID}`, { 'x-test-guest': '1' });
    await app.close();

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'ACCOUNT_REQUIRED' });
    expect(mockGetMessageStatusDetails).not.toHaveBeenCalled();
  });

  it('un compte Meeshy lit toujours la liste nominative', async () => {
    const app = await buildApp();
    const res = await get(app, `detail=people&messageIds=${MESSAGE_ID}`);
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(mockGetMessageStatusDetails).toHaveBeenCalled();
  });
});
