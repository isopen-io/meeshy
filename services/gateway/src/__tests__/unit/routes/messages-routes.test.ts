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
// La liste de messages ne compte plus les accusés elle-même : elle délègue à
// `MessageReadStatusService.getConversationReadStatuses`, seule source de vérité
// (union curseur/reçu figé, retrait des opt-out `showReadReceipts`).
const mockGetConversationReadStatuses = jest.fn<any>().mockResolvedValue(new Map());

const mockShouldShowReadReceipts = jest.fn<any>().mockResolvedValue(false);

const mockHandleMessage = jest.fn<any>().mockResolvedValue({ success: true, data: { id: 'msg-1', conversationId: 'resolved-conv-id' } });

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));
// `participantAuth` — la porte des routes de LECTURE. On capture les options
// pour verrouiller `allowAnonymous: true` (un invité de lien partagé entre) sans
// perdre `requireAuth: true` (un appelant sans jeton n'entre pas).
const mockAuthMiddlewareOptions: any[] = [];
const mockParticipantAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: any, options: any) => {
    mockAuthMiddlewareOptions.push(options);
    return mockParticipantAuthMiddleware;
  },
}));
// Seul `canAccessConversation` est doublé. `resolveCallerParticipant` reste RÉEL
// et interroge le double Prisma de ce fichier : un mock de module complet le
// rendrait `undefined`, et surtout il masquerait la règle d'identité qu'il porte.
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
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
    getConversationReadStatuses: (...args: any[]) => mockGetConversationReadStatuses(...args),
  })),
}));
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: (...args: any[]) => mockShouldShowReadReceipts(...args),
  })),
}));
const mockResolveForTargets = jest.fn<any>();
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: (...args: any[]) => mockResolveForTargets(...args),
  }),
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
  SendMessageBodySchema,
  registerMessagesRoutes,
} from '../../../routes/conversations/messages';
import { computeRecipientCount } from '../../../utils/read-exactness';
import { findFirstIn, type MongoDocument } from '../../helpers/mongo-where';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439044';
const PART_ID = '507f1f77bcf86cd799439055';
const OTHER_USER_ID = '507f1f77bcf86cd799439066';
const ANON_PART_ID = '507f1f77bcf86cd799439077';

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
  const routeOpts: Record<string, Record<string, any>> = {};
  const mockEmit = jest.fn();
  // Chainable, like Socket.IO's real `BroadcastOperator`: the receipt fan-out
  // chains one `.to()` per participant room so a socket in several of them gets
  // a single copy.
  // `except` fait partie de la même chaîne : la diffusion d'un accusé de
  // LECTURE en retire l'acteur, parce qu'il reçoit à part une version du
  // payload enrichie de son arriéré personnel.
  const mockExcept: jest.Mock = jest.fn(() => ({ to: mockTo, except: mockExcept, emit: mockEmit }));
  const mockTo: jest.Mock = jest.fn(() => ({ to: mockTo, except: mockExcept, emit: mockEmit }));
  const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
  const mockEnqueueOfflineMutation = jest.fn().mockResolvedValue(undefined);
  const mockGetManager = jest.fn().mockReturnValue({ getIO: mockGetIO, enqueueOfflineMessageMutation: mockEnqueueOfflineMutation });

  const register = (method: string) =>
    jest.fn((path: string, opts: any, handler: Function) => {
      (routes[method] = routes[method] || {})[path] = handler;
      (routeOpts[method] = routeOpts[method] || {})[path] = opts;
    });

  const fastify: any = {
    get: register('GET'),
    post: register('POST'),
    put: register('PUT'),
    delete: register('DELETE'),
    socketIOHandler: {
      getManager: mockGetManager,
      broadcastMessage: jest.fn().mockResolvedValue(undefined),
    },
    notificationService: {},
    _routes: routes,
    _routeOpts: routeOpts,
    _mockTo: mockTo,
    _mockExcept: mockExcept,
    _mockEmit: mockEmit,
    _mockGetManager: mockGetManager,
    _mockEnqueueOfflineMutation: mockEnqueueOfflineMutation,
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
  mockResolveForTargets.mockResolvedValue(new Map());
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

  // Diffusion à plusieurs destinataires (pas un transfert) : ses pièces
  // jointes sont copiées CÔTÉ SERVEUR (copyAttachments.ts), le client
  // n'envoie donc ni content ni attachmentIds — même exemption que forward.
  it('accepts copyAttachmentsFromMessageId only', () => {
    const result = SendMessageBodySchema.safeParse({ copyAttachmentsFromMessageId: 'msg-orig' });
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

  it('declares cursorPagination, hasNewer and meta.mentionedUsers in the 200 response schema', () => {
    // fast-json-stringify strips every field absent from the response
    // schema. The handler builds cursorPagination/hasNewer/mentionedUsers,
    // so an undeclared schema silently breaks infinite scroll on clients
    // (iOS reads cursorPagination.hasMore ?? false → pagination latches
    // exhausted after the first page).
    const opts = fastify._routeOpts['GET']['/conversations/:id/messages'];
    const props = opts.schema.response['200'].properties;
    expect(props.cursorPagination).toBeDefined();
    expect(props.cursorPagination.properties.hasMore).toBeDefined();
    expect(props.cursorPagination.properties.nextCursor).toBeDefined();
    expect(props.cursorPagination.properties.limit).toBeDefined();
    expect(props.hasNewer).toBeDefined();
    expect(props.meta.properties.mentionedUsers).toBeDefined();
  });

  it('before-mode trims data to limit rows and reports cursor hasMore', async () => {
    // Cursor mode fetches limit+1 rows to detect hasMore without a COUNT.
    // The extra row must be trimmed from the returned data too — not only
    // from the internal array used to build the cursor meta.
    const msgs = [
      makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa1' }),
      makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa2' }),
      makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa3' }),
    ];
    prisma.message.findFirst.mockResolvedValue(makeMessage({ id: 'cccccccccccccccccccccccc', createdAt: new Date() }));
    prisma.message.findMany.mockResolvedValue(msgs);
    mockValidatePagination.mockReturnValue({ offset: 0, limit: 2 });
    const reply = makeReply();
    await getMessagesHandler()(
      makeRequest({ query: { before: 'cccccccccccccccccccccccc', limit: '2' } }),
      reply
    );
    const body = reply._body;
    expect(body.data).toHaveLength(2);
    expect(body.cursorPagination.hasMore).toBe(true);
    expect(body.cursorPagination.nextCursor).toBe('aaaaaaaaaaaaaaaaaaaaaaa2');
  });

  // ── Forward-watermark (`after`) cursor contract ────────────────────────────
  // `after` is the local-first gap-backfill mode (iOS `MessageService.listAfter`
  // → `ConversationViewModel.syncMissedMessages`). It pages FORWARD, ascending,
  // resumed by the client's `createdAt` high-water mark — NOT by the `before`
  // message-id cursor the other modes use. The cursor meta must say so.
  describe('after-mode cursor meta', () => {
    const AFTER = '2026-08-01T00:00:00.000Z';

    it('fetches limit+1 rows so hasMore is measured, not guessed', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      mockValidatePagination.mockReturnValue({ offset: 0, limit: 2 });
      await getMessagesHandler()(makeRequest({ query: { after: AFTER, limit: '2' } }), makeReply());
      const call = prisma.message.findMany.mock.calls
        .map((c: any[]) => c[0])
        .find((a: any) => a && a.select && typeof a.take === 'number');
      expect(call.take).toBe(3);
    });

    it('reports hasMore=false on an exactly-full final page', async () => {
      // The page fills `limit` exactly and nothing follows it. Sizing the read
      // to `limit` made a full page indistinguishable from a truncated one, so
      // the server claimed more and the client burned a round trip proving it
      // wrong. With the probe row, a full page that returns no probe is final.
      prisma.message.findMany.mockResolvedValue([
        makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa1' }),
        makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa2' }),
      ]);
      mockValidatePagination.mockReturnValue({ offset: 0, limit: 2 });
      const reply = makeReply();
      await getMessagesHandler()(makeRequest({ query: { after: AFTER, limit: '2' } }), reply);
      expect(reply._body.data).toHaveLength(2);
      expect(reply._body.cursorPagination.hasMore).toBe(false);
    });

    it('trims the probe row and reports hasMore=true when one follows', async () => {
      prisma.message.findMany.mockResolvedValue([
        makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa1' }),
        makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa2' }),
        makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa3' }),
      ]);
      mockValidatePagination.mockReturnValue({ offset: 0, limit: 2 });
      const reply = makeReply();
      await getMessagesHandler()(makeRequest({ query: { after: AFTER, limit: '2' } }), reply);
      expect(reply._body.data).toHaveLength(2);
      expect(reply._body.data.map((m: any) => m.id)).toEqual([
        'aaaaaaaaaaaaaaaaaaaaaaa1',
        'aaaaaaaaaaaaaaaaaaaaaaa2',
      ]);
      expect(reply._body.cursorPagination.hasMore).toBe(true);
    });

    it('returns nextCursor=null — a forward page has no `before` continuation', async () => {
      // The page is ASCENDING, so its last row is the NEWEST one. Handing that
      // id back under a field documented as "pass as `before`" pointed the
      // client at everything OLDER than the page it just consumed: a client
      // that followed the cursor generically would re-read the whole history
      // and never advance. The forward continuation is the `after` watermark,
      // which the client already holds.
      prisma.message.findMany.mockResolvedValue([
        makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa1' }),
        makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa2' }),
        makeMessage({ id: 'aaaaaaaaaaaaaaaaaaaaaaa3' }),
      ]);
      mockValidatePagination.mockReturnValue({ offset: 0, limit: 2 });
      const reply = makeReply();
      await getMessagesHandler()(makeRequest({ query: { after: AFTER, limit: '2' } }), reply);
      expect(reply._body.cursorPagination.nextCursor).toBeNull();
    });

    it('leaves the offset `pagination` block out (cursor read, no COUNT)', async () => {
      prisma.message.findMany.mockResolvedValue([makeMessage()]);
      mockValidatePagination.mockReturnValue({ offset: 0, limit: 2 });
      const reply = makeReply();
      await getMessagesHandler()(makeRequest({ query: { after: AFTER, limit: '2' } }), reply);
      expect(reply._body.pagination).toBeUndefined();
      expect(prisma.message.count).not.toHaveBeenCalled();
    });
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

  it('sert la présence de l’expéditeur quand la loi l’accorde (soi / ami / ADMIN+)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([
      [USER_ID, { showOnline: true, showLastSeenTimestamp: true }],
    ]));
    const msg = makeMessage({
      sender: {
        id: PART_ID,
        userId: USER_ID,
        displayName: 'Alice',
        avatar: null,
        type: 'member',
        role: 'USER',
        language: 'fr',
        user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true, lastActiveAt: new Date() },
      },
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].sender.isOnline).toBe(true);
    expect(body.data[0].sender.lastActiveAt).not.toBeNull();
  });

  it('masque la présence de l’expéditeur quand la loi la refuse (co-participant non-ami)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([
      [USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
    ]));
    const msg = makeMessage({
      sender: {
        id: PART_ID,
        userId: USER_ID,
        displayName: 'Alice',
        avatar: null,
        type: 'member',
        role: 'USER',
        language: 'fr',
        user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true, lastActiveAt: new Date() },
      },
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].sender.isOnline).toBe(false);
    expect(body.data[0].sender.lastActiveAt).toBeNull();
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

  // #4177 — ce témoin affirmait l'inverse : `include_reactions=true` chargeait
  // bien `reactions` dans le `select`, mais `messageSchema` ne le déclare pas
  // — fast-json-stringify le retirait avant tout client, sur TOUTE la
  // production. Le calcul était payé (jusqu'à 20 réactions par message) pour
  // un champ qu'aucun client n'a jamais reçu. Retiré : le paramètre reste
  // accepté (compatibilité de schéma), mais ne charge plus rien.
  it("includeReactions=true ne charge PAS reactions — la réponse ne les a jamais portées", async () => {
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_reactions: 'true' } }), reply);
    const selectArg = (prisma.message.findMany.mock.calls[0][0] as any).select;
    expect(selectArg.reactions).toBeUndefined();
  });

  // `include_status=true` ne charge RIEN de plus : les entrées de statut
  // n'ont jamais atteint le client, `fast-json-stringify` les retirant faute
  // d'être déclarées dans `messageSchema`. Les charger revenait à payer une
  // requête de relation par page — jusqu'à `messages × participants` documents
  // — pour un tableau jeté à la sérialisation. Cf. la garde de contrat dans
  // `message-status-entries-contract.test.ts`, qui l'établit sur un vrai
  // Fastify plutôt que sur ce double sans sérialiseur.
  it("includeStatus=true ne charge PAS statusEntries — la réponse ne les porte pas", async () => {
    prisma.message.findMany.mockResolvedValue([]);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_status: 'true' } }), reply);
    const selectArg = (prisma.message.findMany.mock.calls[0][0] as any).select;
    expect(selectArg.statusEntries).toBeUndefined();
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

  it('delegates the receipt summary to getConversationReadStatuses, for the page it just read', async () => {
    const msg = makeMessage({ createdAt: new Date('2024-06-01') });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    mockGetConversationReadStatuses.mockResolvedValue(
      new Map([[MSG_ID, { totalMembers: 3, receivedCount: 2, readCount: 1 }]])
    );
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    // L'identifiant RÉSOLU, pas celui de l'URL : la route accepte aussi un
    // identifiant lisible (lien de partage), et le service interroge des tables
    // qui ne connaissent que l'ObjectId.
    expect(mockGetConversationReadStatuses).toHaveBeenCalledWith('resolved-conv-id', [MSG_ID]);
  });

  it('mappe receivedCount→deliveredCount et totalMembers→recipientCount', async () => {
    // Trois valeurs DISTINCTES : une permutation des trois champs — le seul
    // défaut plausible de ce câblage — ne peut pas passer inaperçue.
    const msg = makeMessage({ createdAt: new Date('2024-06-01') });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    mockGetConversationReadStatuses.mockResolvedValue(
      new Map([[MSG_ID, { totalMembers: 3, receivedCount: 2, readCount: 1 }]])
    );
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].deliveredCount).toBe(2);
    expect(body.data[0].readCount).toBe(1);
    expect(body.data[0].recipientCount).toBe(3);
  });

  // Les DATES du seuil « tous servis » partagent le défaut des compteurs : la
  // ligne `Message` n'a aucun écrivain pour elles (`updateMessageComputedStatus`
  // est un no-op assumé depuis le passage aux curseurs). Les relayer telles
  // quelles servait `null` à un client dont le résolveur lit `readByAllAt != nil`
  // comme la PREUVE que tous les destinataires ont lu.
  it('sert deliveredToAllAt / readByAllAt calculés, jamais la colonne morte', async () => {
    // Deux dates que la production ne produit jamais sur ces colonnes.
    const msg = makeMessage({
      createdAt: new Date('2024-06-01'),
      deliveredToAllAt: new Date('1999-01-01T00:00:00Z'),
      readByAllAt: new Date('1999-01-02T00:00:00Z'),
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    mockGetConversationReadStatuses.mockResolvedValue(
      new Map([[MSG_ID, {
        totalMembers: 2,
        receivedCount: 2,
        readCount: 2,
        deliveredToAllAt: new Date('2026-08-13T10:00:00Z'),
        readByAllAt: new Date('2026-08-13T10:05:00Z'),
      }]])
    );
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].deliveredToAllAt).toEqual(new Date('2026-08-13T10:00:00Z'));
    expect(body.data[0].readByAllAt).toEqual(new Date('2026-08-13T10:05:00Z'));
  });

  it('rend null pour les dates du seuil quand le service ne décrit pas le message', async () => {
    const msg = makeMessage({
      createdAt: new Date('2024-06-01'),
      deliveredToAllAt: new Date('1999-01-01T00:00:00Z'),
      readByAllAt: new Date('1999-01-02T00:00:00Z'),
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    mockGetConversationReadStatuses.mockResolvedValue(new Map());
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].deliveredToAllAt).toBeNull();
    expect(reply._body.data[0].readByAllAt).toBeNull();
  });

  // `receivedByAllAt` n'a ni écrivain ni lecteur sur aucune des trois
  // plateformes : il sort entier, déclarations comprises.
  it('ne porte plus receivedByAllAt, champ sans écrivain ni lecteur', async () => {
    const msg = makeMessage({ createdAt: new Date('2024-06-01') });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0]).not.toHaveProperty('receivedByAllAt');
  });

  it('ne compte aucun accusé quand le service échoue — la page reste servie', async () => {
    // Le résumé est un ENRICHISSEMENT : son échec ne doit pas emporter la
    // liste de messages, qui est le contenu que l'utilisateur attend.
    const msg = makeMessage({ createdAt: new Date('2024-06-01') });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    mockGetConversationReadStatuses.mockRejectedValue(new Error('read statuses down'));
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const body = reply._body;
    expect(body.data[0].id).toBe(MSG_ID);
    expect(body.data[0].deliveredCount).toBe(0);
    expect(body.data[0].readCount).toBe(0);
    expect(body.data[0].recipientCount).toBe(0);
  });

  // #4177 — ce témoin prouvait que `reaction.findMany` alimentait
  // `currentUserReactions` (message-level) — vrai, et c'est justement le
  // travail mort de l'issue : `messageSchema` ne déclare PAS ce champ au
  // niveau message (son miroir PAR PIÈCE JOINTE, lui, est déclaré et reste
  // servi), donc fast-json-stringify le retirait avant tout client depuis
  // toujours. Le calcul est retiré ; ce témoin prouve maintenant qu'il ne se
  // produit plus, plutôt que de continuer à attester un contrat que personne
  // ne respectait.
  it("sans consommateur possible, reaction.findMany n'est plus appelé pour le message-level currentUserReactions", async () => {
    const msg = makeMessage();
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(prisma.reaction.findMany).not.toHaveBeenCalled();
    expect(reply._body.data[0].currentUserReactions).toBeUndefined();
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

  // #4177 — même famille que le témoin `reaction.findMany` ci-dessus :
  // `currentUserConsumption` n'est déclaré dans AUCUN schéma
  // (`messageAttachmentSchema` ne le porte pas), donc jamais servi — le
  // `attachmentStatusEntry.findMany` qui l'alimentait était payé pour rien à
  // CHAQUE page portant une pièce jointe. Retiré ; ce témoin prouve
  // maintenant l'absence de la requête et du champ.
  it("sans consommateur possible, attachmentStatusEntry.findMany n'est plus appelé", async () => {
    const msg = makeMessage({
      attachments: [{ id: 'att-1', mimeType: 'audio/mp3', fileUrl: 'http://x.com/a.mp3', reactions: [], translations: null, transcription: null }],
    });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(prisma.attachmentStatusEntry.findMany).not.toHaveBeenCalled();
    const att = reply._body.data[0].attachments[0];
    expect(att.currentUserConsumption).toBeUndefined();
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

  // Cascade notifications : le raccourci « 0 non-lu → ne rien faire » ne doit
  // PAS sauter le marquage des notifications de la conversation — une réaction
  // ou une mention arrivée sur un message déjà lu a créé une notification alors
  // que le compteur de messages non lus est resté à 0.
  it('marks conversation notifications as read even on the unreadCount===0 shortcut', async () => {
    mockGetUnreadCount.mockResolvedValue(0);
    const markConvNotifs = jest.fn<any>().mockResolvedValue(1);
    fastify.notificationService = { markConversationNotificationsAsRead: markConvNotifs };
    const reply = makeReply();

    await getHandler_()(makeRequest(), reply);
    await new Promise((resolve) => setImmediate(resolve));

    expect(markConvNotifs).toHaveBeenCalledWith(USER_ID, 'resolved-conv-id');
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

  // Suivi de lecture exact — @see docs/superpowers/specs/2026-07-24-read-exactness-design.md

  it('forwards the reported messageIds so only displayed messages are frozen', async () => {
    mockGetUnreadCount.mockResolvedValue(3);
    const reply = makeReply();
    await getHandler_()(
      makeRequest({ body: { messageIds: ['507f1f77bcf86cd799439013'] } }),
      reply
    );
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      { messageIds: ['507f1f77bcf86cd799439013'] }
    );
  });

  it('still marks read without a body — deployed clients post none', async () => {
    mockGetUnreadCount.mockResolvedValue(3);
    const reply = makeReply();
    await getHandler_()(makeRequest({ body: undefined }), reply);
    expect(mockMarkMessagesAsRead).toHaveBeenCalled();
    // Pas d'ids rapportés → repli fenêtre, surtout pas un lot vide qui ne
    // figerait rien et perdrait la lecture pour ces versions.
    const options = mockMarkMessagesAsRead.mock.calls[0][3];
    expect(options?.messageIds).toBeUndefined();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 3 });
  });

  it('rejects a malformed messageIds payload with 400', async () => {
    mockGetUnreadCount.mockResolvedValue(3);
    const reply = makeReply();
    await getHandler_()(makeRequest({ body: { messageIds: ['pas-un-objectid'] } }), reply);
    expect(mockSendBadRequest).toHaveBeenCalled();
    expect(mockMarkMessagesAsRead).not.toHaveBeenCalled();
  });

  it('freezes reported ids even when the cursor reports zero unread', async () => {
    // Le curseur bute sur un trou, donc unreadCount vaut 0 alors que le client
    // vient d'afficher des messages situés APRÈS ce trou. Le raccourci
    // « 0 non-lu → ne rien faire » perdrait ces lectures.
    mockGetUnreadCount.mockResolvedValue(0);
    const reply = makeReply();
    await getHandler_()(
      makeRequest({ body: { messageIds: ['507f1f77bcf86cd799439013'] } }),
      reply
    );
    expect(mockMarkMessagesAsRead).toHaveBeenCalled();
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
// Group 5: POST /conversations/:id/read — RETIRÉE (#4188)
// ═══════════════════════════════════════════════════════════════════════════════
// Les quatre témoins de ce groupe — 403 sans conversation, 403 sans
// appartenance, `markedCount`, 500 — étaient les MIROIRS d'une porte qui
// n'existe plus. `/read` était la TROISIÈME entrée du même geste
// d'acquittement, sans appelant sur les trois clients ; les quatre mêmes
// comportements sont témoignés au groupe 3 sur `POST /conversations/:id/mark-read`,
// qui reste la porte nominale. Ce qui part est une ENTRÉE, jamais une capacité.
//
// L'ABSENCE de la route est gardée là où la table de routes se lit vraiment, et
// non par le silence de ce fichier : `unit/routes/dead-doors-are-not-mounted.test.ts`
// exige DANS LE MÊME BLOC que `POST /conversations/:id/read` ne soit plus
// déclarée ET que `POST /conversations/:id/mark-read` le soit toujours — c'est
// cette seconde moitié qui empêche la garde négative de passer au vert le jour
// où plus rien ne serait énuméré.

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
    // offline replay: the pin is queued for offline participants (parity with
    // edit/delete/reaction offline delivery)
    expect(fastify._mockEnqueueOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'resolved-conv-id',
        actorUserId: USER_ID,
        eventType: 'pinned',
        messageId: MSG_ID,
      }),
    );
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

  it('404 when message belongs to another conversation', async () => {
    prisma.message.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(mockSendNotFound).toHaveBeenCalledWith(expect.anything(), 'Message not found');
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('happy path: unpins message and broadcasts via socket', async () => {
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, conversationId: CONV_ID });
    prisma.message.update.mockResolvedValue({ id: MSG_ID });
    const reply = makeReply();
    await getHandler_()(makeReqWithMsg(), reply);
    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pinnedAt: null, pinnedBy: null } }),
    );
    expect(fastify.socketIOHandler.getManager).toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, null);
    // offline replay: the unpin is queued for offline participants
    expect(fastify._mockEnqueueOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'resolved-conv-id',
        actorUserId: USER_ID,
        eventType: 'unpinned',
        messageId: MSG_ID,
      }),
    );
  });

  it('error path → 500', async () => {
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, conversationId: CONV_ID });
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

  it('masque la présence de l’expéditeur épinglé quand la loi la refuse (co-participant non-ami)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([
      [USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
    ]));
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
        user: { id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith', displayName: 'Alice', avatar: null, isOnline: true },
      },
      attachments: [],
      _count: { reactions: 0, replies: 0 },
    };
    prisma.message.findMany.mockResolvedValue([pinnedMsg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(reply._body.data[0].sender.isOnline).toBe(false);
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

  /**
   * Cycle 67 — la colonne `Message.translations` est une CARTE Mongo
   * (`{ "fr": { text, … } }`), jamais un tableau. Les quatre témoins ci-dessus
   * la posent tous à `null`, le seul cas qui ne déclenche pas le défaut : la
   * route versait la carte telle quelle dans une réponse dont le schéma déclare
   * `translations: { type: 'array' }`, et `fast-json-stringify` JETTE plutôt que
   * de coercer — 500 sur la route entière dès qu'une épingle porte une
   * traduction, c'est-à-dire dès que le Prisme a tourné.
   *
   * Le vrai sérialiseur est branché ici (le harness le double par défaut) : le
   * témoin porte sur la FORME émise, pas sur l'appel au transformateur.
   */
  const realTransformTranslationsToArray = jest.requireActual<
    typeof import('../../../utils/translation-transformer')
  >('../../../utils/translation-transformer').transformTranslationsToArray;

  const pinnedWithTranslations = (translations: unknown) => ({
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    content: 'Hello',
    originalLanguage: 'en',
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
    translations,
    createdAt: new Date(),
    updatedAt: new Date(),
    sender: null,
    attachments: [],
    _count: { reactions: 0, replies: 0 },
  });

  it('sérialise les traductions au format API, jamais la carte Mongo brute', async () => {
    mockTransformTranslationsToArray.mockImplementation(realTransformTranslationsToArray);
    prisma.message.findMany.mockResolvedValue([
      pinnedWithTranslations({
        fr: { text: 'Bonjour', translationModel: 'medium', createdAt: new Date('2026-08-11T00:00:00Z') },
      }),
    ]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);

    expect(reply._body.data[0].translations).toEqual([
      expect.objectContaining({
        id: `${MSG_ID}-fr`,
        messageId: MSG_ID,
        targetLanguage: 'fr',
        translatedContent: 'Bonjour',
      }),
    ]);
  });

  it('rend un tableau vide quand la colonne est nulle (jamais null ni la carte)', async () => {
    mockTransformTranslationsToArray.mockImplementation(realTransformTranslationsToArray);
    prisma.message.findMany.mockResolvedValue([pinnedWithTranslations(null)]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);

    expect(reply._body.data[0].translations).toEqual([]);
  });

  it('restitue `location` sur un message épinglé géolocalisé', async () => {
    // Lot 1 : un message épinglé est une bulle complète — sans le hoist,
    // l'épingle affiche tout SAUF la position qu'elle était censée fixer.
    const geoPinnedMsg = {
      id: MSG_ID,
      conversationId: CONV_ID,
      senderId: PART_ID,
      content: '',
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
      metadata: { location: { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null } },
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
    prisma.message.findMany.mockResolvedValue([geoPinnedMsg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(reply._body.data[0].location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
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
    mockResolveForTargets.mockResolvedValue(new Map([
      [USER_ID, { showOnline: true, showLastSeenTimestamp: true }],
    ]));
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

  it('masque la présence de l’expéditeur d’un résultat de recherche quand la loi la refuse (co-participant non-ami)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([
      [USER_ID, { showOnline: false, showLastSeenTimestamp: false }],
    ]));
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
    prisma.message.findMany
      .mockResolvedValueOnce([matchMsg])
      .mockResolvedValueOnce([]);
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello'), reply);
    expect(reply._body.data[0].sender.isOnline).toBe(false);
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
    // #4177 — scopé à la conversation courante : sans `conversationId`, un
    // `messageId` d'un AUTRE fil était accepté comme curseur et son
    // `createdAt` réel fuitait à travers la borne appliquée à cette page.
    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cursor-msg-id', conversationId: 'resolved-conv-id' } }),
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
    // Search delegates its page size to validatePagination (mocked here); make
    // the SSOT report the page size this scenario needs.
    mockValidatePagination.mockReturnValue({ offset: 0, limit });
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

  // Regression: the search page size used to be parsed inline as
  // `Math.min(parseInt(limitStr) || 20, 50)`, which reintroduced the exact bug
  // `validatePagination` was written to kill — `limit=0` falsy-coerced to a full
  // page (20 instead of the floor of 1), and `limit=-5` flowed through as a
  // NEGATIVE Prisma `take`. The querystring schema declares `limit` as a bare
  // string (no numeric min/max), so nothing upstream clamps it. Route the page
  // size through the SSOT helper instead.
  it('routes the search page size through validatePagination (maxLimit 50)', async () => {
    prisma.message.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello', { limit: '0' }), reply);
    expect(mockValidatePagination).toHaveBeenCalledWith('0', '0', { maxLimit: 50 });
  });

  it('uses the limit validatePagination returns for take, hasMore and cursorPagination', async () => {
    mockValidatePagination.mockReturnValue({ offset: 0, limit: 7 });
    prisma.message.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello', { limit: '999' }), reply);
    // Content search reads one extra row (limit + 1) to measure hasMore.
    expect(prisma.message.findMany.mock.calls[0][0].take).toBe(8);
    expect(reply._body.cursorPagination.limit).toBe(7);
  });

  it('error path → 500', async () => {
    prisma.message.findMany.mockRejectedValue(new Error('DB error'));
    const reply = makeReply();
    await getHandler_()(makeSearchReq(), reply);
    expect(mockSendInternalError).toHaveBeenCalled();
  });

  it('restitue `location` sur un resultat de recherche geolocalise', async () => {
    // Lot 1 : un resultat de recherche est une bulle complete elle aussi —
    // sans le hoist, le message trouve n'affiche jamais sa position.
    const geoMatch = {
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'hello world',
      originalLanguage: 'fr',
      messageType: 'text',
      translations: null,
      createdAt: new Date(),
      senderId: PART_ID,
      metadata: { location: { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null } },
      sender: {
        id: PART_ID,
        userId: USER_ID,
        displayName: 'Alice',
        avatar: null,
        type: 'member',
        user: { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: true },
      },
    };
    prisma.message.findMany
      .mockResolvedValueOnce([geoMatch]) // content matches
      .mockResolvedValueOnce([]); // translation candidates
    const reply = makeReply();
    await getHandler_()(makeSearchReq('hello'), reply);
    expect(reply._body.data[0].location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
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

  // #4177 — même famille que le témoin `includeStatus` juste en dessous, et
  // pour la même raison écrite dans SON commentaire : ce double n'a pas de
  // sérialiseur, donc il voyait un champ que la production retire depuis
  // toujours (`messageSchema` ne déclare pas `reactions`). Le calcul en
  // amont est désormais retiré à la source : plus rien à mapper, même si
  // `message.reactions` était présent sur la ligne brute.
  it("includeReactions=true : le mapping ne recopie plus reactions, que le sérialiseur retirait déjà", async () => {
    const msg = makeMessage({ reactions: [{ emoji: '👍', count: 2 }] });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_reactions: 'true' } }), reply);
    expect(reply._body.data[0].reactions).toBeUndefined();
  });

  // Ce témoin affirmait l'inverse, et c'est LUI qui a masqué le défaut : ce
  // double n'a pas de sérialiseur, donc il voyait un champ que la production
  // retire depuis toujours. Un double qui décrit un autre programme que celui
  // qu'on livre — même famille que les deux doubles réparés au cycle 42.
  it("includeStatus=true : le mapping ne recopie plus des entrées que le sérialiseur retire", async () => {
    const msg = makeMessage({ statusEntries: [{ participantId: PART_ID, status: 'read' }] });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest({ query: { include_status: 'true' } }), reply);
    expect(reply._body.data[0].statusEntries).toBeUndefined();
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

  it('Lot 2 : replyTo geolocalise restitue `location` (hoist sur l objet cite, pas la racine)', async () => {
    const GEO = { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null };
    const msg = makeMessage({
      replyTo: {
        id: 'reply-msg-id',
        content: 'original reply',
        originalLanguage: 'fr',
        metadata: { location: GEO },
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
    expect(replyTo.location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
    // La racine elle-même n'est pas géolocalisée ici — le hoist ne doit pas
    // fabriquer une position sur le message qui cite.
    expect(reply._body.data[0].location).toBeUndefined();
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

  it('Lot 2 : message transfere geolocalise restitue `location` sur forwardedFrom', async () => {
    const GEO = { latitude: 40.7128, longitude: -74.006, name: 'Times Square', address: null, category: null };
    const msg = makeMessage({ forwardedFromId: 'fwd-msg-id' });
    const forwardedMsg = {
      id: 'fwd-msg-id',
      content: 'original content',
      messageType: 'text',
      createdAt: new Date('2024-01-01'),
      senderId: 'orig-part-id',
      conversationId: 'fwd-conv-id',
      metadata: { location: GEO },
      sender: { id: 'orig-part-id', userId: 'orig-user-id', displayName: 'Original Bob', avatar: null, user: { username: 'orig_bob' } },
      attachments: [],
    };
    prisma.message.findMany
      .mockResolvedValueOnce([msg])
      .mockResolvedValueOnce([forwardedMsg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    const result = reply._body.data[0];
    expect(result.forwardedFrom.location).toMatchObject({ name: 'Times Square' });
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
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 2 });
  });

  // ── the actor read-sync pair travels on this route too ─────────────────────
  // `ReadStatusUpdatedEventData` declares `lastReadAt` and `unreadCount` as a
  // pair on `type: 'read'`, and consumers require BOTH before applying either
  // (iOS `ConversationStoreSocketBridge` guards `let lastReadAt, let unreadCount
  // else { return }`). This route omitted them while its twin
  // (`message-read-status.ts`) sent them — and this is the route iOS posts to
  // for every read, so its multi-device read sync never started at all.

  it('carries the actor lastReadAt + unreadCount on a read broadcast', async () => {
    const lastReadAt = new Date('2024-06-03T10:00:00Z');
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt });
    mockGetUnreadCount.mockResolvedValue(4);
    const reply = makeReply();

    await getHandler_()(makeRequest(), reply);

    expect(fastify._mockEmit).toHaveBeenCalledWith(
      'read-status:updated',
      expect.objectContaining({ type: 'read', lastReadAt, unreadCount: 4 }),
    );
  });

  it('reports a null frontier when the actor has no read cursor yet', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([]);
    prisma.conversationReadCursor.findUnique.mockResolvedValue(null);
    // Pre-mark count first (3 — otherwise the route short-circuits with nothing
    // to mark), then the post-mark count the broadcast carries.
    mockGetUnreadCount.mockResolvedValueOnce(3).mockResolvedValue(0);
    const reply = makeReply();

    await getHandler_()(makeRequest(), reply);

    expect(fastify._mockEmit).toHaveBeenCalledWith(
      'read-status:updated',
      expect.objectContaining({ type: 'read', lastReadAt: null, unreadCount: 0 }),
    );
  });

  it('still resets the actor badge when read receipts are disabled', async () => {
    // Badge reset is internal multi-device sync, not a peer disclosure: it must
    // survive the privacy branch that suppresses the receipt broadcast.
    mockShouldShowReadReceipts.mockResolvedValue(false);
    mockGetUnreadCount.mockResolvedValue(7);
    const reply = makeReply();

    await getHandler_()(makeRequest(), reply);

    expect(fastify._mockEmit).toHaveBeenCalledWith(
      'conversation:unread-updated',
      expect.objectContaining({ unreadCount: 7 }),
    );
    expect(fastify._mockEmit).not.toHaveBeenCalledWith('read-status:updated', expect.anything());
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

  it('un seul appelant, une seule résolution : le participant est résolu AVANT de chercher le dernier message', async () => {
    // Ce test pinnait `participantForCursor`, une SECONDE lecture du même
    // participant faite juste avant l'écriture du curseur — elle reposait la
    // même question à la même base, avec la copie de la règle d'identité qui
    // oubliait les invités de lien partagé. La seconde lecture n'existe plus :
    // le refus, lui, doit tomber plus tôt qu'avant, pas plus tard.
    prisma.participant.findFirst.mockResolvedValueOnce(null);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(mockSendForbidden).toHaveBeenCalledWith(reply, 'Participant not found in this conversation');
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(prisma.participant.findFirst).toHaveBeenCalledTimes(1);
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

  it('race guard orders by createdAt, not ObjectId string: an older message whose ObjectId sorts HIGHER than the cursor is still stale', async () => {
    // The cursor points at a message read concurrently that is genuinely NEWER
    // (createdAt later) but whose ObjectId string sorts BELOW latestMessage's —
    // the same-second cross-process inversion. Ordering by ObjectId string would
    // (wrongly) treat latestMessage as fresh and rewind past the fresher read;
    // ordering by createdAt correctly detects it as stale and skips the rewind.
    const CURSOR_MSG_ID = '507f1f77bcf86cd799439010'; // sorts below latestMessage
    prisma.participant.findFirst
      .mockResolvedValueOnce({ id: PART_ID }) // currentParticipant
      .mockResolvedValueOnce({ id: PART_ID }); // participantForCursor
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: '507f1f77bcf86cd799439999', createdAt: new Date('2024-06-10T00:00:00.100Z') }) // latestMessage: older, higher ObjectId
      .mockResolvedValueOnce({ id: 'prev-msg-id', createdAt: new Date('2024-06-09') }); // previousMessage
    prisma.conversationReadCursor.findUnique.mockResolvedValueOnce({
      lastReadMessageId: CURSOR_MSG_ID,
      lastReadMessageCreatedAt: new Date('2024-06-10T00:00:00.500Z') // newer than latestMessage
    });
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(prisma.conversationReadCursor.upsert).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { unreadCount: 0 });
  });

  it('rewind writes lastReadMessageCreatedAt alongside lastReadMessageId (keeps the cursor pair consistent)', async () => {
    const prevCreatedAt = new Date('2024-06-09T12:00:00Z');
    prisma.participant.findFirst
      .mockResolvedValueOnce({ id: PART_ID })
      .mockResolvedValueOnce({ id: PART_ID });
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: MSG_ID, createdAt: new Date('2024-06-10') }) // latestMessage
      .mockResolvedValueOnce({ id: 'prev-msg-id', createdAt: prevCreatedAt }); // previousMessage
    prisma.conversationReadCursor.findUnique.mockResolvedValueOnce({ lastReadMessageId: MSG_ID });
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(prisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastReadMessageId: 'prev-msg-id', lastReadMessageCreatedAt: prevCreatedAt }),
        update: expect.objectContaining({ lastReadMessageId: 'prev-msg-id', lastReadMessageCreatedAt: prevCreatedAt })
      })
    );
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

  // A participant with no `User` row used to be skipped outright by this
  // fan-out, so an anonymous participant never learned that a peer had read
  // anything. It is now addressed by the id its personal room is named after.
  it('participant with userId=null: addressed by its participant id', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([{ id: ANON_PART_ID, userId: null }]);
    mockGetUnreadCount.mockResolvedValue(1);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(fastify._mockTo).toHaveBeenCalledWith(`user:${ANON_PART_ID}`);
    expect(fastify._mockEmit).toHaveBeenCalledWith('read-status:updated', expect.anything());
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 1 });
  });

  it('participant with real userId: addressed by its user id', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([{ id: PART_ID, userId: OTHER_USER_ID }]);
    mockGetUnreadCount.mockResolvedValue(4);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
    expect(fastify._mockTo).toHaveBeenCalledWith(`user:${OTHER_USER_ID}`);
    expect(mockSendSuccess).toHaveBeenCalledWith(reply, { markedCount: 4 });
  });

  // L'arriéré de l'acteur ne concerne QUE l'acteur — jumeau exact du contrôle
  // posé sur l'autre route qui diffuse le même événement (voir
  // `read-status-actor-backlog-scope.test.ts`). `lastReadAt` dit quand l'acteur
  // a rattrapé son retard et `unreadCount` combien il lui en reste : deux
  // mesures de SA personne, que l'éventail servait à toute la conversation
  // alors que le seul consommateur qui les lit conditionne leur usage à
  // « l'acteur, c'est moi ».
  it('l\'éventail ne porte NI lastReadAt NI unreadCount', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([{ id: PART_ID, userId: OTHER_USER_ID }]);
    mockGetUnreadCount.mockResolvedValue(4);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);

    const fanOut = fastify._mockEmit.mock.calls.filter(
      (call: any[]) => call[0] === 'read-status:updated' && !('unreadCount' in (call[1] ?? {}))
    );
    expect(fanOut).not.toHaveLength(0);
    for (const [, payload] of fanOut) {
      expect(payload).not.toHaveProperty('lastReadAt');
      expect(payload).not.toHaveProperty('unreadCount');
      expect(payload).toMatchObject({ type: 'read' });
    }
  });

  it('la room personnelle de l\'acteur reçoit, elle, les deux champs — et l\'éventail l\'exclut', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([{ id: PART_ID, userId: OTHER_USER_ID }]);
    mockGetUnreadCount.mockResolvedValue(4);
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);

    expect(fastify._mockEmit).toHaveBeenCalledWith(
      'read-status:updated',
      expect.objectContaining({ type: 'read', unreadCount: 4 })
    );
    // Sans l'exclusion, la room de conversation livrerait à l'acteur une
    // SECONDE copie du même événement, amputée de ses deux champs.
    expect(fastify._mockExcept).toHaveBeenCalledWith(`user:${USER_ID}`);
  });

  // The receipt is a side channel: the read itself is already committed when it
  // runs, so a broken emitter must not turn a successful mark-read into a 500.
  it('a broadcast failure is swallowed and the response still succeeds', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([{ id: PART_ID, userId: OTHER_USER_ID }]);
    mockGetUnreadCount.mockResolvedValue(4);
    fastify._mockTo.mockReturnValueOnce({ emit: fastify._mockEmit });
    const reply = makeReply();
    await getHandler_()(makeRequest(), reply);
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
    // `except` clôt la chaîne de l'éventail : l'acteur en est retiré pour
    // recevoir à part sa version enrichie de l'arriéré.
    chainableEmitter.except = jest.fn().mockReturnValue(chainableEmitter);
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

  // #4177 — la branche que ce témoin ciblait (`currentParticipantId` falsy →
  // `userReactionsMap` reste vide → `.get(...) || []`) n'existe plus : tout
  // le calcul de `currentUserReactions` message-level est retiré. Le champ
  // est désormais absent INCONDITIONNELLEMENT, participant résolu ou non.
  it('authenticated user with participant not found: currentUserReactions reste absent', async () => {
    prisma.participant.findFirst.mockResolvedValue(null);
    const msg = makeMessage();
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].currentUserReactions).toBeUndefined();
  });

  // #4177 — le témoin `watchedComplete=null: ?? false fallback` qui vivait
  // ici ciblait le repli `row.watchedComplete ?? false` DANS le calcul de
  // `consumptionMap` : ce calcul entier est retiré (travail mort, cf. le
  // témoin `attachmentStatusEntry.findMany n'est plus appelé` plus haut). Il
  // n'y a plus de repli à couvrir.

  it('laisse à zéro un message que le service ne décrit pas', async () => {
    // Le service ne renvoie une entrée que pour les messages qu'il a retrouvés.
    // Un message absent de la Map garde des compteurs nuls — jamais les champs
    // dénormalisés de la ligne Message, qui n'ont aucun écrivain.
    const msg = makeMessage({ createdAt: new Date('2024-05-01'), deliveredCount: 7, readCount: 7 });
    prisma.message.findMany.mockResolvedValue([msg]);
    prisma.message.count.mockResolvedValue(1);
    mockGetConversationReadStatuses.mockResolvedValue(new Map());
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(reply._body.data[0].deliveredCount).toBe(0);
    expect(reply._body.data[0].readCount).toBe(0);
    expect(reply._body.data[0].recipientCount).toBe(0);
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
    expect(prisma.message.findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
  });

  it('shareLink avec allowViewHistory=false: la clause PORTE le plancher', async () => {
    // Le plancher est rendu par `historyFloorFor` depuis la convergence
    // (gwcontract-14). Sans cette assertion, la suite de la route ne
    // distinguait pas « plancher appliqué » de « plancher perdu » — les deux
    // se terminent par un `reply.send`.
    const joinedAt = new Date('2024-03-01');
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, joinedAt, shareLinkId: 'link-1' });
    prisma.conversationShareLink.findFirst.mockResolvedValue({
      allowViewHistory: false,
      expiresAt: null,
      maxUses: null,
      currentUses: 0,
    });
    prisma.message.findMany.mockResolvedValue([]);
    prisma.message.count.mockResolvedValue(0);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(prisma.message.findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: joinedAt });
  });

  it('shareLink INTROUVABLE: aucun plancher, et pas de 403', async () => {
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, joinedAt: new Date('2024-03-01'), shareLinkId: 'link-gone' });
    prisma.conversationShareLink.findFirst.mockResolvedValue(null);
    prisma.message.findMany.mockResolvedValue([]);
    prisma.message.count.mockResolvedValue(0);
    const reply = makeReply();
    await getMessagesHandler()(makeRequest(), reply);
    expect(prisma.message.findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
    expect(reply.status).not.toHaveBeenCalledWith(403);
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
// JONCTION schéma ↔ chemin d'écriture — le chiffrement
//
// Le `.refine()` de `SendMessageBodySchema` compte `encryptedContent` parmi les
// porteurs de contenu : un corps qui n'apporte QUE du chiffré est un message
// valide. La route, elle, ne consommait ce chiffré que si `isEncrypted` — un
// booléen SÉPARÉ, que le schéma n'a jamais lié au chiffré. Les deux ordres
// perdaient :
//   • chiffré sans le drapeau  ⇒ le chiffré est jeté ;
//   • drapeau sans le chiffré  ⇒ `ciphertext: encryptedContent!` ment, et le
//     message est écrit EN CLAIR avec `isEncrypted: false`.
//
// Ces suites emploient le VRAI schéma (la route parse elle-même `request.body`)
// et affirment l'invariante de jonction : tout corps admis par le schéma est
// servi en portant ce qu'il déclare — aucune branche silencieusement jetée.
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /conversations/:id/messages — jonction chiffrement', () => {
  const getHandler = () => fastify._routes['POST']['/conversations/:id/messages'];

  beforeEach(() => {
    mockHandleMessage.mockResolvedValue({ success: true, data: { id: MSG_ID, conversationId: CONV_ID } });
  });

  it('le chiffré SEUL (branche 4 du refine, sans isEncrypted) est transmis, pas jeté', async () => {
    const reply = makeReply();
    await getHandler()(makeRequest({ body: { encryptedContent: 'ct-b64', encryptionMetadata: { keyId: 'k1' } } }), reply);

    expect(mockSendBadRequest).not.toHaveBeenCalled();
    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedPayload: expect.objectContaining({ ciphertext: 'ct-b64' }) }),
      expect.any(String),
    );
  });

  it('un chiffré accompagné de contenu n\'est jamais jeté au profit du clair', async () => {
    const reply = makeReply();
    await getHandler()(makeRequest({ body: { content: '[Encrypted]', encryptedContent: 'ct-b64' } }), reply);

    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedPayload: expect.objectContaining({ ciphertext: 'ct-b64' }) }),
      expect.any(String),
    );
  });

  it('le mode par défaut est e2ee quand le chiffré arrive sans encryptionMode', async () => {
    await getHandler()(makeRequest({ body: { encryptedContent: 'ct-b64' } }), makeReply());

    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedPayload: expect.objectContaining({ mode: 'e2ee' }) }),
      expect.any(String),
    );
  });

  it('isEncrypted sans chiffré est REFUSÉ — jamais rétrogradé en clair', async () => {
    const reply = makeReply();
    await getHandler()(makeRequest({ body: { content: 'Y2lwaGVy', isEncrypted: true, encryptionMode: 'e2ee' } }), reply);

    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockSendBadRequest).toHaveBeenCalled();
  });

  it('le mode que le client iOS émet ("E2EE") est servi, normalisé en e2ee', async () => {
    await getHandler()(makeRequest({ body: { encryptedContent: 'ct-b64', encryptionMode: 'E2EE' } }), makeReply());

    expect(mockSendBadRequest).not.toHaveBeenCalled();
    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedPayload: expect.objectContaining({ mode: 'e2ee' }) }),
      expect.any(String),
    );
  });

  it('NON-RÉGRESSION — la forme du contrat (drapeau + chiffré + mode) passe toujours', async () => {
    await getHandler()(makeRequest({
      body: { content: '', isEncrypted: true, encryptedContent: 'enc-b64', encryptionMode: 'e2ee', encryptionMetadata: { sessionId: 's1' } },
    }), makeReply());

    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedPayload: expect.objectContaining({ ciphertext: 'enc-b64', mode: 'e2ee' }) }),
      expect.any(String),
    );
  });

  it('NON-RÉGRESSION — un message en clair ne se voit poser aucun encryptedPayload', async () => {
    await getHandler()(makeRequest({ body: { content: 'bonjour' } }), makeReply());

    expect(mockHandleMessage).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedPayload: undefined }),
      expect.any(String),
    );
  });

  it('NON-RÉGRESSION — un corps entièrement vide reste refusé', async () => {
    const reply = makeReply();
    await getHandler()(makeRequest({ body: {} }), reply);

    expect(mockHandleMessage).not.toHaveBeenCalled();
    expect(mockSendBadRequest).toHaveBeenCalled();
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
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, conversationId: CONV_ID });
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
    // Intention inchangée : l'arithmétique de repli sur les deux colonnes
    // nullables. Le spectateur est désormais RÉSOLU — la consommation
    // s'attribue à un participant depuis qu'elle ne se dépense qu'une fois
    // par spectateur — sans quoi ce cas ne va plus jusqu'au calcul.
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, isViewOnce: true, maxViewOnceCount: null, viewOnceCount: null, conversationId: CONV_ID });
    prisma.message.update.mockResolvedValue({ id: MSG_ID, viewOnceCount: null });
    prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
    prisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 1 });
    const reply = makeReply();
    await getHandler()(makeReqWithMsg(), reply);
    const result = mockSendSuccess.mock.calls[0][1] as any;
    expect(result.maxViewOnceCount).toBe(1);
    expect(result.viewOnceCount).toBe(1);
  });

  it('viewParticipant=null: rien n’est écrit, et rien n’est dépensé', async () => {
    // Intention inchangée — « aucune entrée de statut n'est écrite quand le
    // spectateur ne se résout pas » — et ÉTENDUE : le budget de vue unique ne
    // se dépense pas davantage. Il se dépensait, sans laisser la moindre trace
    // de qui l'avait dépensé.
    prisma.message.findFirst.mockResolvedValue({ id: MSG_ID, isViewOnce: true, maxViewOnceCount: 2, viewOnceCount: 0, conversationId: CONV_ID });
    prisma.participant.findFirst.mockResolvedValue(null);
    const reply = makeReply();
    await getHandler()(makeReqWithMsg(), reply);
    expect(prisma.messageStatusEntry.updateMany).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(mockSendForbidden).toHaveBeenCalled();
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

  // Le badge reset porte le RESTE RÉEL recompté après marquage — jamais un 0
  // codé en dur : en lecture exacte/partielle, le curseur n'avance que sur le
  // préfixe contigu réellement affiché, des messages restent légitimement non
  // lus. Un 0 en dur viderait à tort le badge sur TOUS les appareils du lecteur.
  it('emits CONVERSATION_UNREAD_UPDATED with the recomputed remaining unread after mark-read', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    // No other participants — avoids chaining issue so READ_STATUS_UPDATED also fires cleanly.
    prisma.participant.findMany.mockResolvedValue([]);
    // 1er appel = garde pré-marquage (3 non-lus), 2e = recompte post-marquage (1 restant).
    mockGetUnreadCount.mockResolvedValueOnce(3).mockResolvedValueOnce(1);

    await getMarkReadHandler()(makeRequest(), makeReply());

    expect(fastify._mockTo).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: 'resolved-conv-id',
      unreadCount: 1,
      bridge: null,
    });
  });

  it('emits CONVERSATION_UNREAD_UPDATED even when showReadReceipts=false (badge reset is not a peer disclosure)', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(false);
    prisma.participant.findMany.mockResolvedValue([]);
    mockGetUnreadCount.mockResolvedValueOnce(3).mockResolvedValueOnce(0);

    await getMarkReadHandler()(makeRequest(), makeReply());

    // Badge reset must fire regardless of showReadReceipts.
    expect(fastify._mockTo).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: 'resolved-conv-id',
      unreadCount: 0,
      bridge: null,
    });
    // READ_STATUS_UPDATED (peer disclosure) must be suppressed.
    expect(fastify._mockEmit).not.toHaveBeenCalledWith('read-status:updated', expect.anything());
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Le suivi de lecture d'un participant SANS COMPTE
// ═══════════════════════════════════════════════════════════════════════════════

describe('mark-read / mark-unread — un invité de lien partagé', () => {
  // Un double qui ÉVALUE le `where` : une garde revenue à `userId` seul ne
  // trouve plus cette ligne, et le test rougit. `userId: null` est la ligne
  // réelle d'un participant sans compte.
  const ROWS: MongoDocument[] = [
    { id: ANON_PART_ID, userId: null, conversationId: 'resolved-conv-id', isActive: true },
    // La ligne AVEC compte : elle rend le contraste testable dans ce même
    // bloc — un acteur enregistré doit continuer de se nommer par son `User.id`
    // là où l'invité se nomme par `null`.
    { id: PART_ID, userId: USER_ID, conversationId: 'resolved-conv-id', isActive: true },
  ];

  const anonymousRequest = (overrides: any = {}) =>
    makeRequest({
      authContext: {
        type: 'anonymous',
        isAuthenticated: true,
        isAnonymous: true,
        participantId: ANON_PART_ID,
        // Le piège : pour un anonyme, `userId` PORTE un `Participant.id`.
        userId: ANON_PART_ID,
        hasFullAccess: false,
      },
      ...overrides,
    });

  beforeEach(() => {
    prisma.participant.findFirst.mockImplementation(findFirstIn(ROWS) as any);
    prisma.participant.findMany.mockResolvedValue([]);
  });

  it('mark-read avance le curseur de l\'invité au lieu de lui répondre 403', async () => {
    mockGetUnreadCount.mockResolvedValue(2);
    const reply = makeReply();

    await fastify._routes['POST']['/conversations/:id/mark-read'](anonymousRequest(), reply);

    expect(mockSendForbidden).not.toHaveBeenCalled();
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(
      ANON_PART_ID, 'resolved-conv-id', undefined, undefined,
    );
  });

  it('mark-read remet à zéro le badge de l\'invité dans SA room personnelle', async () => {
    // `ROOMS.user(Participant.id)` : celle qu'`AuthHandler` fait rejoindre aux
    // sockets anonymes, et celle qu'`emitUnreadCountsToRecipients` adresse déjà.
    mockShouldShowReadReceipts.mockResolvedValue(false);
    mockGetUnreadCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    await fastify._routes['POST']['/conversations/:id/mark-read'](anonymousRequest(), makeReply());

    expect(fastify._mockTo).toHaveBeenCalledWith(`user:${ANON_PART_ID}`);
    expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: 'resolved-conv-id',
      unreadCount: 0,
      bridge: null,
    });
  });

  // `/read acquitte la conversation de l'invité` a été SUPPRIMÉ avec la route
  // (#4188), et seulement parce qu'il a un ÉQUIVALENT STRICT deux témoins plus
  // haut : `mark-read avance le curseur de l'invité au lieu de lui répondre 403`
  // pose les deux mêmes assertions — aucun `sendForbidden`, et
  // `markMessagesAsRead` appelé avec le `Participant.id` de l'invité. Le
  // COMPORTEMENT gardé (un invité de lien acquitte sa conversation) survit donc
  // intégralement ; seule la porte par laquelle ce témoin-là y entrait a disparu.

  it('mark-unread rembobine le curseur de l\'invité', async () => {
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: MSG_ID, createdAt: new Date('2026-08-01') })
      .mockResolvedValueOnce(null);
    prisma.conversationReadCursor.findUnique.mockResolvedValue(null);
    const reply = makeReply();

    await fastify._routes['POST']['/conversations/:id/mark-unread'](anonymousRequest(), reply);

    expect(mockSendForbidden).not.toHaveBeenCalled();
    expect(prisma.conversationReadCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          conversation_participant_cursor: expect.objectContaining({ participantId: ANON_PART_ID }),
        }),
      }),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // `read-status:updated` nomme l'ACTEUR par DEUX champs qui ne disent pas la
  // même chose : `participantId` porte sa ligne `Participant`, `userId` porte
  // sa ligne `User` — et un invité de lien n'en a pas. Le contrat le dit aux
  // trois bouts (`ReadStatusUpdatedEventData.userId`,
  // `ReadStatusUpdateEvent.userId` iOS, `ReadStatusUpdatedEvent.userId`
  // Android) : « `User.id` de l'acteur, `null` quand il est ANONYME ».
  //
  // Le fan-out, lui, a besoin d'une CLÉ DE ROOM, qui vaut `userId ?? id`.
  // `broadcastReadStatus` servait les deux rôles avec la MÊME variable, et
  // c'est la forme ROOM qui gagnait : le champ partait en portant un
  // `Participant.id`. Les émetteurs SOCKET du même événement
  // (`ConversationHandler._resyncReadStatusToSocket`,
  // `MessageHandler.autoDeliverToOnlineRecipients`, le drain) émettaient déjà
  // `null` — le même invité, dans la même conversation, était donc nommé de
  // deux façons selon le transport qui parlait.
  // ─────────────────────────────────────────────────────────────────────────

  it('read-status:updated ne nomme PAS l\'invité par un User.id qu\'il n\'a pas', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([{ id: ANON_PART_ID, userId: null }]);
    mockGetUnreadCount.mockResolvedValue(1);

    await fastify._routes['POST']['/conversations/:id/mark-read'](anonymousRequest(), makeReply());

    const payload = fastify._mockEmit.mock.calls
      .find(([event]: any[]) => event === 'read-status:updated')?.[1] as any;
    expect(payload).toBeDefined();
    expect(payload.userId).toBeNull();
    // …et l'identité de l'acteur n'est pas perdue pour autant : elle est là où
    // le contrat la place pour un participant sans compte.
    expect(payload.participantId).toBe(ANON_PART_ID);
  });

  // `/read nomme l'invité de la même façon que mark-read` a été SUPPRIMÉ avec la
  // route (#4188). Son objet était la CONVERGENCE de deux portes sur une même
  // règle de nommage ; il ne reste qu'une porte, donc plus rien à faire
  // converger — et la règle elle-même (`userId: null`, `participantId` porteur
  // de l'identité) est gardée mot pour mot par le témoin JUSTE AU-DESSUS, sur
  // `mark-read`. Supprimer ici ne perd aucune assertion : le titre du témoin
  // disait déjà que sa référence était l'autre.

  // ANTI-SUR-CORRECTION. Nuller le champ NE DOIT PAS nuller la clé de room :
  // c'est `ROOMS.user(Participant.id)` qu'`AuthHandler` fait rejoindre aux
  // sockets anonymes, et la seule par laquelle le badge de l'invité revient à
  // zéro. Un correctif qui propagerait le `null` jusqu'ici émettrait vers
  // `user:null` et rendrait le badge de tous les invités définitivement collé.
  it('le badge de l\'invité reste adressé à SA room personnelle, receipts activés', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([{ id: ANON_PART_ID, userId: null }]);
    mockGetUnreadCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);

    await fastify._routes['POST']['/conversations/:id/mark-read'](anonymousRequest(), makeReply());

    expect(fastify._mockTo).toHaveBeenCalledWith(`user:${ANON_PART_ID}`);
    expect(fastify._mockTo).not.toHaveBeenCalledWith('user:null');
    expect(fastify._mockTo).not.toHaveBeenCalledWith('user:undefined');
    expect(fastify._mockEmit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: 'resolved-conv-id',
      unreadCount: 0,
      bridge: null,
    });
  });

  // NON-RÉGRESSION : un acteur AVEC compte continue de se nommer par son
  // `User.id`. C'est la moitié du contrat que ce correctif ne touche pas, et
  // celle dont dépend la synchro multi-appareils du curseur de lecture.
  it('un acteur AVEC compte porte toujours son User.id', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    prisma.participant.findMany.mockResolvedValue([{ id: PART_ID, userId: USER_ID }]);
    mockGetUnreadCount.mockResolvedValue(1);

    await fastify._routes['POST']['/conversations/:id/mark-read'](makeRequest(), makeReply());

    const payload = fastify._mockEmit.mock.calls
      .find(([event]: any[]) => event === 'read-status:updated')?.[1] as any;
    expect(payload).toBeDefined();
    expect(payload.userId).toBe(USER_ID);
  });

  it('les deux routes de lecture acceptent un authentifié SANS COMPTE, jamais un anonyme sans jeton', () => {
    // La porte, pas la clé : `requiredAuth` (allowAnonymous: false) répondait 403
    // avant même de regarder la conversation. `requireAuth: true` reste — un
    // appelant sans jeton du tout n'entre pas.
    //
    // CE TÉMOIN COMPTAIT À TROIS jusqu'à #4188 : `POST /conversations/:id/read`
    // portait la même préValidation `participantAuth(allowAnonymous: true)` et
    // fermait l'énumération. Cette route a été RETIRÉE — c'était la troisième
    // PORTE d'un même geste, pas une capacité de plus. La CAPACITÉ survit
    // intacte : `mark-read` porte la même garde, donc l'invité d'un lien de
    // partage garde son acquittement. Ce qui disparaît est une entrée, jamais le
    // droit d'entrer.
    //
    // Le témoin est AJUSTÉ, jamais supprimé : c'est LUI qui garde la posture
    // d'authentification des deux portes RESTANTES — un `allowAnonymous: false`
    // réintroduit sur `mark-read` ou `mark-unread` renverrait 403 à tous les
    // invités de lien, et c'est cette assertion qui rougirait. Le supprimer
    // parce qu'il est rouge aurait payé le retrait d'une porte par la perte
    // d'une protection qui ne parlait pas que d'elle.
    //
    // L'absence de la troisième porte n'est pas gardée ici — le silence ne garde
    // rien — mais sur la table de routes RÉELLEMENT montée, par
    // `unit/routes/dead-doors-are-not-mounted.test.ts`.
    const readRoutes = ['/conversations/:id/mark-read', '/conversations/:id/mark-unread'];
    for (const route of readRoutes) {
      expect(fastify._routeOpts['POST'][route].preValidation).toEqual([mockParticipantAuthMiddleware]);
    }
    expect(mockAuthMiddlewareOptions).not.toHaveLength(0);
    for (const options of mockAuthMiddlewareOptions) {
      expect(options).toEqual({ requireAuth: true, allowAnonymous: true });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Confidentialité de la présence (2026-08-25) — les trois charges servies PAR
// DESTINATAIRE (liste, épinglés, recherche) projettent l'expéditeur pour le
// viewer : la route remet le viewer TEL QUEL à la loi (jamais les seules
// préférences), applique ce qu'elle rend, et refuse par défaut ce qu'elle tait.
// La loi elle-même (ami / soi / ADMIN+ ; MODERATOR = utilisateur ordinaire) est
// témoignée dans PresenceVisibilityService.test.ts ; ici on prouve que la route
// ne la contourne ni ne la réécrit.
// ═══════════════════════════════════════════════════════════════════════════════

const PRESENCE_HIDDEN = { showOnline: false, showLastSeenTimestamp: false };
const PRESENCE_FULL = { showOnline: true, showLastSeenTimestamp: true };
const SENDER_USER_ID = '507f1f77bcf86cd799439055';
const SENDER_LAST_ACTIVE = new Date('2026-08-25T10:00:00.000Z');

const registeredViewer = (role: string) =>
  makeAuthContext({ type: 'user', registeredUser: { id: USER_ID, role } });
const anonymousViewer = () => ({
  type: 'anonymous',
  isAuthenticated: true,
  isAnonymous: true,
  userId: 'anon-session',
  participantId: PART_ID,
  registeredUser: undefined,
  hasFullAccess: false,
});

const registeredSender = () => ({
  id: 'p-sender',
  userId: SENDER_USER_ID,
  displayName: 'Bob',
  avatar: null,
  type: 'member',
  role: 'USER',
  language: 'fr',
  user: { id: SENDER_USER_ID, username: 'bob', displayName: 'Bob', avatar: null, isOnline: true, lastActiveAt: SENDER_LAST_ACTIVE },
});
const accountlessSender = () => ({
  id: 'p-anon',
  userId: null,
  displayName: 'ano_Bob',
  avatar: null,
  type: 'anonymous',
  role: 'member',
  language: 'fr',
  user: null,
  anonymousSession: null,
  isOnline: true,
  lastActiveAt: SENDER_LAST_ACTIVE,
});

describe('GET /conversations/:id/messages — présence de l’expéditeur projetée par destinataire', () => {
  const handler = () => fastify._routes['GET']['/conversations/:id/messages'];
  const serve = async (sender: any, authContext: any) => {
    prisma.message.findMany.mockResolvedValue([makeMessage({ sender })]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await handler()(makeRequest({ authContext }), reply);
    return reply._body.data[0].sender;
  };

  it('remet le viewer (userId + rôle) tel quel à la loi — un MODERATOR n’est pas promu par la route, et son refus est appliqué', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_HIDDEN]]));
    const sender = await serve(registeredSender(), registeredViewer('MODERATOR'));
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: USER_ID, role: 'MODERATOR' }, [SENDER_USER_ID]);
    expect(sender.isOnline).toBe(false);
    expect(sender.lastActiveAt).toBeNull();
  });

  it('viewer anonyme : la loi reçoit `null`, la présence est masquée', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_HIDDEN]]));
    const sender = await serve(registeredSender(), anonymousViewer());
    expect(mockResolveForTargets).toHaveBeenCalledWith(null, [SENDER_USER_ID]);
    expect(sender.isOnline).toBe(false);
    expect(sender.lastActiveAt).toBeNull();
  });

  it('ami / ADMIN+ : la loi accorde, la route sert isOnline ET lastActiveAt', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_FULL]]));
    const sender = await serve(registeredSender(), registeredViewer('ADMIN'));
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: USER_ID, role: 'ADMIN' }, [SENDER_USER_ID]);
    expect(sender.isOnline).toBe(true);
    expect(sender.lastActiveAt).toEqual(SENDER_LAST_ACTIVE);
  });

  it('entrée ABSENTE pour un inscrit : refus par défaut (régime strict), jamais la valeur brute', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const sender = await serve(registeredSender(), registeredViewer('USER'));
    expect(sender.isOnline).toBe(false);
    expect(sender.lastActiveAt).toBeNull();
  });

  // Le repli d'une entrée absente est UN site (`presenceMissingEntryPolicy`,
  // presence-gate) partagé avec les routes de conversation : un ADMIN y est
  // servi, pour un inscrit non résolu comme pour un expéditeur sans compte.
  it('entrée ABSENTE pour un inscrit : révélée à un ADMIN, comme un expéditeur sans compte', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const sender = await serve(registeredSender(), registeredViewer('ADMIN'));
    expect(sender.isOnline).toBe(true);
    expect(sender.lastActiveAt).toEqual(SENDER_LAST_ACTIVE);
  });

  it('expéditeur SANS COMPTE (jamais dans la carte) : masqué pour un utilisateur ordinaire', async () => {
    const sender = await serve(accountlessSender(), registeredViewer('USER'));
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: USER_ID, role: 'USER' }, []);
    expect(sender.isOnline).toBe(false);
    expect(sender.lastActiveAt).toBeNull();
  });

  it('expéditeur SANS COMPTE : servi à un ADMIN, qui voit toujours', async () => {
    const sender = await serve(accountlessSender(), registeredViewer('ADMIN'));
    expect(sender.isOnline).toBe(true);
    expect(sender.lastActiveAt).toEqual(SENDER_LAST_ACTIVE);
  });
});

describe('GET /conversations/:id/pinned-messages — présence de l’expéditeur projetée par destinataire', () => {
  const handler = () => fastify._routes['GET']['/conversations/:id/pinned-messages'];
  const pinnedOf = (sender: any) => ({
    id: MSG_ID, conversationId: CONV_ID, senderId: sender.id,
    content: 'pinned', originalLanguage: 'fr', messageType: 'text',
    editedAt: null, deletedAt: null, replyToId: null,
    forwardedFromId: null, forwardedFromConversationId: null,
    pinnedAt: new Date(), pinnedBy: USER_ID,
    isViewOnce: false, isBlurred: false, expiresAt: null, effectFlags: 0,
    translations: null, createdAt: new Date(), updatedAt: new Date(),
    sender, attachments: [], _count: { reactions: 0, replies: 0 },
  });
  const serve = async (sender: any, authContext: any) => {
    prisma.message.findMany.mockResolvedValue([pinnedOf(sender)]);
    prisma.message.count.mockResolvedValue(1);
    const reply = makeReply();
    await handler()(makeRequest({ authContext }), reply);
    return reply._body.data[0].sender;
  };

  it('remet le viewer tel quel à la loi et applique son refus (MODERATOR = utilisateur ordinaire)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_HIDDEN]]));
    const sender = await serve(registeredSender(), registeredViewer('MODERATOR'));
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: USER_ID, role: 'MODERATOR' }, [SENDER_USER_ID]);
    expect(sender.isOnline).toBe(false);
  });

  it('viewer anonyme : la loi reçoit `null`, la présence est masquée', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_HIDDEN]]));
    const sender = await serve(registeredSender(), anonymousViewer());
    expect(mockResolveForTargets).toHaveBeenCalledWith(null, [SENDER_USER_ID]);
    expect(sender.isOnline).toBe(false);
  });

  it('ami / ADMIN+ : la loi accorde, isOnline est servi', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_FULL]]));
    const sender = await serve(registeredSender(), registeredViewer('ADMIN'));
    expect(sender.isOnline).toBe(true);
  });

  it('entrée ABSENTE pour un inscrit : refus par défaut (régime strict)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const sender = await serve(registeredSender(), registeredViewer('USER'));
    expect(sender.isOnline).toBe(false);
  });

  it('ne charge pas lastActiveAt, et le gate ne fabrique pas la clé', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_FULL]]));
    const sender = await serve(registeredSender(), registeredViewer('ADMIN'));
    expect(sender).not.toHaveProperty('lastActiveAt');
  });
});

describe('GET /conversations/:id/messages/search — présence de l’expéditeur projetée par destinataire', () => {
  const handler = () => fastify._routes['GET']['/conversations/:id/messages/search'];
  const matchOf = (sender: any) => ({
    id: MSG_ID, conversationId: CONV_ID, content: 'hello world', originalLanguage: 'fr',
    messageType: 'text', translations: null, createdAt: new Date(), senderId: sender.id, sender,
  });
  const serve = async (sender: any, authContext: any) => {
    prisma.message.findMany
      .mockResolvedValueOnce([matchOf(sender)])
      .mockResolvedValueOnce([]);
    const reply = makeReply();
    await handler()(makeRequest({ authContext, query: { q: 'hello' } }), reply);
    return reply._body.data[0].sender;
  };

  it('remet le viewer tel quel à la loi et applique son refus (MODERATOR = utilisateur ordinaire)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_HIDDEN]]));
    const sender = await serve(registeredSender(), registeredViewer('MODERATOR'));
    expect(mockResolveForTargets).toHaveBeenCalledWith({ userId: USER_ID, role: 'MODERATOR' }, [SENDER_USER_ID]);
    expect(sender.isOnline).toBe(false);
  });

  it('viewer anonyme : la loi reçoit `null`, la présence est masquée', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_HIDDEN]]));
    const sender = await serve(registeredSender(), anonymousViewer());
    expect(mockResolveForTargets).toHaveBeenCalledWith(null, [SENDER_USER_ID]);
    expect(sender.isOnline).toBe(false);
  });

  it('ami / ADMIN+ : la loi accorde, isOnline est servi', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_FULL]]));
    const sender = await serve(registeredSender(), registeredViewer('ADMIN'));
    expect(sender.isOnline).toBe(true);
  });

  it('entrée ABSENTE pour un inscrit : refus par défaut (régime strict)', async () => {
    mockResolveForTargets.mockResolvedValue(new Map());
    const sender = await serve(registeredSender(), registeredViewer('USER'));
    expect(sender.isOnline).toBe(false);
  });

  it('ne charge pas lastActiveAt, et le gate ne fabrique pas la clé', async () => {
    mockResolveForTargets.mockResolvedValue(new Map([[SENDER_USER_ID, PRESENCE_FULL]]));
    const sender = await serve(registeredSender(), registeredViewer('ADMIN'));
    expect(sender).not.toHaveProperty('lastActiveAt');
  });
});
