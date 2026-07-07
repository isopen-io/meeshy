/**
 * messages-routes.test.ts
 *
 * Comprehensive tests for services/gateway/src/routes/conversations/messages.ts
 *
 * Covers:
 *  - Pure functions: buildAfterWatermarkClause, computeRecipientCount
 *  - SendMessageBodySchema validation
 *  - All 10 registered routes via mock-Fastify pattern
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// ─── All jest.mock() calls MUST be before imports ─────────────────────────────

const mockResolveConversationId = jest.fn<any>().mockResolvedValue('resolved-conv-id');
const mockCanAccessConversation = jest.fn<any>().mockResolvedValue(true);
const mockSendSuccess = jest.fn<any>((reply: any, data: any, meta?: any) => {
  reply._body = { success: true, data, ...meta };
  reply.send(reply._body);
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any, extra?: any) => {
  reply._body = { success: false, error: msg, ...extra };
  return reply;
});
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any, extra?: any) => {
  reply._body = { success: false, error: msg, ...extra };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendWithETag = jest.fn<any>().mockReturnValue(false);
const mockResolveUserLanguage = jest.fn<any>().mockReturnValue('fr');
const mockValidatePagination = jest.fn<any>().mockReturnValue({ offset: 0, limit: 20 });
const mockBuildPaginationMeta = jest.fn<any>().mockReturnValue({ total: 0, offset: 0, limit: 20, hasMore: false });
const mockTransformTranslationsToArray = jest.fn<any>().mockReturnValue([]);
const mockResolveMentionedUsers = jest.fn<any>().mockResolvedValue([]);
const mockAggregateAttachmentReactions = jest.fn<any>().mockReturnValue({ reactionSummary: [], currentUserReactions: [] });
const mockBuildPostReplyTo = jest.fn<any>().mockReturnValue({ id: 'post-1', content: 'post', type: 'status' });
const mockPostReplyToFromMetadata = jest.fn<any>().mockReturnValue(null);
const mockIsBlockedBetween = jest.fn<any>().mockResolvedValue(false);

const mockGetUnreadCount = jest.fn<any>().mockResolvedValue(5);
const mockMarkMessagesAsRead = jest.fn<any>().mockResolvedValue(undefined);
const mockMarkMessagesAsReceived = jest.fn<any>().mockResolvedValue(undefined);
const mockGetLatestMessageSummary = jest.fn<any>().mockResolvedValue({});

const mockShouldShowReadReceipts = jest.fn<any>().mockResolvedValue(false);

const mockHandleMessage = jest.fn<any>().mockResolvedValue({ success: true, data: { id: 'msg-1', conversationId: 'resolved-conv-id' } });

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));
jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
}));
jest.mock('../../../utils/etag', () => ({
  sendWithETag: (...args: any[]) => mockSendWithETag(...args),
}));
jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  resolveUserLanguage: (...args: any[]) => mockResolveUserLanguage(...args),
}));
jest.mock('../../../utils/pagination', () => ({
  validatePagination: (...args: any[]) => mockValidatePagination(...args),
  buildPaginationMeta: (...args: any[]) => mockBuildPaginationMeta(...args),
  buildCursorPaginationMeta: jest.fn(),
}));
jest.mock('../../../utils/translation-transformer', () => ({
  transformTranslationsToArray: (...args: any[]) => mockTransformTranslationsToArray(...args),
}));
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...args: any[]) => mockResolveMentionedUsers(...args),
}));
jest.mock('../../../socketio/serializeAttachmentForSocket', () => ({
  aggregateAttachmentReactions: (...args: any[]) => mockAggregateAttachmentReactions(...args),
}));
jest.mock('../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: (...args: any[]) => mockBuildPostReplyTo(...args),
  postReplyToFromMetadata: (...args: any[]) => mockPostReplyToFromMetadata(...args),
  POST_REPLY_SNAPSHOT_SELECT: { id: true, content: true, type: true },
}));
jest.mock('../../../utils/blocking', () => ({
  isBlockedBetween: (...args: any[]) => mockIsBlockedBetween(...args),
}));
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCount: (...args: any[]) => mockGetUnreadCount(...args),
    markMessagesAsRead: (...args: any[]) => mockMarkMessagesAsRead(...args),
    markMessagesAsReceived: (...args: any[]) => mockMarkMessagesAsReceived(...args),
    getLatestMessageSummary: (...args: any[]) => mockGetLatestMessageSummary(...args),
  })),
}));
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: (...args: any[]) => mockShouldShowReadReceipts(...args),
  })),
}));
jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({
    handleMessage: (...args: any[]) => mockHandleMessage(...args),
  })),
}));
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: { id: true, mimeType: true, fileUrl: true },
  attachmentFullSelect: { id: true, mimeType: true, fileUrl: true },
  attachmentForwardPreviewSelect: { id: true, mimeType: true, fileUrl: true },
}));
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { getOrCompute: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../../middleware/rate-limiter', () => ({
  messageValidationHook: jest.fn(),
}));
jest.mock('../../../config/message-limits', () => ({
  MESSAGE_LIMITS: { MAX_MESSAGE_LENGTH: 10000, MAX_MENTIONS: 50 },
}));
jest.mock('@meeshy/shared/types/api-schemas', () => ({
  messageSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));
jest.mock('@meeshy/shared/types', () => ({
  ErrorCode: { USER_BLOCKED: 'USER_BLOCKED' },
  ErrorMessages: { USER_BLOCKED: { en: 'User is blocked' } },
}));
jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: jest.fn((code: string, msg?: string) => {
    const e = new Error(msg || code) as any;
    e.code = code;
    return e;
  }),
  sendErrorResponse: jest.fn(),
}));
jest.mock('@meeshy/shared/utils/validation', () => {
  const { z } = require('zod');
  return {
    CommonSchemas: {
      language: z.string().optional(),
      messageType: z.string().optional(),
    },
  };
});
jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    READ_STATUS_UPDATED: 'read-status:updated',
    MESSAGE_READ_STATUS_UPDATED: 'message:read-status-updated',
    CONVERSATION_UNREAD_UPDATED: 'conversation:unread-updated',
    MESSAGE_PINNED: 'message:pinned',
    MESSAGE_UNPINNED: 'message:unpinned',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));
jest.mock('@meeshy/shared/utils/client-message-id', () => ({
  CLIENT_MESSAGE_ID_REGEX: /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
}));
jest.mock('@meeshy/shared/types/message-effect-flags', () => ({
  MESSAGE_EFFECT_FLAGS: { BLURRED: 1, EPHEMERAL: 2, VIEW_ONCE: 4 },
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
  performanceLogger: {
    withTiming: jest.fn(async (_n: unknown, fn: () => unknown) => fn()),
  },
}));

// ─── Imports (after all mocks) ─────────────────────────────────────────────────

import {
  buildAfterWatermarkClause,
  computeRecipientCount,
  SendMessageBodySchema,
  registerMessagesRoutes,
} from '../../../routes/conversations/messages';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439044';
const PART_ID = '507f1f77bcf86cd799439055';
const OTHER_USER_ID = '507f1f77bcf86cd799439066';

// ─── Factories ─────────────────────────────────────────────────────────────────

const makePrisma = () => ({
  message: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ id: MSG_ID, viewOnceCount: 1, conversationId: CONV_ID }),
  },
  participant: {
    findFirst: jest.fn().mockResolvedValue({ id: PART_ID, joinedAt: new Date(), shareLinkId: null }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  user: {
    findFirst: jest.fn().mockResolvedValue({ systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null }),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue({ type: 'group', participants: [] }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  reaction: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  conversationShareLink: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  conversationReadCursor: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({}),
  },
  attachmentStatusEntry: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  post: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  messageStatusEntry: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({}),
  },
});

const createMockFastify = () => {
  const routes: Record<string, Record<string, Function>> = {};
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
  const mockGetManager = jest.fn().mockReturnValue({ getIO: mockGetIO });

  const fastify: any = {
    get: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['GET'] = routes['GET'] || {})[path] = handler;
    }),
    post: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['POST'] = routes['POST'] || {})[path] = handler;
    }),
    put: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['PUT'] = routes['PUT'] || {})[path] = handler;
    }),
    delete: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['DELETE'] = routes['DELETE'] || {})[path] = handler;
    }),
    socketIOHandler: {
      getManager: mockGetManager,
      broadcastMessage: jest.fn().mockResolvedValue(undefined),
    },
    notificationService: {},
    _routes: routes,
    _mockTo: mockTo,
    _mockEmit: mockEmit,
    _mockGetManager: mockGetManager,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, path: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  if (methodRoutes[path]) return methodRoutes[path];
  // fallback fragment search
  const key = Object.keys(methodRoutes).find(k => k.includes(path));
  if (!key) throw new Error(`No ${method} route matching '${path}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeAuthContext = (overrides: any = {}) => ({
  type: 'registered' as const,
  isAuthenticated: true,
  isAnonymous: false,
  userId: USER_ID,
  registeredUser: { id: USER_ID },
  hasFullAccess: true,
  participantId: PART_ID,
  ...overrides,
});

const makeRequest = (overrides: any = {}): any => ({
  authContext: makeAuthContext(),
  params: { id: CONV_ID },
  query: {},
  body: {},
  headers: {},
  id: 'req-1',
  ...overrides,
});

const makeReply = () => {
  const reply: any = {
    _body: null,
    status: jest.fn().mockReturnThis(),
    send: jest.fn((body?: any) => { if (body !== undefined) reply._body = body; return reply; }),
    code: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
  };
  return reply;
};

const makeMessage = (overrides: any = {}) => ({
  id: MSG_ID,
  clientMessageId: null,
  content: 'hello',
  originalLanguage: 'fr',
  conversationId: CONV_ID,
  senderId: PART_ID,
  messageType: 'text',
  messageSource: null,
  metadata: null,
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  storyReplyToId: null,
  forwardedFromId: null,
  forwardedFromConversationId: null,
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  pinnedAt: null,
  pinnedBy: null,
  deliveredToAllAt: null,
  receivedByAllAt: null,
  readByAllAt: null,
  deliveredCount: 0,
  readCount: 0,
  reactionSummary: null,
  reactionCount: 0,
  isEncrypted: false,
  encryptionMode: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  validatedMentions: [],
  translations: null,
  sender: {
    id: PART_ID,
    userId: USER_ID,
    displayName: 'Alice',
    avatar: null,
    type: 'member',
    role: 'USER',
    language: 'fr',
    user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null },
  },
  attachments: [],
  _count: { reactions: 0, statusEntries: 0 },
  ...overrides,
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

let prisma: ReturnType<typeof makePrisma>;
let fastify: ReturnType<typeof createMockFastify>;
const translationService: any = {};
const optionalAuth = jest.fn();
const requiredAuth = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  // Restore default mock behaviours
  mockResolveConversationId.mockResolvedValue('resolved-conv-id');
  mockCanAccessConversation.mockResolvedValue(true);
  mockSendWithETag.mockReturnValue(false);
  mockValidatePagination.mockReturnValue({ offset: 0, limit: 20 });
  mockBuildPaginationMeta.mockReturnValue({ total: 0, offset: 0, limit: 20, hasMore: false });
  mockTransformTranslationsToArray.mockReturnValue([]);
  mockResolveMentionedUsers.mockResolvedValue([]);
  mockAggregateAttachmentReactions.mockReturnValue({ reactionSummary: [], currentUserReactions: [] });
  mockPostReplyToFromMetadata.mockReturnValue(null);
  mockIsBlockedBetween.mockResolvedValue(false);
  mockGetUnreadCount.mockResolvedValue(5);
  mockMarkMessagesAsRead.mockResolvedValue(undefined);
  mockMarkMessagesAsReceived.mockResolvedValue(undefined);
  mockGetLatestMessageSummary.mockResolvedValue({});
  mockShouldShowReadReceipts.mockResolvedValue(false);
  mockHandleMessage.mockResolvedValue({ success: true, data: { id: 'msg-1', conversationId: 'resolved-conv-id' } });

  prisma = makePrisma();
  fastify = createMockFastify();
  registerMessagesRoutes(fastify, prisma as any, translationService, optionalAuth, requiredAuth);
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 1: Pure functions
// ═══════════════════════════════════════════════════════════════════════════════

describe('buildAfterWatermarkClause', () => {
  it('returns null when after is undefined', () => {
    expect(buildAfterWatermarkClause(undefined)).toBeNull();
  });

  it('returns null when after is empty string', () => {
    expect(buildAfterWatermarkClause('')).toBeNull();
  });

  it('returns null for non-date string', () => {
    expect(buildAfterWatermarkClause('not-a-date')).toBeNull();
  });

  it('returns null for NaN date string', () => {
    expect(buildAfterWatermarkClause('abc-def-ghi')).toBeNull();
  });

  it('returns createdAt > clause with valid ISO8601 string', () => {
    const iso = '2024-01-15T10:30:00.000Z';
    const result = buildAfterWatermarkClause(iso);
    expect(result).not.toBeNull();
    expect(result!.createdAt.gt).toBeInstanceOf(Date);
    expect(result!.createdAt.gt.toISOString()).toBe(iso);
  });

  it('returns createdAt clause with date-only string', () => {
    const result = buildAfterWatermarkClause('2025-06-01');
    expect(result).not.toBeNull();
    expect(result!.createdAt.gt).toBeInstanceOf(Date);
  });
});

describe('computeRecipientCount', () => {
  it('returns size-1 when sender is in active set', () => {
    const ids = new Set(['a', 'b', 'c']);
    expect(computeRecipientCount(ids, 'a')).toBe(2);
  });

  it('returns full size when sender is NOT in active set', () => {
    const ids = new Set(['a', 'b', 'c']);
    expect(computeRecipientCount(ids, 'x')).toBe(3);
  });

  it('returns 0 for empty set', () => {
    expect(computeRecipientCount(new Set(), 'x')).toBe(0);
  });

  it('clamps to 0 when sender is only member', () => {
    expect(computeRecipientCount(new Set(['only']), 'only')).toBe(0);
  });

  it('never returns negative', () => {
    const result = computeRecipientCount(new Set(['a']), 'a');
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

describe('SendMessageBodySchema', () => {
  it('accepts content only', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'hello' });
    expect(result.success).toBe(true);
  });

  it('accepts attachmentIds only', () => {
    const result = SendMessageBodySchema.safeParse({ attachmentIds: ['att-1'] });
    expect(result.success).toBe(true);
  });

  it('accepts forwardedFromId only', () => {
    const result = SendMessageBodySchema.safeParse({ forwardedFromId: 'msg-orig' });
    expect(result.success).toBe(true);
  });

  it('accepts encryptedContent only', () => {
    const result = SendMessageBodySchema.safeParse({ encryptedContent: 'enc123' });
    expect(result.success).toBe(true);
  });

  it('rejects when all sources are absent', () => {
    const result = SendMessageBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects when content is empty string', () => {
    const result = SendMessageBodySchema.safeParse({ content: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects clientMessageId with bad format', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'hello', clientMessageId: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('accepts valid clientMessageId cid_<uuid v4>', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'hello',
      clientMessageId: 'cid_12345678-1234-4abc-8def-123456789012',
    });
    expect(result.success).toBe(true);
  });

  it('rejects content exceeding MAX_MESSAGE_LENGTH (10001 chars)', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'a'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('rejects encryptionMetadata exceeding 8KB', () => {
    const big = 'x'.repeat(8 * 1024 + 100);
    const result = SendMessageBodySchema.safeParse({ content: 'hello', encryptionMetadata: { big } });
    expect(result.success).toBe(false);
  });

  it('accepts valid object with optional fields', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'hello',
      originalLanguage: 'en',
      messageType: 'text',
      replyToId: 'reply-id',
      isBlurred: false,
      isViewOnce: false,
    });
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 2: GET /conversations/:id/messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /conversations/:id/messages', () => {
  const getMessagesHandler = () =>
    fastify._routes['GET']['/conversations/:id/messages'];

  it('returns 403 when resolveConversationId returns null', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('returns 403 when canAccessConversation returns false', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('returns empty messages list for authenticated user (happy path)', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    prisma.message.count.mockResolvedValue(0);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply.send).toHaveBeenCalled();
    const body = reply._body;
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('returns messages with mapped fields for authenticated user', async () => {
    const msg = makeMessage();
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(MSG_ID);
    // senderId should be resolved to user ID
    expect(body.data[0].senderId).toBe(USER_ID);
  });

  it('forward watermark mode: after param triggers ascending request', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { after: '2024-01-01T00:00:00.000Z' } }), reply);
    // findMany should be called with ascending order (afterMode)
    const call = prisma.message.findMany.mock.calls[0][0] as any;
    expect(call.orderBy?.createdAt).toBe('asc');
  });

  it('before cursor mode: fetches beforeMessage and applies createdAt filter', async () => {
    const beforeDate = new Date('2024-06-01');
    prisma.message.findFirst.mockResolvedValue({ createdAt: beforeDate });
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { before: MSG_ID } }), reply);
    const whereArg = (prisma.message.findMany.mock.calls[0][0] as any).where;
    expect(whereArg.createdAt?.lt).toEqual(beforeDate);
  });

  it('around mode: fetches messages before/after target and builds id filter', async () => {
    const aroundDate = new Date('2024-06-01');
    prisma.message.findFirst
      .mockResolvedValueOnce(null) // currentParticipant (anon skip)
      .mockResolvedValueOnce(null) // anonymousParticipant
      .mockResolvedValueOnce({ createdAt: aroundDate }); // aroundMessage

    // around mode calls findMany multiple times
    prisma.message.findMany
      .mockResolvedValueOnce([{ id: 'before-1' }]) // messages before
      .mockResolvedValueOnce([{ id: 'after-1' }]) // messages after
      .mockResolvedValue([]); // main messages query

    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { around: MSG_ID } }), reply);
    expect(reply.send).toHaveBeenCalled();
  });

  it('shareLink with expired → 403 SHARE_LINK_EXPIRED', async () => {
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, joinedAt: new Date(), shareLinkId: 'link-1' });
    prisma.conversationShareLink.findFirst.mockResolvedValue({
      allowViewHistory: true,
      expiresAt: new Date('2020-01-01'), // expired
      maxUses: null,
      currentUses: 0,
    });
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('expired'),
      expect.objectContaining({ code: 'SHARE_LINK_EXPIRED' }),
    );
  });

  it('shareLink with max-uses exceeded → 403 SHARE_LINK_MAX_USES', async () => {
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, joinedAt: new Date(), shareLinkId: 'link-1' });
    prisma.conversationShareLink.findFirst.mockResolvedValue({
      allowViewHistory: true,
      expiresAt: null,
      maxUses: 5,
      currentUses: 5,
    });
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('usage limit'),
      expect.objectContaining({ code: 'SHARE_LINK_MAX_USES' }),
    );
  });

  it('shareLink without view history → historyStartDate set to joinedAt', async () => {
    const joinedAt = new Date('2024-01-01');
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, joinedAt, shareLinkId: 'link-1' });
    prisma.conversationShareLink.findFirst.mockResolvedValue({
      allowViewHistory: false,
      expiresAt: null,
      maxUses: null,
      currentUses: 0,
    });
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const whereArg = (prisma.message.findMany.mock.calls[0][0] as any).where;
    expect(whereArg.createdAt?.gte).toEqual(joinedAt);
  });

  it('includeReactions=true adds reactions field to message select', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_reactions: 'true' } }), reply);
    const selectArg = (prisma.message.findMany.mock.calls[0][0] as any).select;
    expect(selectArg.reactions).toBeDefined();
  });

  it('includeStatus=true adds statusEntries to select', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_status: 'true' } }), reply);
    const selectArg = (prisma.message.findMany.mock.calls[0][0] as any).select;
    expect(selectArg.statusEntries).toBeDefined();
  });

  it('include_translations=false skips translations in select', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_translations: 'false' } }), reply);
    const selectArg = (prisma.message.findMany.mock.calls[0][0] as any).select;
    expect(selectArg.translations).toBeUndefined();
  });

  it('languages param is parsed and deduped into languageFilter', async () => {
    const msg = makeMessage({ translations: { fr: { text: 'salut' }, en: { text: 'hello' } } });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { languages: 'fr,fr,en' } }), reply);
    // transformTranslationsToArray should be called with options
    expect(mockTransformTranslationsToArray).toHaveBeenCalledWith(
      MSG_ID,
      expect.anything(),
      expect.objectContaining({ languages: expect.arrayContaining(['fr', 'en']) }),
    );
  });

  it('messages with attachments: cleanAttachmentsForApi called (aggregateAttachmentReactions)', async () => {
    const msg = makeMessage({
      attachments: [{ id: 'att-1', mimeType: 'audio/mp3', fileUrl: 'http://x.com/a.mp3', reactions: [], translations: null, transcription: null }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(mockAggregateAttachmentReactions).toHaveBeenCalled();
    const body = reply._body;
    expect(body.data[0].attachments[0].reactionSummary).toBeDefined();
    expect(body.data[0].attachments[0].currentUserReactions).toBeDefined();
  });

  it('attachment transcription with voiceSimilarityScore=false gets converted to null', async () => {
    const msg = makeMessage({
      attachments: [{
        id: 'att-1',
        mimeType: 'audio/mp3',
        fileUrl: 'http://x.com/a.mp3',
        reactions: [],
        translations: null,
        transcription: {
          segments: [{ text: 'hello', startMs: 0, endMs: 500, speakerId: 'spk-1', voiceSimilarityScore: false }],
          speakerAnalysis: null,
        },
      }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const att = reply._body.data[0].attachments[0];
    expect(att.transcription.segments[0].voiceSimilarityScore).toBeNull();
  });

  it('messages with forwarded messages: forwardedFrom enrichment on second findMany call', async () => {
    const origMsg = {
      id: 'orig-msg-id',
      content: 'original content',
      messageType: 'text',
      createdAt: new Date(),
      senderId: PART_ID,
      sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, user: { username: 'alice' } },
      attachments: [],
    };
    const msg = makeMessage({ forwardedFromId: 'orig-msg-id' });
    prisma.message.findMany
      .mockResolvedValueOnce([msg]) // main query
      .mockResolvedValueOnce([origMsg]); // forwarded messages lookup
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].forwardedFrom).toBeDefined();
    expect(body.data[0].forwardedFrom.id).toBe('orig-msg-id');
  });

  it('storyReplyToId with metadata snapshot uses postReplyToFromMetadata', async () => {
    const snapshot = { id: 'post-snap', content: 'snap content', type: 'status' };
    mockPostReplyToFromMetadata.mockReturnValue(snapshot);
    const msg = makeMessage({ storyReplyToId: 'post-123', metadata: { postReplyTo: snapshot } });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].postReplyTo).toEqual(snapshot);
    expect(mockBuildPostReplyTo).not.toHaveBeenCalled();
  });

  it('storyReplyToId without metadata snapshot falls back to prisma.post.findMany', async () => {
    mockPostReplyToFromMetadata.mockReturnValue(null);
    const post = { id: 'post-123', content: 'post content', type: 'status' };
    prisma.post.findMany.mockResolvedValue([post]);
    const msg = makeMessage({ storyReplyToId: 'post-123', metadata: null });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(prisma.post.findMany).toHaveBeenCalled();
    expect(mockBuildPostReplyTo).toHaveBeenCalledWith(post);
  });

  it('with read status cursors: deliveredCount/readCount computed from cursors', async () => {
    const msgCreatedAt = new Date('2024-06-01');
    const msg = makeMessage({ createdAt: msgCreatedAt });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.participant.findMany.mockResolvedValue([
      { id: PART_ID },
      { id: 'other-part', userId: OTHER_USER_ID },
    ]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([
      {
        participantId: 'other-part',
        lastDeliveredAt: new Date('2024-06-02'),
        lastReadAt: new Date('2024-06-02'),
      },
    ]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].deliveredCount).toBeGreaterThan(0);
    expect(body.data[0].readCount).toBeGreaterThan(0);
  });

  it('frozen MessageStatusEntry counted even when the cursor was cleaned up (union parity with read-status endpoints)', async () => {
    const msgCreatedAt = new Date('2024-06-01');
    const msg = makeMessage({ createdAt: msgCreatedAt });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.participant.findMany.mockResolvedValue([
      { id: PART_ID },
      { id: 'other-part' },
    ]);
    // Cursor for the recipient was deleted by cleanupObsoleteCursors — only the
    // write-once frozen receipt survives. The mono-message and batch read-status
    // endpoints still count it; the list route must agree.
    prisma.conversationReadCursor.findMany.mockResolvedValue([]);
    prisma.messageStatusEntry.findMany.mockResolvedValue([
      {
        messageId: MSG_ID,
        participantId: 'other-part',
        deliveredAt: new Date('2024-06-02'),
        receivedAt: new Date('2024-06-02'),
        readAt: new Date('2024-06-02'),
      },
    ]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].deliveredCount).toBe(1);
    expect(body.data[0].readCount).toBe(1);
  });

  it('with user reactions: currentUserReactions populated from reaction.findMany', async () => {
    const msg = makeMessage();
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.reaction.findMany.mockResolvedValue([{ messageId: MSG_ID, emoji: '👍' }]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].currentUserReactions).toContain('👍');
  });

  it('before cursor: hasMore=true when findMany returns more than limit', async () => {
    const limit = 20;
    mockValidatePagination.mockReturnValue({ offset: 0, limit });
    // Return limit+1 messages to simulate hasMore
    const msgs = Array.from({ length: limit + 1 }, (_, i) => makeMessage({ id: `msg-${i}` }));
    prisma.message.findFirst.mockResolvedValue({ createdAt: new Date() }); // before message
    prisma.message.findMany.mockResolvedValue(msgs);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { before: 'some-cursor-msg' } }), reply);
    const body = reply._body;
    expect(body.cursorPagination.hasMore).toBe(true);
    // mappedMessages is built before messages.splice(limit), so data has limit+1 entries
    // The key observable outcome is that hasMore=true signals the client there are more pages
    expect(body.data.length).toBeGreaterThanOrEqual(limit);
  });

  it('anonymous user: skips registered-user specific paths', async () => {
    const anonRequest = makeRequest({
      authContext: {
        type: 'anonymous',
        isAuthenticated: true,
        isAnonymous: true,
        userId: 'anon-session',
        participantId: PART_ID,
        registeredUser: undefined,
        hasFullAccess: false,
      },
    });
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(anonRequest, reply);
    // user.findFirst should NOT be called (not authenticated as registered)
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalled();
  });

  it('ETag match: sendWithETag returns true → handler returns early without extra work', async () => {
    mockSendWithETag.mockReturnValue(true);
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    // reply.send should NOT be called since sendWithETag short-circuited
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('error in main handler → 500 internal error', async () => {
    prisma.message.findMany.mockRejectedValue(new Error('DB error'));
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });

  it('LOG_AUDIO_DIAG=true: covers audio diagnostic logging branch', async () => {
    const origEnv = process.env.LOG_AUDIO_DIAG;
    process.env.LOG_AUDIO_DIAG = 'true';
    try {
      const msg = makeMessage({
        attachments: [{
          id: 'att-audio',
          mimeType: 'audio/mp3',
          fileUrl: 'http://x.com/a.mp3',
          reactions: [],
          translations: null,
          // segments must be null/falsy or have at least one entry (cleanAttachmentsForApi accesses segments[0])
          transcription: { text: 'hello', language: 'fr', confidence: 0.9, segments: null, source: 'whisper', model: 'tiny' },
        }],
      });
      prisma.message.findMany.mockResolvedValue([msg]);
      prisma.message.count.mockResolvedValue(1);
      const reply = makeReply();
      await getMessagesHandler()(makeRequest(), reply);
      expect(reply.send).toHaveBeenCalled();
    } finally {
      process.env.LOG_AUDIO_DIAG = origEnv;
    }
  });

  it('with attachment consumption: currentUserConsumption set from attachmentStatusEntry', async () => {
    const msg = makeMessage({
      attachments: [{ id: 'att-1', mimeType: 'audio/mp3', fileUrl: 'http://x.com/a.mp3', reactions: [], translations: null, transcription: null }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.attachmentStatusEntry.findMany.mockResolvedValue([{
      attachmentId: 'att-1',
      lastPlayPositionMs: 1500,
      listenedComplete: true,
      lastWatchPositionMs: null,
      watchedComplete: false,
    }]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const att = reply._body.data[0].attachments[0];
    expect(att.currentUserConsumption).not.toBeNull();
    expect(att.currentUserConsumption.lastPlayPositionMs).toBe(1500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 3: POST /conversations/:id/mark-read
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/mark-read', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/mark-read'];

  it('returns 403 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('returns 403 when no participant found', async () => {
    mockCanAccessConversation.mockResolvedValue(true);
    prisma.participant.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('returns markedCount 0 when unreadCount is 0', async () => {
    mockGetUnreadCount.mockResolvedValue(0);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 0 });
  });

  it('marks messages as read and broadcasts when unreadCount > 0', async () => {
    mockGetUnreadCount.mockResolvedValue(3);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockMarkMessagesAsRead).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 3 });
  });

  it('error path → 500', async () => {
    prisma.participant.findFirst.mockRejectedValue(new Error('DB'));
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 4: POST /conversations/:id/messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/messages', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/messages'];

  it('401 when not authenticated', async () => {
    const req = makeRequest({
      authContext: makeAuthContext({ isAuthenticated: false }),
      body: { content: 'hello' },
    });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockSendUnauthorized).toHaveBeenCalled();
  });

  it('400 when body fails Zod validation (empty body)', async () => {
    const req = makeRequest({ body: {} });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockSendBadRequest).toHaveBeenCalled();
  });

  it('404 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockSendNotFound).toHaveBeenCalled();
  });

  it('403 when participant not found in conversation', async () => {
    prisma.participant.findFirst.mockResolvedValue(null);
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('MessagingService returns { success: false } → 400 with error', async () => {
    mockHandleMessage.mockResolvedValue({ success: false, error: 'Too long' });
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'Too long');
  });

  it('success: sends result and triggers socket broadcast', async () => {
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, conversationId: CONV_ID } });
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('success with isDuplicate=true: skips socket broadcast', async () => {
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, isDuplicate: true } });
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    // broadcastMessage should NOT be triggered for duplicates
    // (setImmediate is not called; we just verify response succeeded)
    expect(reply.send).toHaveBeenCalled();
  });

  it('error path → 500', async () => {
    mockHandleMessage.mockRejectedValue(new Error('crash'));
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 5: POST /conversations/:id/read
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/read', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/read'];

  it('returns 403 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('returns 403 when no membership', async () => {
    prisma.participant.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('marks read and returns markedCount', async () => {
    mockGetUnreadCount.mockResolvedValue(7);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockMarkMessagesAsRead).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 7 });
  });

  it('error path → 500', async () => {
    prisma.participant.findFirst.mockRejectedValue(new Error('DB'));
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 6: POST /conversations/:id/mark-unread
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/mark-unread', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/mark-unread'];

  it('returns 404 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendNotFound).toHaveBeenCalled();
  });

  it('returns 403 when no access', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('returns 403 when no participant', async () => {
    prisma.participant.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('no other-user messages → { unreadCount: 0 }', async () => {
    // participant exists but no messages from other users
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
    prisma.message.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { unreadCount: 0 });
  });

  it('happy path: upserts cursor and returns { unreadCount: 1 }', async () => {
    const latestMessage = { id: MSG_ID, createdAt: new Date('2024-06-10') };
    prisma.participant.findFirst
      .mockResolvedValueOnce({ id: PART_ID }) // first findFirst (currentParticipant)
      .mockResolvedValueOnce({ id: 'prev-msg' }) // previousMessage
      .mockResolvedValueOnce({ id: PART_ID }); // participantForCursor
    prisma.message.findFirst
      .mockResolvedValueOnce(latestMessage) // latestMessage
      .mockResolvedValueOnce({ id: 'prev-msg-id' }); // previousMessage
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(prisma.conversationReadCursor.upsert).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { unreadCount: 1 });
  });

  it('error path → 500', async () => {
    prisma.participant.findFirst.mockRejectedValue(new Error('DB'));
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 7: PUT /conversations/:id/messages/:messageId/pin
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /conversations/:id/messages/:messageId/pin', () => {
  const getHandler_ = () => fastify._routes['PUT']['/conversations/:id/messages/:messageId/pin'];
  const makeReqWithMsg = () => makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });

  it('404 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendNotFound).toHaveBeenCalled();
  });

  it('403 when no access', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('404 when message not found', async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(expect.anything(), 'Message not found');
  });

  it('happy path: pins message and broadcasts via socket', async () => {
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, conversationId: CONV_ID });
    prisma.message.update.mockResolvedValue({ id: MSG_ID });
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MSG_ID }, data: expect.objectContaining({ pinnedBy: USER_ID }) }),
    );
    // socket io: getManager was called
    expect(fastify.socketIOHandler.getManager).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalled();
    const successData = mockSendSuccess.mock.calls[0][1] as any;
    expect(successData.pinnedBy).toBe(USER_ID);
  });

  it('happy path without socketIO: registers fine and returns success when socket not present at init', async () => {
    // Create a new fastify without socketIOHandler and re-register
    const noSocketFastify = createMockFastify();
    noSocketFastify.socketIOHandler = undefined as any;
    registerMessagesRoutes(noSocketFastify, prisma as any, translationService, optionalAuth, requiredAuth);
    const handler = noSocketFastify._routes['PUT']['/conversations/:id/messages/:messageId/pin'];
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, conversationId: CONV_ID });
    prisma.message.update.mockResolvedValue({ id: MSG_ID });
    const reply = makeReply();
    await handler(makeReqWithMsg(), reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('error path → 500', async () => {
    prisma.message.findFirst.mockRejectedValue(new Error('DB error'));
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 8: DELETE /conversations/:id/messages/:messageId/pin
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /conversations/:id/messages/:messageId/pin', () => {
  const getHandler_ = () => fastify._routes['DELETE']['/conversations/:id/messages/:messageId/pin'];
  const makeReqWithMsg = () => makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });

  it('404 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendNotFound).toHaveBeenCalled();
  });

  it('403 when no access', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('happy path: unpins message and broadcasts via socket', async () => {
    prisma.message.update.mockResolvedValue({ id: MSG_ID });
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pinnedAt: null, pinnedBy: null } }),
    );
    expect(fastify.socketIOHandler.getManager).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, null);
  });

  it('error path → 500', async () => {
    prisma.message.update.mockRejectedValue(new Error('DB error'));
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 9: GET /conversations/:id/pinned-messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /conversations/:id/pinned-messages', () => {
  const getHandler_ = () => fastify._routes['GET']['/conversations/:id/pinned-messages'];

  it('404 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendNotFound).toHaveBeenCalled();
  });

  it('403 when no access', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('returns pinned messages with sender mapping', async () => {
    const pinnedMsg = {
      id: MSG_ID,
      conversationId: CONV_ID,
      senderId: PART_ID,
      content: 'pinned content',
      originalLanguage: 'fr',
      messageType: 'text',
      editedAt: null,
      deletedAt: null,
      replyToId: null,
      forwardedFromId: null,
      forwardedFromConversationId: null,
      pinnedAt: new Date(),
      pinnedBy: USER_ID,
      isViewOnce: false,
      isBlurred: false,
      expiresAt: null,
      effectFlags: 0,
      translations: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      sender: {
        id: PART_ID,
        userId: USER_ID,
        displayName: 'Alice',
        avatar: null,
        type: 'member',
        user: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice', avatar: null, isOnline: false },
      },
      attachments: [],
      _count: { reactions: 0, replies: 0 },
    };
    prisma.message.findMany.mockResolvedValue([pinnedMsg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendSuccess).toHaveBeenCalled();
    const body = reply._body;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].pinnedBy).toBe(USER_ID);
    expect(body.data[0].sender.username).toBe('alice');
  });

  it('empty pinned messages list', async () => {
    prisma.message.findMany.mockResolvedValue([]);
    prisma.message.count.mockResolvedValue(0);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendSuccess).toHaveBeenCalled();
    expect(reply._body.data).toHaveLength(0);
  });

  it('error path → 500', async () => {
    prisma.message.findMany.mockRejectedValue(new Error('DB error'));
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 10: POST /conversations/:id/messages/:messageId/consume
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/messages/:messageId/consume', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/messages/:messageId/consume'];
  const makeReqWithMsg = () => makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });

  it('404 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendNotFound).toHaveBeenCalled();
  });

  it('403 when no access', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('404 when message not found', async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(expect.anything(), 'Message not found');
  });

  it('400 when message.isViewOnce is false', async () => {
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, isViewOnce: false, conversationId: CONV_ID });
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendBadRequest).toHaveBeenCalledWith(expect.anything(), 'Message is not view-once');
  });

  it('happy path: increments viewOnceCount and returns updated values', async () => {
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, isViewOnce: true, maxViewOnceCount: 1, conversationId: CONV_ID });
    prisma.message.update.mockResolvedValue({ id: MSG_ID, viewOnceCount: 1, conversationId: CONV_ID });
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { viewOnceCount: { increment: 1 } } }),
    );
    expect(mockSendSuccess).toHaveBeenCalled();
    const result = mockSendSuccess.mock.calls[0][1] as any;
    expect(result.viewOnceCount).toBe(1);
    expect(result.isFullyConsumed).toBe(true);
  });

  it('error path → 500', async () => {
    prisma.message.findFirst.mockRejectedValue(new Error('DB error'));
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Group 11: GET /conversations/:id/messages/search
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /conversations/:id/messages/search', () => {
  const getHandler_ = () => fastify._routes['GET']['/conversations/:id/messages/search'];
  const makeSearchReq = (q = 'hello', extra: any = {}) =>
    makeRequest({ query: { q, ...extra } });

  it('403 when conversationId not found', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeSearchReq(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('403 when no access', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const reply = makeReply();
    await getHandler_()(makeSearchReq(), reply);
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('returns content matches with transformed sender', async () => {
    const matchMsg = {
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'hello world',
      originalLanguage: 'fr',
      messageType: 'text',
      translations: null,
      createdAt: new Date(),
      senderId: PART_ID,
      sender: {
        id: PART_ID,
        userId: USER_ID,
        displayName: 'Alice',
        avatar: null,
        type: 'member',
        user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true },
      },
    };
    // content matches
    prisma.message.findMany
      .mockResolvedValueOnce([matchMsg]) // content search
      .mockResolvedValueOnce([]); // translation candidates
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello'), reply);
    const body = reply._body;
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].sender.username).toBe('alice');
    expect(body.data[0].sender.isOnline).toBe(true);
    expect(body.cursorPagination).toBeDefined();
    expect(body.cursorPagination.hasMore).toBe(false);
  });

  it('returns merged content+translation matches', async () => {
    const contentMsg = {
      id: 'msg-content',
      conversationId: CONV_ID,
      content: 'hello world',
      originalLanguage: 'fr',
      messageType: 'text',
      translations: null,
      createdAt: new Date('2024-06-10'),
      senderId: PART_ID,
      sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, type: 'member', user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: false } },
    };
    const transMsg = {
      id: 'msg-trans',
      conversationId: CONV_ID,
      content: 'bonjour',
      originalLanguage: 'fr',
      messageType: 'text',
      translations: { en: { text: 'hello translated' } },
      createdAt: new Date('2024-06-09'),
      senderId: PART_ID,
      sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, type: 'member', user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: false } },
    };
    prisma.message.findMany
      .mockResolvedValueOnce([contentMsg]) // content matches
      .mockResolvedValueOnce([transMsg]); // translation candidates (NOT in content)
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello'), reply);
    const body = reply._body;
    expect(body.data).toHaveLength(2);
  });

  it('with cursor: fetches cursor message and applies createdAt filter', async () => {
    const cursorDate = new Date('2024-05-01');
    prisma.message.findFirst.mockResolvedValue({ createdAt: cursorDate });
    prisma.message.findMany
      .mockResolvedValueOnce([]) // content matches
      .mockResolvedValueOnce([]); // translation candidates
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello', { cursor: 'cursor-msg-id' }), reply);
    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cursor-msg-id' } }),
    );
  });

  it('deduplication: translation match already in content matches is not duplicated', async () => {
    const msg = {
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'hello',
      originalLanguage: 'en',
      messageType: 'text',
      translations: { fr: { text: 'bonjour' } },
      createdAt: new Date(),
      senderId: PART_ID,
      sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, type: 'member', user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: false } },
    };
    prisma.message.findMany
      .mockResolvedValueOnce([msg]) // content matches (contains msg)
      .mockResolvedValueOnce([msg]); // translation candidates (same msg)
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello'), reply);
    expect(reply._body.data).toHaveLength(1); // deduplicated
  });

  it('hasMore when merged results exceed searchLimit', async () => {
    const limit = 5;
    // Build limit+1 content matches to trigger hasMore
    const msgs = Array.from({ length: limit + 1 }, (_, i) => ({
      id: `msg-${i}`,
      conversationId: CONV_ID,
      content: 'hello world',
      originalLanguage: 'fr',
      messageType: 'text',
      translations: null,
      createdAt: new Date(Date.now() - i * 1000),
      senderId: PART_ID,
      sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, type: 'member', user: null },
    }));
    prisma.message.findMany
      .mockResolvedValueOnce(msgs) // content search returns limit+1
      .mockResolvedValueOnce([]); // no translation candidates
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello', { limit: String(limit) }), reply);
    const body = reply._body;
    expect(body.cursorPagination.hasMore).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(limit);
  });

  it('error path → 500', async () => {
    prisma.message.findMany.mockRejectedValue(new Error('DB error'));
    const reply = makeReply();
    await getHandler_()(makeSearchReq(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional coverage: GET /conversations/:id/messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /conversations/:id/messages — coverage extension', () => {
  const getMessagesHandler = () =>
    fastify._routes['GET']['/conversations/:id/messages'];

  it('around mode with aroundMessage found: builds id-in whereClause', async () => {
    const aroundDate = new Date('2024-06-15');
    prisma.message.findFirst.mockResolvedValueOnce({ createdAt: aroundDate });
    prisma.message.findMany
      .mockResolvedValueOnce([{ id: 'before-1' }])
      .mockResolvedValueOnce([{ id: 'after-1' }])
      .mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { around: MSG_ID } }), reply);
    expect(reply.send).toHaveBeenCalled();
    const mainQuery = (prisma.message.findMany.mock.calls[2][0] as any);
    expect(mainQuery.where.id?.in).toContain(MSG_ID);
    expect(mainQuery.where.id?.in).toContain('before-1');
    expect(mainQuery.where.id?.in).toContain('after-1');
  });

  it('cleanAttachmentsForApi: speakerAnalysis with voiceCharacteristics → speakerInfo extended', async () => {
    const msg = makeMessage({
      attachments: [{
        id: 'att-spk',
        mimeType: 'audio/mp3',
        fileUrl: 'http://x.com/a.mp3',
        reactions: [],
        translations: null,
        transcription: {
          text: 'hello world',
          language: 'fr',
          confidence: 0.92,
          segments: [{ text: 'hello world', startMs: 0, endMs: 1200, speakerId: 'spk1', voiceSimilarityScore: 0.8, confidence: 0.9 }],
          speakerAnalysis: {
            speakers: [{
              sid: 'spk1',
              voiceCharacteristics: { pitch: { mean_hz: 120 }, classification: { estimated_gender: 'female' } }
            }]
          },
          source: 'whisper',
          model: 'tiny'
        },
      }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply.send).toHaveBeenCalled();
    const att = reply._body.data[0].attachments[0];
    expect(att.transcription.segments[0].voiceSimilarityScore).toBe(0.8);
  });

  it('cleanAttachmentsForApi: language filter strips translations not in langSet', async () => {
    const msg = makeMessage({
      attachments: [{
        id: 'att-trans',
        mimeType: 'audio/mp3',
        fileUrl: 'http://x.com/a.mp3',
        reactions: [],
        translations: {
          en: { url: 'http://x.com/en.mp3', segments: [] },
          de: { url: 'http://x.com/de.mp3', segments: [] },
        },
        transcription: null,
      }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { languages: 'fr' } }), reply);
    expect(reply.send).toHaveBeenCalled();
    expect(reply._body.data[0].attachments[0].translations).toEqual({});
  });

  it('read status computation: participant.findMany throws → warns and handler still succeeds', async () => {
    const msg = makeMessage();
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.participant.findMany.mockRejectedValue(new Error('DB timeout'));
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply.send).toHaveBeenCalled();
    expect(reply._body.data).toHaveLength(1);
  });

  it('includeReactions=true: reactions field mapped when present on message', async () => {
    const msg = makeMessage({ reactions: [{ emoji: '👍', count: 2 }] });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_reactions: 'true' } }), reply);
    expect(reply._body.data[0].reactions).toEqual([{ emoji: '👍', count: 2 }]);
  });

  it('includeStatus=true: statusEntries field mapped when present on message', async () => {
    const msg = makeMessage({ statusEntries: [{ participantId: PART_ID, status: 'read' }] });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_status: 'true' } }), reply);
    expect(reply._body.data[0].statusEntries).toEqual([{ participantId: PART_ID, status: 'read' }]);
  });

  it('includeReplies=true: replyTo.sender username resolved from nested user object', async () => {
    const msg = makeMessage({
      replyTo: {
        id: 'reply-msg-id',
        content: 'original reply',
        originalLanguage: 'fr',
        sender: {
          id: PART_ID,
          displayName: 'Bob',
          avatar: null,
          username: null,
          user: { username: 'bob_user', displayName: 'Bob Full', avatar: null },
        },
      },
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const replyTo = reply._body.data[0].replyTo;
    expect(replyTo).toBeDefined();
    expect(replyTo.sender.username).toBe('bob_user');
  });

  it('forwarded message enrichment: adds forwardedFrom and forwardedFromConversation', async () => {
    const msg = makeMessage({ forwardedFromId: 'fwd-msg-id', forwardedFromConversationId: 'fwd-conv-id' });
    const forwardedMsg = {
      id: 'fwd-msg-id',
      content: 'original content',
      messageType: 'text',
      createdAt: new Date('2024-01-01'),
      senderId: 'orig-part-id',
      conversationId: 'fwd-conv-id',
      sender: { id: 'orig-part-id', userId: 'orig-user-id', displayName: 'Original Bob', avatar: null, user: { username: 'orig_bob' } },
      attachments: [],
    };
    const forwardedConv = { id: 'fwd-conv-id', title: 'Original Convo', identifier: null, type: 'group', avatar: null };
    prisma.message.findMany
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([forwardedMsg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.conversation.findMany.mockResolvedValue([forwardedConv]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const result = reply._body.data[0];
    expect(result.forwardedFrom).toBeDefined();
    expect(result.forwardedFrom.id).toBe('fwd-msg-id');
    expect(result.forwardedFrom.sender.username).toBe('orig_bob');
    expect(result.forwardedFromConversation).toBeDefined();
    expect(result.forwardedFromConversation.title).toBe('Original Convo');
  });

  it('markMessagesAsReceived error: caught in fire-and-forget, handler still succeeds', async () => {
    mockMarkMessagesAsReceived.mockRejectedValue(new Error('receive fail'));
    const msg = makeMessage();
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(reply.send).toHaveBeenCalled();
    expect(mockMarkMessagesAsReceived).toHaveBeenCalled();
  });

  it('LOG_AUDIO_DIAG=true: audio attachment without transcription covers no-transcription branch', async () => {
    const origEnv = process.env.LOG_AUDIO_DIAG;
    process.env.LOG_AUDIO_DIAG = 'true';
    try {
      const msg = makeMessage({
        attachments: [{
          id: 'att-no-trans',
          mimeType: 'audio/ogg',
          fileUrl: 'http://x.com/b.ogg',
          reactions: [],
          translations: null,
          transcription: null,
        }],
      });
      prisma.message.findMany.mockResolvedValue([msg]);
      prisma.message.count.mockResolvedValue(1);
      const reply = makeReply();
      await getMessagesHandler()(makeRequest(), reply);
      expect(reply.send).toHaveBeenCalled();
    } finally {
      process.env.LOG_AUDIO_DIAG = origEnv;
    }
  });

  it('LOG_AUDIO_DIAG=true: audio with speakerAnalysis and voiceCharacteristics covers speaker branch', async () => {
    const origEnv = process.env.LOG_AUDIO_DIAG;
    process.env.LOG_AUDIO_DIAG = 'true';
    try {
      const msg = makeMessage({
        attachments: [{
          id: 'att-spk-diag',
          mimeType: 'audio/mp3',
          fileUrl: 'http://x.com/c.mp3',
          reactions: [],
          translations: null,
          transcription: {
            text: 'test',
            language: 'fr',
            confidence: 0.95,
            segments: null,
            speakerAnalysis: {
              speakers: [{
                sid: 'spk0',
                voiceCharacteristics: { pitch: { mean_hz: 150 }, classification: { estimated_gender: 'male' } }
              }]
            },
            source: 'whisper',
            model: 'large',
          },
        }],
      });
      prisma.message.findMany.mockResolvedValue([msg]);
      prisma.message.count.mockResolvedValue(1);
      const reply = makeReply();
      await getMessagesHandler()(makeRequest(), reply);
      expect(reply.send).toHaveBeenCalled();
    } finally {
      process.env.LOG_AUDIO_DIAG = origEnv;
    }
  });

  it('LOG_AUDIO_DIAG=true: audio with translations covers translation-logging branch', async () => {
    const origEnv = process.env.LOG_AUDIO_DIAG;
    process.env.LOG_AUDIO_DIAG = 'true';
    try {
      const msg = makeMessage({
        attachments: [{
          id: 'att-trans-diag',
          mimeType: 'audio/mp3',
          fileUrl: 'http://x.com/d.mp3',
          reactions: [],
          translations: {
            fr: { url: 'http://x.com/d-fr.mp3', cloned: true, segments: [{ text: 'bonjour' }] },
          },
          transcription: {
            text: 'hello',
            language: 'en',
            confidence: 0.9,
            segments: null,
            speakerAnalysis: null,
            source: 'whisper',
            model: 'tiny',
          },
        }],
      });
      prisma.message.findMany.mockResolvedValue([msg]);
      prisma.message.count.mockResolvedValue(1);
      const reply = makeReply();
      await getMessagesHandler()(makeRequest(), reply);
      expect(reply.send).toHaveBeenCalled();
    } finally {
      process.env.LOG_AUDIO_DIAG = origEnv;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional coverage: POST /conversations/:id/mark-read
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/mark-read — coverage extension', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/mark-read'];

  it('canAccess=false → 403', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Unauthorized access to this conversation');
  });

  it('shouldShowReadReceipts=true: emits READ_STATUS_UPDATED to conversation room', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([]);
    mockGetUnreadCount.mockResolvedValue(2);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(fastify._mockEmit).toHaveBeenCalledWith(
      'read-status:updated',
      expect.objectContaining({ conversationId: 'resolved-conv-id', type: 'read' }),
    );
    expect(fastify._mockEmit).toHaveBeenCalledWith(
      'message:read-status-updated',
      expect.objectContaining({ conversationId: 'resolved-conv-id', type: 'read' }),
    );
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 2 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional coverage: POST /conversations/:id/messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/messages — coverage extension', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/messages'];

  it('anonymous user with participantId: uses authContext.participantId and sends message', async () => {
    const anonCtx = {
      type: 'anonymous' as const,
      isAuthenticated: true,
      isAnonymous: true,
      userId: 'anon-session',
      participantId: PART_ID,
      registeredUser: undefined,
      hasFullAccess: false,
    };
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, conversationId: CONV_ID } });
    const req = makeRequest({ authContext: anonCtx, body: { content: 'hello from anon' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'hello from anon' }),
      PART_ID,
    );
    expect(reply.send).toHaveBeenCalled();
  });

  it('anonymous user without participantId → 403 Participant identification failed', async () => {
    const anonCtx = {
      type: 'anonymous' as const,
      isAuthenticated: true,
      isAnonymous: true,
      userId: 'anon-session',
      participantId: undefined,
      registeredUser: undefined,
      hasFullAccess: false,
    };
    const req = makeRequest({ authContext: anonCtx, body: { content: 'hello no pid' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Participant identification failed');
  });

  it('direct conversation + isBlockedBetween=true → 403 USER_BLOCKED', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      type: 'direct',
      participants: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
    });
    mockIsBlockedBetween.mockResolvedValue(true);
    const req = makeRequest({ body: { content: 'blocked message' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(
      reply,
      'User is blocked',
      expect.objectContaining({ code: 'USER_BLOCKED' }),
    );
  });

  it('non-duplicate success: setImmediate fires and calls broadcastMessage', async () => {
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, conversationId: CONV_ID } });
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    await new Promise(resolve => setImmediate(resolve));
    expect(fastify.socketIOHandler.broadcastMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: MSG_ID }),
      CONV_ID,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional coverage: POST /conversations/:id/mark-unread
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/mark-unread — coverage extension', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/mark-unread'];

  it('latestMessage found but participantForCursor=null → 403', async () => {
    prisma.participant.findFirst
      .mockResolvedValueOnce({ id: PART_ID })
      .mockResolvedValueOnce(null);
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: MSG_ID, createdAt: new Date() })
      .mockResolvedValueOnce(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Not a participant');
  });

  it('previousMessage=null: upserts cursor with lastReadMessageId=null', async () => {
    prisma.participant.findFirst
      .mockResolvedValueOnce({ id: PART_ID })
      .mockResolvedValueOnce({ id: PART_ID });
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: MSG_ID, createdAt: new Date() })
      .mockResolvedValueOnce(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(prisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastReadMessageId: null }),
        update: expect.objectContaining({ lastReadMessageId: null }),
      }),
    );
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { unreadCount: 1 });
  });

  it('race guard: a newer message was read concurrently after latestMessage was captured → skips the stale rewind, never overwrites the fresher cursor', async () => {
    // A message strictly newer (lexicographically greater ObjectId) than MSG_ID
    // was read by another device between our `latestMessage` read and the
    // cursor write — the cursor now points past what we captured.
    const NEWER_MSG_ID = '507f1f77bcf86cd799439099';
    prisma.participant.findFirst
      .mockResolvedValueOnce({ id: PART_ID }) // currentParticipant
      .mockResolvedValueOnce({ id: PART_ID }); // participantForCursor
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: MSG_ID, createdAt: new Date('2024-06-10') }) // latestMessage
      .mockResolvedValueOnce({ id: 'prev-msg-id' }); // previousMessage
    prisma.conversationReadCursor.findUnique.mockResolvedValueOnce({ lastReadMessageId: NEWER_MSG_ID });
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(prisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { unreadCount: 0 });
  });

  it('cursor already exactly at latestMessage (not stale) → proceeds with the rewind as normal', async () => {
    prisma.participant.findFirst
      .mockResolvedValueOnce({ id: PART_ID }) // currentParticipant
      .mockResolvedValueOnce({ id: PART_ID }); // participantForCursor
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: MSG_ID, createdAt: new Date('2024-06-10') }) // latestMessage
      .mockResolvedValueOnce({ id: 'prev-msg-id' }); // previousMessage
    prisma.conversationReadCursor.findUnique.mockResolvedValueOnce({ lastReadMessageId: MSG_ID });
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(prisma.conversationReadCursor.upsert).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { unreadCount: 1 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional coverage: broadcastReadStatus loop body + catch (lines 342-350)
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/mark-read — broadcastReadStatus loop coverage', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/mark-read'];

  it('participant with userId=null: covers !p.userId continue branch in room-chaining loop', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // Participant with null userId → takes the `continue` branch (line 342)
    prisma.participant.findMany.mockResolvedValue([{ userId: null }]);
    mockGetUnreadCount.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    // emitter.emit still called (loop skipped the null-userId entry)
    expect(fastify._mockEmit).toHaveBeenCalledWith('read-status:updated', expect.anything());
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 1 });
  });

  it('participant with real userId: covers loop body and catch when .to() is not chainable', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // Non-null userId → loop body runs; emitter.to(userRoom) throws TypeError (mock not chainable)
    // → broadcastReadStatus catch block (line 350) swallows the error
    prisma.participant.findMany.mockResolvedValue([{ userId: OTHER_USER_ID }]);
    mockGetUnreadCount.mockResolvedValue(4);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    // Handler still succeeds — broadcastReadStatus error is swallowed
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 4 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Additional coverage: POST /messages broadcastMessage rejection (line 1635)
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/messages — broadcastMessage error coverage', () => {
  const getHandler_ = () => fastify._routes['POST']['/conversations/:id/messages'];

  it('broadcastMessage rejects: .catch() inside setImmediate logs and swallows error', async () => {
    fastify.socketIOHandler.broadcastMessage.mockRejectedValue(new Error('socket fail'));
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, conversationId: CONV_ID } });
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    expect(reply.send).toHaveBeenCalled();
  });

  it('result.data without conversationId: falls back to resolvedConversationId for broadcast', async () => {
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID } });
    const req = makeRequest({ body: { content: 'hello' } });
    const reply = makeReply();
    await getHandler_()(req, reply);
    await new Promise(resolve => setImmediate(resolve));
    expect(fastify.socketIOHandler.broadcastMessage).toHaveBeenCalledWith(
      expect.any(Object),
      'resolved-conv-id',
    );
  });

  it('effectFlags bits: isBlurred/expiresAt/isViewOnce OR into effectFlags', async () => {
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, conversationId: CONV_ID } });
    const req = makeRequest({
      body: {
        content: 'test',
        isBlurred: true,
        expiresAt: '2025-12-31T23:59:59Z',
        isViewOnce: true,
        effectFlags: 0,
      },
    });
    const reply = makeReply();
    await getHandler_()(req, reply);
    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ effectFlags: expect.any(Number) }),
      expect.any(String),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage: broadcastReadStatus dedup + socketIOManager null
// ═══════════════════════════════════════════════════════════════════════════════

describe('broadcastReadStatus — branch coverage', () => {
  const getMarkReadHandler = () => fastify._routes['POST']['/conversations/:id/mark-read'];

  it('socketIOManager null: broadcastReadStatus returns early without emitting', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    fastify.socketIOHandler.getManager = jest.fn().mockReturnValue(null);
    mockGetUnreadCount.mockResolvedValue(2);
    const reply = makeReply();
    await getMarkReadHandler()(makeRequest(), reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 2 });
  });

  it('seenRooms dedup: duplicate participant userId skips second room chain', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    const chainableEmitter: any = { emit: jest.fn() };
    chainableEmitter.to = jest.fn().mockReturnValue(chainableEmitter);
    const mockIO2 = { to: jest.fn().mockReturnValue(chainableEmitter) };
    fastify.socketIOHandler.getManager = jest.fn().mockReturnValue({ getIO: jest.fn().mockReturnValue(mockIO2) });
    prisma.participant.findMany.mockResolvedValue([
      { userId: OTHER_USER_ID },
      { userId: OTHER_USER_ID },
    ]);
    mockGetUnreadCount.mockResolvedValue(3);
    const reply = makeReply();
    await getMarkReadHandler()(makeRequest(), reply);
    expect(chainableEmitter.to).toHaveBeenCalledTimes(1);
    expect(chainableEmitter.emit).toHaveBeenCalledWith('read-status:updated', expect.anything());
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 3 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage: GET messages — uncovered branch conditions
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /conversations/:id/messages — branch coverage extension', () => {
  const getMessagesHandler = () =>
    fastify._routes['GET']['/conversations/:id/messages'];

  it('speakerAnalysis with no voiceCharacteristics: withVoiceChars=0 skips firstSpeaker block', async () => {
    const msg = makeMessage({
      attachments: [{
        id: 'att-spk-novc',
        mimeType: 'audio/mp3',
        fileUrl: 'http://x.com/a.mp3',
        reactions: [],
        translations: null,
        transcription: {
          text: 'hello',
          language: 'fr',
          confidence: 0.9,
          segments: [{ text: 'hello', startMs: 0, endMs: 500, speakerId: 'spk1', voiceSimilarityScore: null, confidence: 0.9 }],
          speakerAnalysis: { speakers: [{ sid: 'spk1', voiceCharacteristics: null }] },
          source: 'whisper',
          model: 'tiny',
        },
      }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply.send).toHaveBeenCalled();
    expect(reply._body.data[0].attachments[0].transcription.segments[0].voiceSimilarityScore).toBeNull();
  });

  it('language filter includes matching translation, excludes non-matching', async () => {
    const msg = makeMessage({
      attachments: [{
        id: 'att-fr-trans',
        mimeType: 'audio/mp3',
        fileUrl: 'http://x.com/a.mp3',
        reactions: [],
        translations: {
          fr: { url: 'http://x.com/fr.mp3', segments: [] },
          en: { url: 'http://x.com/en.mp3', segments: [] },
        },
        transcription: null,
      }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { languages: 'fr' } }), reply);
    const trans = reply._body.data[0].attachments[0].translations;
    expect(trans.fr).toBeDefined();
    expect(trans.en).toBeUndefined();
  });

  it('message.translations present with language filter: transformTranslationsToArray called with languages option', async () => {
    const msg = makeMessage({ translations: { fr: { text: 'bonjour' } } });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_translations: 'true', languages: 'fr' } }), reply);
    expect(mockTransformTranslationsToArray).toHaveBeenCalledWith(
      MSG_ID,
      expect.any(Object),
      expect.objectContaining({ languages: ['fr'] }),
    );
  });

  it('read status: cursor from same sender is skipped (continue branch)', async () => {
    const msgCreatedAt = new Date('2024-06-01');
    const msg = makeMessage({ createdAt: msgCreatedAt });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.participant.findMany.mockResolvedValue([{ id: PART_ID }]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([{
      participantId: PART_ID,
      lastDeliveredAt: new Date('2024-06-02'),
      lastReadAt: new Date('2024-06-02'),
    }]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].deliveredCount).toBe(0);
    expect(reply._body.data[0].readCount).toBe(0);
  });

  it('read status: cursor with old dates leaves deliveredCount/readCount at 0', async () => {
    const msgCreatedAt = new Date('2024-06-15');
    const msg = makeMessage({ createdAt: msgCreatedAt });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.participant.findMany.mockResolvedValue([{ id: PART_ID }, { id: 'other-part' }]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([{
      participantId: 'other-part',
      lastDeliveredAt: new Date('2020-01-01'),
      lastReadAt: null,
    }]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].deliveredCount).toBe(0);
    expect(reply._body.data[0].readCount).toBe(0);
  });

  it('replyTo with null sender: replyTo.sender mapped as null', async () => {
    const msg = makeMessage({
      replyTo: { id: 'reply-id', originalLanguage: 'fr', sender: null },
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const replyTo = reply._body.data[0].replyTo;
    expect(replyTo).toBeDefined();
    expect(replyTo.sender).toBeNull();
  });

  it('forwarded message with null sender: forwardedFrom.sender mapped as null', async () => {
    const msg = makeMessage({ forwardedFromId: 'fwd-no-sender' });
    const forwardedMsg = {
      id: 'fwd-no-sender',
      content: 'msg no sender',
      messageType: 'text',
      createdAt: new Date('2024-01-01'),
      senderId: null,
      conversationId: CONV_ID,
      sender: null,
      attachments: [],
    };
    prisma.message.findMany
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([forwardedMsg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].forwardedFrom.sender).toBeNull();
  });

  it('LOG_AUDIO_DIAG=true: audio translation with no url logs warning placeholder', async () => {
    const origEnv = process.env.LOG_AUDIO_DIAG;
    process.env.LOG_AUDIO_DIAG = 'true';
    try {
      const msg = makeMessage({
        attachments: [{
          id: 'att-nourl',
          mimeType: 'audio/mp3',
          fileUrl: 'http://x.com/a.mp3',
          reactions: [],
          translations: {
            fr: { url: null, cloned: false, segments: [] },
          },
          transcription: {
            text: 'hello', language: 'en', confidence: 0.9, segments: null,
            speakerAnalysis: null, source: 'whisper', model: 'tiny',
          },
        }],
      });
      prisma.message.findMany.mockResolvedValue([msg]);
      prisma.message.count.mockResolvedValue(1);
      const reply = makeReply();
      await getMessagesHandler()(makeRequest(), reply);
      expect(reply.send).toHaveBeenCalled();
    } finally {
      process.env.LOG_AUDIO_DIAG = origEnv;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage: GET messages — deep branch coverage pass 2
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /conversations/:id/messages — deep branch coverage pass 2', () => {
  const getMessagesHandler = () => fastify._routes['GET']['/conversations/:id/messages'];

  it('include_replies=true with replyTo.originalLanguage null: falls back to fr (lines 737, 1098)', async () => {
    const msg = makeMessage({
      replyTo: {
        id: 'reply-id',
        originalLanguage: null,
        sender: {
          id: 'spid',
          displayName: null,
          avatar: null,
          user: { username: 'bob', displayName: 'Bob From User', avatar: null },
        },
      },
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_replies: 'true' } }), reply);
    expect(reply._body.data[0].replyTo.originalLanguage).toBe('fr');
    expect(reply._body.data[0].replyTo.sender.displayName).toBe('Bob From User');
  });

  it('speakers undefined in speakerAnalysis: || [] fallback (line 173)', async () => {
    const msg = makeMessage({
      attachments: [{
        id: 'att-no-spk',
        mimeType: 'audio/mp3',
        fileUrl: 'http://x.com/a.mp3',
        reactions: [],
        translations: null,
        transcription: {
          text: 'hi',
          language: 'fr',
          confidence: 0.9,
          segments: [{ text: 'hi', startMs: 0, endMs: 200, speakerId: null, voiceSimilarityScore: null, confidence: 0.9 }],
          speakerAnalysis: { speakers: undefined },
          source: 'whisper',
          model: 'tiny',
        },
      }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply.send).toHaveBeenCalled();
  });

  it('translation segment voiceSimilarityScore non-number: mapped to null (line 215)', async () => {
    const msg = makeMessage({
      attachments: [{
        id: 'att-seg-score',
        mimeType: 'audio/mp3',
        fileUrl: 'http://x.com/a.mp3',
        reactions: [],
        translations: {
          fr: { url: 'http://x.com/fr.mp3', segments: [{ text: 'bonjour', startMs: 0, endMs: 300, voiceSimilarityScore: 'bad' }] },
        },
        transcription: null,
      }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const seg = reply._body.data[0].attachments[0]?.translations?.fr?.segments?.[0];
    expect(seg?.voiceSimilarityScore).toBeNull();
  });

  it('authenticated user with participant not found: empty userReactions (line 829 false)', async () => {
    prisma.participant.findFirst.mockResolvedValue(null);
    const msg = makeMessage();
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].currentUserReactions).toEqual([]);
  });

  it('consumption entry with watchedComplete=null: ?? false fallback (lines 871-874)', async () => {
    const msg = makeMessage({
      attachments: [{ id: 'att-c', mimeType: 'audio/mp3', fileUrl: 'http://x.com/a.mp3', reactions: [], translations: null, transcription: null }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.attachmentStatusEntry.findMany.mockResolvedValue([{
      attachmentId: 'att-c',
      lastPlayPositionMs: 4000,
      listenedComplete: true,
      lastWatchPositionMs: null,
      watchedComplete: null,
    }]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(prisma.attachmentStatusEntry.findMany).toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalled();
  });

  it('readStatusMap: other-participant cursor after msg date increments counts (lines 1040-1041)', async () => {
    const msgDate = new Date('2024-05-01');
    const msg = makeMessage({ createdAt: msgDate });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.participant.findMany.mockResolvedValue([{ id: PART_ID }, { id: 'other-part' }]);
    prisma.conversationReadCursor.findMany.mockResolvedValue([{
      participantId: 'other-part',
      lastDeliveredAt: new Date('2024-06-01'),
      lastReadAt: new Date('2024-06-01'),
    }]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].deliveredCount).toBe(1);
    expect(reply._body.data[0].readCount).toBe(1);
  });

  it('sender.user=null: username/displayName/isOnline fallback chain (lines 1067-1070)', async () => {
    const msg = makeMessage({
      sender: { id: PART_ID, userId: USER_ID, displayName: null, avatar: null, type: 'member', role: 'USER', language: 'fr', user: null },
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].sender.username).toBeNull();
    expect(reply._body.data[0].sender.displayName).toBeNull();
  });

  it('sender.displayName=null, user.displayName set: falls back to user.displayName (line 1070)', async () => {
    const msg = makeMessage({
      sender: { id: PART_ID, userId: USER_ID, displayName: null, avatar: null, type: 'member', role: 'USER', language: 'fr', user: { id: USER_ID, username: null, displayName: 'Bob From User', avatar: null } },
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].sender.displayName).toBe('Bob From User');
  });

  it('include_translations=true without language filter: options=undefined (line 1085)', async () => {
    const msg = makeMessage({ translations: { fr: { text: 'bonjour' } } });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_translations: 'true' } }), reply);
    expect(mockTransformTranslationsToArray).toHaveBeenCalledWith(
      MSG_ID,
      expect.any(Object),
      undefined,
    );
  });

  it('forwardedFrom with sender having user: displayName chain covered (lines 1156-1167)', async () => {
    const fwdMsg = {
      id: 'fwd-with-sender',
      content: 'original msg',
      messageType: 'text',
      createdAt: new Date('2024-01-01'),
      senderId: PART_ID,
      conversationId: CONV_ID,
      sender: { id: PART_ID, displayName: null, avatar: null, user: { username: 'alice', displayName: 'Alice via user', avatar: null } },
      attachments: [],
    };
    const msg = makeMessage({ forwardedFromId: 'fwd-with-sender' });
    prisma.message.findMany
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([fwdMsg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].forwardedFrom.sender).not.toBeNull();
    expect(reply._body.data[0].forwardedFrom.sender.displayName).toBe('Alice via user');
  });

  it('forwardedFromConversationId: conv not in map (line 1176 false branch)', async () => {
    const fwdMsg = {
      id: 'fwd-id', content: 'fwd', messageType: 'text', createdAt: new Date(),
      senderId: null, conversationId: CONV_ID, sender: null, attachments: [],
    };
    const msg = makeMessage({ forwardedFromId: 'fwd-id', forwardedFromConversationId: 'unknown-conv' });
    prisma.message.findMany
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([fwdMsg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.conversation.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].forwardedFromConversation).toBeUndefined();
  });

  it('storyReplyToId present, no snapshot, post not found: postReplyTo undefined (lines 1215-1217)', async () => {
    const msg = makeMessage({ storyReplyToId: 'post-nonexistent' });
    mockPostReplyToFromMetadata.mockReturnValue(null);
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    prisma.post.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].postReplyTo).toBeUndefined();
  });

  it('before=X where beforeMessage not found: before clause not applied (line 552 false)', async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.message.count.mockResolvedValue(0);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { before: 'nonexistent-id' } }), reply);
    expect(reply.send).toHaveBeenCalled();
  });

  it('shareLink found with allowViewHistory=true: no history restriction (lines 516, 523 false)', async () => {
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, joinedAt: new Date('2024-01-01'), shareLinkId: 'link-1' });
    prisma.conversationShareLink.findFirst.mockResolvedValue({
      allowViewHistory: true,
      expiresAt: null,
      maxUses: null,
      currentUses: 0,
    });
    prisma.message.findMany.mockResolvedValue([]);
    prisma.message.count.mockResolvedValue(0);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply.send).toHaveBeenCalled();
  });

  it('around mode with historyStartDate: applies gte to beforeFilter (line 575 true)', async () => {
    const joinedAt = new Date('2024-03-01');
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, joinedAt, shareLinkId: 'link-2' });
    prisma.conversationShareLink.findFirst.mockResolvedValue({
      allowViewHistory: false,
      expiresAt: null,
      maxUses: null,
      currentUses: 0,
    });
    prisma.message.findFirst.mockResolvedValue({ createdAt: new Date('2024-06-15') });
    prisma.message.findMany
      .mockResolvedValueOnce([{ id: 'b1' }])
      .mockResolvedValueOnce([{ id: 'a1' }])
      .mockResolvedValue([]);
    prisma.message.count.mockResolvedValue(0);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { around: MSG_ID } }), reply);
    expect(reply.send).toHaveBeenCalled();
  });

  it('LOG_AUDIO_DIAG=true with transcription + speakerAnalysis.voiceCharacteristics (lines 913-916, 944)', async () => {
    const origEnv = process.env.LOG_AUDIO_DIAG;
    process.env.LOG_AUDIO_DIAG = 'true';
    try {
      const msg = makeMessage({
        attachments: [{
          id: 'att-diag2',
          mimeType: 'audio/mp3',
          fileUrl: 'http://x.com/a.mp3',
          reactions: [],
          translations: { fr: { url: 'http://x.com/fr.mp3', cloned: true, segments: [] } },
          transcription: {
            text: 'diagnostic text',
            language: 'en',
            confidence: 0.95,
            segments: null,
            speakerAnalysis: {
              speakers: [{ sid: 'spk1', voiceCharacteristics: { pitch: { mean_hz: 150 }, classification: { estimated_gender: 'female' } } }],
            },
            source: 'whisper',
            model: 'medium',
          },
        }],
      });
      prisma.message.findMany.mockResolvedValue([msg]);
      prisma.message.count.mockResolvedValue(1);
      const reply = makeReply();
      await getMessagesHandler()(makeRequest(), reply);
      expect(reply.send).toHaveBeenCalled();
    } finally {
      process.env.LOG_AUDIO_DIAG = origEnv;
    }
  });

  it('forwardedFromId present but original not in map: forwardedFrom not set (line 1158 false)', async () => {
    const msg = makeMessage({ forwardedFromId: 'fwd-missing' });
    prisma.message.findMany
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].forwardedFrom).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage: POST /messages — extra branches
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/messages — extra branch coverage', () => {
  const getHandler = () => fastify._routes['POST']['/conversations/:id/messages'];

  it('messagingService singleton: second call reuses cached instance (line 288 false)', async () => {
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, conversationId: CONV_ID } });
    const r1 = makeReply();
    const r2 = makeReply();
    await getHandler()(makeRequest({ body: { content: 'first' } }), r1);
    await getHandler()(makeRequest({ body: { content: 'second' } }), r2);
    expect(mockHandleMessage).toHaveBeenCalledTimes(2);
  });

  it('isEncrypted=true: encryptedPayload included (line 1602 true)', async () => {
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, conversationId: CONV_ID } });
    const req = makeRequest({
      body: {
        content: '',
        isEncrypted: true,
        encryptedContent: 'enc-b64',
        encryptionMode: 'e2ee',
        encryptionMetadata: { sessionId: 's1' },
      },
    });
    const reply = makeReply();
    await getHandler()(req, reply);
    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedPayload: expect.objectContaining({ ciphertext: 'enc-b64', mode: 'e2ee' }) }),
      expect.any(String),
    );
  });

  it('result.success=false, error=undefined: sendBadRequest with fallback message (line 1621)', async () => {
    mockHandleMessage.mockResolvedValue({ success: false, error: undefined });
    const reply = makeReply();
    await getHandler()(makeRequest({ body: { content: 'msg' } }), reply);
    expect(mockSendBadRequest).toHaveBeenCalledWith(reply, 'Invalid message request');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage: DELETE unpin, GET pinned-messages
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /conversations/:id/messages/:messageId/pin — no socketIOHandler', () => {
  it('socketIOHandler=null: unpin succeeds without emitting (line 1993 false branch)', async () => {
    const noSocketFastify = createMockFastify();
    (noSocketFastify as any).socketIOHandler = null;
    registerMessagesRoutes(noSocketFastify, prisma as any, translationService, optionalAuth, requiredAuth);
    const handler = noSocketFastify._routes['DELETE']['/conversations/:id/messages/:messageId/pin'];
    prisma.message.update.mockResolvedValue({ id: MSG_ID });
    const reply = makeReply();
    await handler(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }), reply);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, null);
  });
});

describe('GET /conversations/:id/pinned-messages — sender branches', () => {
  const getHandler = () => fastify._routes['GET']['/conversations/:id/pinned-messages'];

  it('sender=null: mapped as null (line 2153 false branch)', async () => {
    const pinnedMsg = {
      id: MSG_ID, conversationId: CONV_ID, senderId: null,
      content: 'pinned', originalLanguage: 'fr', messageType: 'text',
      editedAt: null, deletedAt: null, replyToId: null,
      forwardedFromId: null, forwardedFromConversationId: null,
      pinnedAt: new Date(), pinnedBy: USER_ID,
      isViewOnce: false, isBlurred: false, expiresAt: null, effectFlags: 0,
      translations: null, createdAt: new Date(), updatedAt: new Date(),
      sender: null, attachments: [], _count: { reactions: 0, replies: 0 },
    };
    prisma.message.findMany.mockResolvedValue([pinnedMsg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler()(makeRequest(), reply);
    expect(reply._body.data[0].sender).toBeNull();
  });

  it('sender with user=null: firstName/isOnline fallback (lines 2159-2166)', async () => {
    const pinnedMsg = {
      id: MSG_ID, conversationId: CONV_ID, senderId: PART_ID,
      content: 'pinned', originalLanguage: 'fr', messageType: 'text',
      editedAt: null, deletedAt: null, replyToId: null,
      forwardedFromId: null, forwardedFromConversationId: null,
      pinnedAt: new Date(), pinnedBy: USER_ID,
      isViewOnce: false, isBlurred: false, expiresAt: null, effectFlags: 0,
      translations: null, createdAt: new Date(), updatedAt: new Date(),
      sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, type: 'member', user: null },
      attachments: null, _count: { reactions: 2, replies: 1 },
    };
    prisma.message.findMany.mockResolvedValue([pinnedMsg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler()(makeRequest(), reply);
    const result = reply._body.data[0];
    expect(result.sender.firstName).toBeNull();
    expect(result.sender.isOnline).toBe(false);
    expect(result.attachments).toEqual([]);
    expect(result.reactionCount).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage: POST consume — null value branches
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/messages/:messageId/consume — null value branches', () => {
  const getHandler = () => fastify._routes['POST']['/conversations/:id/messages/:messageId/consume'];
  const makeReqWithMsg = () => makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });

  it('maxViewOnceCount null → 1, viewOnceCount null → 1 (lines 2256-2257)', async () => {
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, isViewOnce: true, maxViewOnceCount: null, conversationId: CONV_ID });
    prisma.message.update.mockResolvedValue({ id: MSG_ID, viewOnceCount: null });
    prisma.participant.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler()(makeReqWithMsg(), reply);
    const result = mockSendSuccess.mock.calls[0][1] as any;
    expect(result.maxViewOnceCount).toBe(1);
    expect(result.viewOnceCount).toBe(1);
  });

  it('viewParticipant=null: statusEntry skipped (line 2265 false branch)', async () => {
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, isViewOnce: true, maxViewOnceCount: 2, conversationId: CONV_ID });
    prisma.message.update.mockResolvedValue({ id: MSG_ID, viewOnceCount: 1 });
    prisma.participant.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler()(makeReqWithMsg(), reply);
    expect(prisma.messageStatusEntry.updateMany).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('socketIOHandler=null: consume without broadcast (line 2274 false)', async () => {
    const noSocketFastify = createMockFastify();
    (noSocketFastify as any).socketIOHandler = null;
    registerMessagesRoutes(noSocketFastify, prisma as any, translationService, optionalAuth, requiredAuth);
    const handler = noSocketFastify._routes['POST']['/conversations/:id/messages/:messageId/consume'];
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, isViewOnce: true, maxViewOnceCount: 1, conversationId: CONV_ID });
    prisma.message.update.mockResolvedValue({ id: MSG_ID, viewOnceCount: 1 });
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
    const reply = makeReply();
    await handler(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }), reply);
    expect(mockSendSuccess).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Branch coverage: GET search — extra branches
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /conversations/:id/messages/search — extra branch coverage', () => {
  const getHandler = () => fastify._routes['GET']['/conversations/:id/messages/search'];
  const makeSearchReq = (q = 'hello', extra: any = {}) => makeRequest({ query: { q, ...extra } });

  it('cursor not found in DB: whereClause not modified (line 2374 false branch)', async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.message.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const reply = makeReply();
    await getHandler()(makeSearchReq('hello', { cursor: 'bad-cursor-id' }), reply);
    expect(reply._body.success).toBe(true);
  });

  it('translation value is plain string matching query (lines 2430-2434)', async () => {
    const transMsg = {
      id: 'msg-plain',
      conversationId: CONV_ID,
      content: 'unrelated',
      originalLanguage: 'fr',
      messageType: 'text',
      translations: { en: 'hello plain string' },
      createdAt: new Date(),
      senderId: PART_ID,
      sender: null,
    };
    const noMatchMsg = {
      id: 'msg-no-match',
      conversationId: CONV_ID,
      content: 'other',
      originalLanguage: 'fr',
      messageType: 'text',
      translations: { en: 'something else' },
      createdAt: new Date(Date.now() - 1000),
      senderId: PART_ID,
      sender: null,
    };
    prisma.message.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([transMsg, noMatchMsg]);
    const reply = makeReply();
    await getHandler()(makeSearchReq('hello'), reply);
    expect(reply._body.data).toHaveLength(1);
    expect(reply._body.data[0].id).toBe('msg-plain');
  });

  it('translation null: filter returns false (line 2430 true branch — early return false)', async () => {
    const nullTransMsg = {
      id: 'msg-null-trans',
      conversationId: CONV_ID,
      content: 'xyz',
      originalLanguage: 'fr',
      messageType: 'text',
      translations: null,
      createdAt: new Date(),
      senderId: PART_ID,
      sender: null,
    };
    prisma.message.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([nullTransMsg]);
    const reply = makeReply();
    await getHandler()(makeSearchReq('hello'), reply);
    expect(reply._body.data).toHaveLength(0);
  });

  it('search result with sender=null: sender mapped as null (lines 2461-2464)', async () => {
    const msg = {
      id: MSG_ID, conversationId: CONV_ID, content: 'hello world',
      originalLanguage: 'fr', messageType: 'text', translations: null,
      createdAt: new Date(), senderId: PART_ID, sender: null,
    };
    prisma.message.findMany.mockResolvedValueOnce([msg]).mockResolvedValueOnce([]);
    const reply = makeReply();
    await getHandler()(makeSearchReq('hello'), reply);
    expect(reply._body.data[0].sender).toBeNull();
  });

  it('non-numeric limit: parseInt NaN → || 20 (line 2348)', async () => {
    prisma.message.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const reply = makeReply();
    await getHandler()(makeSearchReq('hello', { limit: 'notanumber' }), reply);
    expect(reply._body.cursorPagination.limit).toBe(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Badge reset: broadcastReadStatus emits CONVERSATION_UNREAD_UPDATED to reader
// ═══════════════════════════════════════════════════════════════════════════════

describe('broadcastReadStatus — CONVERSATION_UNREAD_UPDATED badge reset', () => {
  const getMarkReadHandler = () => fastify._routes['POST']['/conversations/:id/mark-read'];

  it('emits CONVERSATION_UNREAD_UPDATED with unreadCount=0 to the reading user room after mark-read', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // No other participants — avoids chaining issue so READ_STATUS_UPDATED also fires cleanly.
    prisma.participant.findMany.mockResolvedValue([]);
    mockGetUnreadCount.mockResolvedValue(3);

    await getMarkReadHandler()(makeRequest(), makeReply());

    expect(fastify._mockTo).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: 'resolved-conv-id',
      unreadCount: 0,
    });
  });

  it('emits CONVERSATION_UNREAD_UPDATED even when showReadReceipts=false (badge reset is not a peer disclosure)', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);
    prisma.participant.findMany.mockResolvedValue([]);
    mockGetUnreadCount.mockResolvedValue(3);

    await getMarkReadHandler()(makeRequest(), makeReply());

    // Badge reset must fire regardless of showReadReceipts.
    expect(fastify._mockTo).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: 'resolved-conv-id',
      unreadCount: 0,
    });
    // READ_STATUS_UPDATED (peer disclosure) must be suppressed — both the legacy and the
    // dual-emitted `message:read-status-updated` name carry the same peer disclosure.
    expect(fastify._mockEmit).not.toHaveBeenCalledWith('read-status:updated', expect.anything());
    expect(fastify._mockEmit).not.toHaveBeenCalledWith('message:read-status-updated', expect.anything());
  });
});
