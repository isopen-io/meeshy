/**
 * @jest-environment node
 *
 * #7954 — un sticker SEUL (ni texte, ni pièce jointe) passe la garde de
 * longueur du transport socket `message:send`, comme un lieu seul : même loi
 * (`carriesNonTextBody`) que `MessageValidator.validateRequest`. Un sticker
 * INVALIDE seul reste refusé.
 *
 * Harnais repris de `MessageHandler.newcomerSlowMode.test.ts` (lui-même repris
 * de `MessageHandler.core.test.ts`, hors budget).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ============================================================
// MODULE MOCKS — must come before any imports
// ============================================================

// All mocks typed as jest.fn<() => any> to avoid TS2556 issues with spread args
const mockCheckLimit: any = jest.fn(async () => true);
const mockGetRateLimitInfo: any = jest.fn(() => ({ resetIn: 5000 }));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({
    checkLimit: (...a: any[]) => mockCheckLimit(...a),
    getRateLimitInfo: (...a: any[]) => mockGetRateLimitInfo(...a),
  }),
  SOCKET_RATE_LIMITS: { MESSAGE_SEND: 'message:send' },
}));

const mockValidateSocketEvent: any = jest.fn(() => ({ success: true, data: {} }));
jest.mock('../../../middleware/validation.js', () => ({
  validateSocketEvent: (...a: any[]) => mockValidateSocketEvent(...a),
}));

const mockValidateMessageLength: any = jest.fn(() => ({ isValid: true, error: undefined }));
jest.mock('../../../config/message-limits', () => ({
  validateMessageLength: (...a: any[]) => mockValidateMessageLength(...a),
}));

const mockGetConnectedUser: any = jest.fn(() => null);
const mockNormalizeConversationId: any = jest.fn(async () => 'conv-normalized');
jest.mock('../../../socketio/utils/socket-helpers', () => ({
  getConnectedUser: (...a: any[]) => mockGetConnectedUser(...a),
  normalizeConversationId: (...a: any[]) => mockNormalizeConversationId(...a),
  extractJWTToken: jest.fn(),
  extractSessionToken: jest.fn(),
}));

const mockResolveParticipant: any = jest.fn(async () => ({ participantId: 'participant-1' }));
jest.mock('../../../socketio/utils/participant-resolver.js', () => ({
  resolveParticipant: (...a: any[]) => mockResolveParticipant(...a),
}));

const mockConversationStatsUpdateOnNewMessage: any = jest.fn(async () => null);
jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    updateOnNewMessage: (...a: any[]) => mockConversationStatsUpdateOnNewMessage(...a),
  },
}));

const mockConversationMessageStatsOnNewMessage: any = jest.fn(async () => null);
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: {
    onNewMessage: (...a: any[]) => mockConversationMessageStatsOnNewMessage(...a),
  },
}));

const mockResolveMentionedUsers: any = jest.fn(async () => []);
const mockResolveUsernamesToIds: any = jest.fn(async () => []);
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...a: any[]) => mockResolveMentionedUsers(...a),
  resolveUsernamesToIds: (...a: any[]) => mockResolveUsernamesToIds(...a),
}));

const mockIsBlockedBetween: any = jest.fn(async () => false);
jest.mock('../../../utils/blocking', () => ({
  isBlockedBetween: (...a: any[]) => mockIsBlockedBetween(...a),
}));

const cacheGet: any = jest.fn(async () => null);
const cacheSet: any = jest.fn(async () => undefined);
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: (...a: any[]) => cacheGet(...a), set: (...a: any[]) => cacheSet(...a) }),
}));

const mockSerializeAttachment: any = jest.fn((att: any) => att);
// #7070 — la LISTE (site UNIQUE, partagé avec le producteur REST/ZMQ) autant que la pièce. Elle DÉLÈGUE à l'espion : « chaque pièce passe par le sérialiseur » et « un `attachments` non-tableau donne `[]` » restent tous deux mesurés ici. Écrit sur UNE ligne : ce fichier est hors budget (`gateway-test-file-size-budget`), il ne peut que rétrécir.
jest.mock('../../../socketio/serializeAttachmentForSocket', () => ({ serializeAttachmentForSocket: (...a: any[]) => mockSerializeAttachment(...a), serializeMessageAttachmentsForSocket: (l: unknown) => (Array.isArray(l) ? l.map((a: unknown) => mockSerializeAttachment(a)) : []) }));

const mockBuildPostReplyTo: any = jest.fn((post: any) => ({ snapshot: post }));
const mockPostReplyToFromMetadata: any = jest.fn(() => null);
jest.mock('../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: (...a: any[]) => mockBuildPostReplyTo(...a),
  postReplyToFromMetadata: (...a: any[]) => mockPostReplyToFromMetadata(...a),
  POST_REPLY_SNAPSHOT_SELECT: { id: true, content: true },
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentForwardPreviewSelect: { id: true, mimeType: true },
  attachmentMediaSelect: { id: true, mimeType: true, url: true },
}));

jest.mock('../../../services/MessagingService', () => ({ MessagingService: jest.fn() }));
jest.mock('../../../services/StatusService', () => ({ StatusService: jest.fn() }));
jest.mock('../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({ MessageTranslationService: jest.fn() }));
jest.mock('../../../services/attachments/AttachmentService', () => ({ AttachmentService: jest.fn() }));

const mockGroupSocketsByLanguage: any = jest.fn(() => []);
const mockFilterMessagePayloadForLanguages: any = jest.fn((payload: any) => payload);
jest.mock('../../../socketio/utils/message-payload-filter.js', () => ({
  groupSocketsByLanguage: (...a: any[]) => mockGroupSocketsByLanguage(...a),
  filterMessagePayloadForLanguages: (...a: any[]) => mockFilterMessagePayloadForLanguages(...a),
}));

const mockEnhancedLogger = {
  child: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
};
const mockPerformanceLogger = {
  withTiming: jest.fn(async (_name: any, fn: () => Promise<any>, _meta: any) => fn()),
};
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: mockEnhancedLogger,
  performanceLogger: mockPerformanceLogger,
}));

// Now import the SUT
import { MessageHandler } from '../../../socketio/handlers/MessageHandler';
import type { MessageHandlerDependencies } from '../../../socketio/handlers/MessageHandler';

// ============================================================
// TYPE HELPERS
// ============================================================

interface SocketUser {
  id: string;
  socketId: string;
  isAnonymous: boolean;
  language: string;
  resolvedLanguages: string[];
  participantId?: string;
  userId?: string;
  displayName?: string;
}

const defaultSocketUser: SocketUser = {
  id: 'user-1',
  socketId: 'socket-1',
  isAnonymous: false,
  language: 'fr',
  resolvedLanguages: ['fr'],
  userId: 'user-1',
  participantId: 'participant-1',
  displayName: 'Alice',
};

// ============================================================
// FACTORIES
// ============================================================

function makeSocket(id = 'socket-1') {
  const broadcastEmit = jest.fn();
  const broadcastTo = jest.fn(() => ({ emit: broadcastEmit }));
  return {
    id,
    emit: jest.fn(),
    broadcast: { to: broadcastTo, emit: broadcastEmit },
    _broadcastEmit: broadcastEmit,
  } as any;
}

function makeMockIo(rooms?: Map<string, Set<string>>) {
  const emitFn = jest.fn();
  const exceptFn = jest.fn(() => ({ emit: emitFn }));
  const toFn = jest.fn();

  const chainable: any = {
    emit: emitFn,
    except: exceptFn,
    to: (...args: unknown[]) => {
      toFn(...args);
      return chainable;
    },
  };

  return {
    to: (...args: unknown[]) => {
      toFn(...args);
      return chainable;
    },
    sockets: {
      adapter: {
        rooms: rooms ?? new Map(),
      },
    },
    _emit: emitFn,
    _except: exceptFn,
    _to: toFn,
  } as any;
}

/**
 * `makeMockIo().to()` always returns the SAME chainable object with a single
 * shared `emit` mock, so `expect(io._to).toHaveBeenCalledWith(room)` proves
 * only that some emitter addressed that room — never which payload landed
 * there. `conversation:updated` builds one payload PER destinataire (Prisme
 * du lecteur), so an assertion needs to pick the payload OUT of a specific
 * room. Mirrors `recordEmitChains` in `MeeshySocketIOManager.test.ts`,
 * adapted to a plain (non-jest.fn) `.to` property.
 */
function recordEmitChains(io: any) {
  const sent: Array<{ rooms: string[]; event: string; payload: any }> = [];
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    except: () => chain(rooms),
    emit: (event: string, payload: unknown) => { sent.push({ rooms, event, payload }); },
  });
  const originalTo = io.to;
  io.to = (room: string) => chain([room]);
  return {
    roomsFor: (event: string) => sent.filter((s) => s.event === event).flatMap((s) => s.rooms),
    payloadFor: (event: string, room: string) =>
      sent.find((s) => s.event === event && s.rooms.includes(room))?.payload,
    restore: () => { io.to = originalTo; },
  };
}

function makeMockPrisma(overrides: Record<string, any> = {}) {
  return {
    conversation: {
      findUnique: jest.fn(async () => null),
      ...overrides.conversation,
    },
    message: {
      findUnique: jest.fn(async () => null),
      ...overrides.message,
    },
    participant: {
      findMany: jest.fn(async () => []),
      ...overrides.participant,
    },
    post: {
      findUnique: jest.fn(async () => null),
      ...overrides.post,
    },
    user: {
      findMany: jest.fn(async () => []),
      findFirst: jest.fn(async () => null),
      ...overrides.user,
    },
  } as any;
}

function makeMockMessagingService(msgOverride: object = {}) {
  const defaultMsg = {
    id: 'msg-server-1',
    conversationId: 'conv-abc',
    senderId: 'participant-1',
    content: 'hello world',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    clientMessageId: 'cid_12345678-1234-4000-8000-123456789012',
    originalLanguage: 'fr',
    sender: { id: 'participant-1', userId: 'user-1', displayName: 'Alice', username: 'alice', avatar: null },
    attachments: [],
    translations: [],
    messageType: 'text',
    replyToId: null,
    storyReplyToId: null,
    forwardedFromId: null,
    forwardedFromConversationId: null,
    isEncrypted: false,
    encryptionMode: null,
    encryptedContent: null,
    encryptionMetadata: null,
    ...msgOverride,
  };

  return {
    handleMessage: jest.fn(async () => ({
      success: true as boolean,
      data: defaultMsg,
      error: undefined as string | undefined,
    })),
  };
}

function makeMockAttachmentService(attachments: any[] = []) {
  const getAttachment = jest.fn(async (id: string) =>
    attachments.find((a) => a.id === id) ?? null
  );
  return {
    getAttachment,
    // Cf. `AttachmentService.getAttachmentsByIds` : une seule requête pour les
    // N pièces, rendues dans l'ordre des ids demandés.
    getAttachmentsByIds: jest.fn(async (ids: readonly string[]) =>
      Promise.all(ids.map((id) => getAttachment(id)))
    ),
  };
}

function makeMockReadStatusService() {
  return {
    markMessagesAsReceived: jest.fn(async () => undefined),
    getLatestMessageSummary: jest.fn(async () => ({ totalMembers: 2, deliveredCount: 1, readCount: 0 })),
    getUnreadCountsForParticipants: jest.fn(async () => new Map<string, number>()),
  };
}

function makeMockPrivacyPreferencesService() {
  return {
    getPreferencesForUsers: jest.fn(async (users: Array<{ id: string }>) =>
      new Map(users.map((u) => [u.id, { showReadReceipts: true }]))
    ),
  };
}

interface HandlerOptions {
  connectedUsers?: Map<string, SocketUser>;
  socketToUser?: Map<string, string>;
  messagingService?: any;
  prisma?: any;
  io?: any;
  attachmentService?: any;
  readStatusService?: any;
  privacyPreferencesService?: any;
  agentClient?: any;
  stats?: { messages_processed: number; errors: number };
  deliveryQueue?: any;
}

function makeHandler(opts: HandlerOptions = {}) {
  const io = opts.io ?? makeMockIo();
  const prisma = opts.prisma ?? makeMockPrisma();
  const messagingService = opts.messagingService ?? makeMockMessagingService();
  const connectedUsers = opts.connectedUsers ?? new Map<string, SocketUser>();
  const socketToUser = opts.socketToUser ?? new Map<string, string>();
  const stats = opts.stats ?? { messages_processed: 0, errors: 0 };

  const deps: MessageHandlerDependencies = {
    io,
    prisma,
    messagingService,
    translationService: {} as any,
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: {} as any,
    connectedUsers: connectedUsers as any,
    socketToUser,
    stats,
    attachmentService: opts.attachmentService ?? makeMockAttachmentService(),
    readStatusService: opts.readStatusService ?? makeMockReadStatusService(),
    privacyPreferencesService: opts.privacyPreferencesService ?? makeMockPrivacyPreferencesService(),
    agentClient: opts.agentClient ?? null,
    deliveryQueue: opts.deliveryQueue ?? null,
  };

  return { handler: new MessageHandler(deps), io, prisma, messagingService, stats, connectedUsers, socketToUser };
}

function makeAuthenticatedSetup(userOverride: Partial<SocketUser> = {}) {
  const user: SocketUser = { ...defaultSocketUser, ...userOverride };
  const connectedUsers = new Map<string, SocketUser>();
  connectedUsers.set(user.userId!, user);

  const socketToUser = new Map<string, string>();
  socketToUser.set('socket-1', user.userId!);

  mockGetConnectedUser.mockReturnValue({ user });

  return { user, connectedUsers, socketToUser };
}

const VALID_CID = 'cid_12345678-1234-4000-8000-123456789012';

function makeValidSendData(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: 'conv-abc',
    content: 'hello world',
    clientMessageId: VALID_CID,
    ...overrides,
  };
}

describe('MessageHandler.handleMessageSend — un sticker SEUL est un corps (#7954)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockValidateMessageLength.mockReturnValue({ isValid: false, error: 'Le message ne peut pas être vide' });
    mockResolveParticipant.mockResolvedValue({ participantId: 'participant-1' });
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockIsBlockedBetween.mockResolvedValue(false);
    cacheGet.mockResolvedValue(null);
  });

  const envoyer = async (sticker: unknown) => {
    const { connectedUsers, socketToUser } = makeAuthenticatedSetup();
    const socket = makeSocket('socket-1');
    const cb = jest.fn();
    const data = makeValidSendData({ content: '', sticker });
    mockValidateSocketEvent.mockReturnValue({ success: true, data });
    const messagingService = makeMockMessagingService();
    const { handler } = makeHandler({ connectedUsers: connectedUsers as any, socketToUser, messagingService });
    await handler.handleMessageSend(socket, data as any, cb);
    return { cb, messagingService };
  };

  it('transmet un sticker VALIDE seul au service, sans texte', async () => {
    const { messagingService } = await envoyer({ emoji: '🎉' });

    const [request] = (messagingService.handleMessage as any).mock.calls[0];
    expect(request).toMatchObject({ content: '', sticker: { emoji: '🎉' } });
  });

  it.each([[{}], [{ emoji: '' }], [{ templateId: '../../etc' }], ['🎉']])(
    'refuse toujours un sticker INVALIDE seul (%p)',
    async (sticker) => {
      const { cb, messagingService } = await envoyer(sticker);

      expect(cb).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Le message ne peut pas être vide' }),
      );
      expect(messagingService.handleMessage).not.toHaveBeenCalled();
    },
  );
});
