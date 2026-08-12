import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

const mockCreateUnifiedAuth = jest.fn<any>().mockReturnValue(jest.fn<any>());
const mockRegisterCore = jest.fn<any>();
const mockRegisterMessages = jest.fn<any>();
const mockRegisterMessagesAdvanced = jest.fn<any>();
const mockRegisterParticipants = jest.fn<any>();
const mockRegisterSharing = jest.fn<any>();
const mockRegisterSearch = jest.fn<any>();
const mockRegisterLeave = jest.fn<any>();
const mockRegisterDeleteForMe = jest.fn<any>();
const mockRegisterBan = jest.fn<any>();
const mockRegisterStats = jest.fn<any>();
const mockRegisterThreads = jest.fn<any>();

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (...args: any[]) => mockCreateUnifiedAuth(...args),
}));

jest.mock('../../../routes/conversations/core', () => ({
  registerCoreRoutes: (...args: any[]) => mockRegisterCore(...args),
}));

jest.mock('../../../routes/conversations/messages', () => ({
  registerMessagesRoutes: (...args: any[]) => mockRegisterMessages(...args),
}));

jest.mock('../../../routes/conversations/messages-advanced', () => ({
  registerMessagesAdvancedRoutes: (...args: any[]) => mockRegisterMessagesAdvanced(...args),
}));

jest.mock('../../../routes/conversations/participants', () => ({
  registerParticipantsRoutes: (...args: any[]) => mockRegisterParticipants(...args),
}));

jest.mock('../../../routes/conversations/sharing', () => ({
  registerSharingRoutes: (...args: any[]) => mockRegisterSharing(...args),
}));

jest.mock('../../../routes/conversations/search', () => ({
  registerSearchRoutes: (...args: any[]) => mockRegisterSearch(...args),
}));

jest.mock('../../../routes/conversations/leave', () => ({
  registerLeaveRoutes: (...args: any[]) => mockRegisterLeave(...args),
}));

jest.mock('../../../routes/conversations/delete-for-me', () => ({
  registerDeleteForMeRoutes: (...args: any[]) => mockRegisterDeleteForMe(...args),
}));

jest.mock('../../../routes/conversations/ban', () => ({
  registerBanRoutes: (...args: any[]) => mockRegisterBan(...args),
}));

jest.mock('../../../routes/conversations/stats', () => ({
  registerStatsRoutes: (...args: any[]) => mockRegisterStats(...args),
}));

jest.mock('../../../routes/conversations/threads', () => ({
  registerThreadsRoutes: (...args: any[]) => mockRegisterThreads(...args),
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn<any>(),
}));

// ─── Import SUT (after all mocks) ─────────────────────────────────────────────

import { conversationRoutes } from '../../../routes/conversations/index';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_PRISMA = { user: { findFirst: jest.fn<any>() } } as any;
const MOCK_TRANSLATION_SERVICE = {} as any;

function createMockFastify(prisma = MOCK_PRISMA, translationService = MOCK_TRANSLATION_SERVICE) {
  return {
    prisma,
    translationService,
    get: jest.fn<any>(),
    post: jest.fn<any>(),
    delete: jest.fn<any>(),
    patch: jest.fn<any>(),
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('conversationRoutes (index.ts)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateUnifiedAuth.mockReturnValue(jest.fn<any>());
  });

  it('calls createUnifiedAuthMiddleware twice — optionalAuth and requiredAuth', async () => {
    const fastify = createMockFastify();
    await conversationRoutes(fastify);

    expect(mockCreateUnifiedAuth).toHaveBeenCalledTimes(2);
    expect(mockCreateUnifiedAuth).toHaveBeenNthCalledWith(
      1,
      MOCK_PRISMA,
      { requireAuth: false, allowAnonymous: true }
    );
    expect(mockCreateUnifiedAuth).toHaveBeenNthCalledWith(
      2,
      MOCK_PRISMA,
      { requireAuth: true, allowAnonymous: false }
    );
  });

  it('calls all 11 route registration functions', async () => {
    const fastify = createMockFastify();
    await conversationRoutes(fastify);

    expect(mockRegisterCore).toHaveBeenCalledTimes(1);
    expect(mockRegisterMessages).toHaveBeenCalledTimes(1);
    expect(mockRegisterMessagesAdvanced).toHaveBeenCalledTimes(1);
    expect(mockRegisterParticipants).toHaveBeenCalledTimes(1);
    expect(mockRegisterSharing).toHaveBeenCalledTimes(1);
    expect(mockRegisterSearch).toHaveBeenCalledTimes(1);
    expect(mockRegisterLeave).toHaveBeenCalledTimes(1);
    expect(mockRegisterDeleteForMe).toHaveBeenCalledTimes(1);
    expect(mockRegisterBan).toHaveBeenCalledTimes(1);
    expect(mockRegisterStats).toHaveBeenCalledTimes(1);
    expect(mockRegisterThreads).toHaveBeenCalledTimes(1);
  });

  it('passes fastify and prisma to each register function', async () => {
    const fastify = createMockFastify();
    await conversationRoutes(fastify);

    const [optionalAuth, requiredAuth] = mockCreateUnifiedAuth.mock.results.map(
      (r: any) => r.value
    );

    expect(mockRegisterCore).toHaveBeenCalledWith(fastify, MOCK_PRISMA, optionalAuth, requiredAuth);
    expect(mockRegisterParticipants).toHaveBeenCalledWith(fastify, MOCK_PRISMA, optionalAuth, requiredAuth);
    expect(mockRegisterSharing).toHaveBeenCalledWith(fastify, MOCK_PRISMA, optionalAuth, requiredAuth);
    expect(mockRegisterLeave).toHaveBeenCalledWith(fastify, MOCK_PRISMA, optionalAuth, requiredAuth);
    expect(mockRegisterDeleteForMe).toHaveBeenCalledWith(fastify, MOCK_PRISMA, optionalAuth, requiredAuth);
    expect(mockRegisterBan).toHaveBeenCalledWith(fastify, MOCK_PRISMA, optionalAuth, requiredAuth);
    expect(mockRegisterSearch).toHaveBeenCalledWith(fastify, MOCK_PRISMA, requiredAuth);
    expect(mockRegisterStats).toHaveBeenCalledWith(fastify, MOCK_PRISMA, requiredAuth);
    expect(mockRegisterThreads).toHaveBeenCalledWith(fastify, MOCK_PRISMA, requiredAuth);
  });

  it('passes translationService to messages routes', async () => {
    const fastify = createMockFastify();
    await conversationRoutes(fastify);

    const [optionalAuth, requiredAuth] = mockCreateUnifiedAuth.mock.results.map(
      (r: any) => r.value
    );

    expect(mockRegisterMessages).toHaveBeenCalledWith(
      fastify, MOCK_PRISMA, MOCK_TRANSLATION_SERVICE, optionalAuth, requiredAuth
    );
    expect(mockRegisterMessagesAdvanced).toHaveBeenCalledWith(
      fastify, MOCK_PRISMA, MOCK_TRANSLATION_SERVICE, optionalAuth, requiredAuth
    );
  });
});
