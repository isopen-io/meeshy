/**
 * @jest-environment node
 *
 * #14369 — `message:send-with-attachments` ne porte PAS la couche appareil d'un
 * hybride. La décision (`services/gateway/decisions/2026-11-02-le-mode-hybride-
 * chiffre-deux-fois-14369.md` § « Les pièces jointes ») dit : couche serveur
 * seule. Le schéma accepte les champs libsignal (même unité que `message:send`),
 * mais le handler ne recompose AUCUN `deviceLayer` : le clair et la pièce
 * partent, les enveloppes restent au bord. Ce témoin épingle ce choix — un
 * futur lot qui voudrait relayer la couche appareil d'une légende devra le
 * décider, pas le découvrir.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCheckLimit: any = jest.fn(async () => true);
const mockGetRateLimitInfo: any = jest.fn(() => ({ resetIn: 5000 }));

jest.mock('../../../utils/socket-rate-limiter.js', () => ({
  getSocketRateLimiter: () => ({
    checkLimit: (...a: any[]) => mockCheckLimit(...a),
    getRateLimitInfo: (...a: any[]) => mockGetRateLimitInfo(...a),
  }),
  SOCKET_RATE_LIMITS: { MESSAGE_SEND: 'message:send' },
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


import { MessageHandler } from '../../../socketio/handlers/MessageHandler';
import type { MessageHandlerDependencies } from '../../../socketio/handlers/MessageHandler';

const VALID_CID = 'cid_12345678-1234-4000-8000-123456789012';
const UPLOADED = '61a41a4b5c5e4f4a5c5e4f4a';

const user = {
  id: 'user-1', socketId: 'socket-1', isAnonymous: false, language: 'fr',
  resolvedLanguages: ['fr'], userId: 'user-1', participantId: 'participant-1', displayName: 'Alice',
};

const savedMessage = {
  id: 'msg-server-1', conversationId: 'conv-normalized', senderId: 'participant-1', content: 'légende',
  createdAt: new Date('2026-01-01T00:00:00Z'), clientMessageId: VALID_CID, originalLanguage: 'fr',
  sender: { id: 'participant-1', userId: 'user-1', displayName: 'Alice', username: 'alice', avatar: null },
  attachments: [], translations: [], messageType: 'text', replyToId: null, storyReplyToId: null,
  forwardedFromId: null, forwardedFromConversationId: null, isEncrypted: false, encryptionMode: null,
  encryptedContent: null, encryptionMetadata: null, metadata: null,
};

type Verdict = { success: boolean; data?: unknown; error?: string };

function makeHandler(verdict: Verdict) {
  const io: any = {
    to: () => io, except: () => io, emit: jest.fn(), sockets: { adapter: { rooms: new Map() } },
  };
  const messagingService = { handleMessage: jest.fn(async () => verdict) };
  const getAttachment = jest.fn(async (id: string) => (id === UPLOADED ? { id, uploadedBy: 'user-1', mimeType: 'image/jpeg' } : null));
  const connectedUsers = new Map([['user-1', user]]);
  const deps: MessageHandlerDependencies = {
    io,
    prisma: {
      conversation: { findUnique: jest.fn(async () => null) },
      message: { findUnique: jest.fn(async () => ({ translations: [] })) },
      participant: { findMany: jest.fn(async () => []) },
      post: { findUnique: jest.fn(async () => null) },
      user: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    } as any,
    messagingService: messagingService as any,
    translationService: {} as any,
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: {} as any,
    connectedUsers: connectedUsers as any,
    socketToUser: new Map([['socket-1', 'user-1']]),
    stats: { messages_processed: 0, errors: 0 },
    attachmentService: {
      getAttachment,
      getAttachmentsByIds: jest.fn(async (ids: readonly string[]) => Promise.all(ids.map((id) => getAttachment(id)))),
    } as any,
    readStatusService: {
      markMessagesAsReceived: jest.fn(async () => undefined),
      getLatestMessageSummary: jest.fn(async () => ({ totalMembers: 2, deliveredCount: 1, readCount: 0 })),
      getUnreadCountsForParticipants: jest.fn(async () => new Map()),
    } as any,
    privacyPreferencesService: {
      getPreferencesForUsers: jest.fn(async (users: Array<{ id: string }>) => new Map(users.map((u) => [u.id, { showReadReceipts: true }]))),
    } as any,
    agentClient: null,
    deliveryQueue: null,
  };
  return { handler: new MessageHandler(deps), messagingService };
}

const socket = () => ({ id: 'socket-1', emit: jest.fn(), broadcast: { to: jest.fn(() => ({ emit: jest.fn() })), emit: jest.fn() } }) as any;

const BOB = 'b2'.repeat(12);

const hybridWithAttachment = (over: Record<string, unknown> = {}) => ({
  conversationId: 'conv-abc',
  content: 'légende',
  clientMessageId: VALID_CID,
  attachmentIds: [UPLOADED],
  encryptionMode: 'hybrid',
  encryptionProtocol: 'libsignal-v1',
  encryptionMetadata: { protocol: 'libsignal-v1', senderDeviceId: 1, regimeEpoch: 0 },
  envelopes: [{ userId: BOB, deviceId: 1, registrationId: 42, type: 3, body: 'Y2lwaGVydGV4dA==' }],
  ...over,
});

describe('#14369 — message:send-with-attachments et la couche appareil d’un hybride', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockValidateMessageLength.mockReturnValue({ isValid: true });
    mockResolveParticipant.mockResolvedValue({ participantId: 'participant-1' });
    mockNormalizeConversationId.mockResolvedValue('conv-normalized');
    mockGetConnectedUser.mockReturnValue({ user });
    mockConversationStatsUpdateOnNewMessage.mockResolvedValue(null);
    mockResolveMentionedUsers.mockResolvedValue([]);
  });

  it('remet la légende et la pièce à l’admission, sans aucune couche appareil ni chiffré', async () => {
    const { handler, messagingService } = makeHandler({ success: true, data: savedMessage });
    const cb = jest.fn();

    await handler.handleMessageSendWithAttachments(socket(), hybridWithAttachment(), cb);

    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const [request] = (messagingService.handleMessage as any).mock.calls[0];
    expect(request.content).toBe('légende');
    expect(request.attachmentIds).toEqual([UPLOADED]);
    expect(request.deviceLayer).toBeUndefined();
    expect(request.encryptedPayload).toBeUndefined();
  });

  it('le chemin texte message:send, lui, recompose la couche appareil du même envoi', async () => {
    const { handler, messagingService } = makeHandler({ success: true, data: savedMessage });
    const cb = jest.fn();
    const { attachmentIds: _dropped, ...textOnly } = hybridWithAttachment();

    await handler.handleMessageSend(socket(), textOnly, cb);

    const [request] = (messagingService.handleMessage as any).mock.calls[0];
    expect(request.deviceLayer).toMatchObject({ relay: { protocol: 'libsignal-v1' } });
  });
});
