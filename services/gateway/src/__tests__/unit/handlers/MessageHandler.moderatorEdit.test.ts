/**
 * @jest-environment node
 *
 * #11375 — le transport d'édition PRIMAIRE du web (socket `message:edit`)
 * enregistre l'auteur d'une modification faite par un modérateur de plateforme
 * et le diffuse dans `message:edited`. Ce transport compose sa charge depuis la
 * ligne LUE AVANT l'écriture : il doit donc DÉCLARER l'attribution qu'il vient
 * d'écrire, sans quoi il diffuserait celle d'avant.
 */

import { describe, it, expect, jest } from '@jest/globals';


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

const MESSAGE_ID = 'aabbccddee1122334455aabb';
const AUTHOR = { id: 'user-1', participantId: 'participant-1' };
const MODERATOR = { id: 'user-mod', participantId: 'participant-mod' };

function setup(editor: { readonly id: string; readonly participantId: string }, globalRole: string) {
  const user = { id: editor.id, userId: editor.id, participantId: editor.participantId, socketId: 'socket-1', isAnonymous: false, language: 'fr', resolvedLanguages: ['fr'], displayName: 'X' };
  mockGetConnectedUser.mockReturnValue({ user });
  mockValidateSocketEvent.mockReturnValue({ success: true, data: { messageId: MESSAGE_ID, content: 'après' } });
  const emitted: Array<{ event: string; payload: any }> = [];
  const chain: any = { emit: (event: string, payload: unknown) => emitted.push({ event, payload }), except: () => chain, to: () => chain };
  const io: any = { to: () => chain, sockets: { adapter: { rooms: new Map() } } };
  const prisma: any = {
    message: {
      findFirst: jest.fn(async () => ({
        id: MESSAGE_ID,
        conversationId: 'conv-abc',
        senderId: AUTHOR.participantId,
        content: 'avant',
        originalLanguage: 'fr',
        messageType: 'text',
        createdAt: new Date(Date.now() - 60_000),
        conversation: { isActive: true, closedAt: null, type: 'group', encryptionMode: null },
        sender: { id: AUTHOR.participantId, userId: AUTHOR.id, displayName: 'Alice', avatar: null, role: 'member' },
        attachments: [],
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => null),
    },
    participant: {
      findFirst: jest.fn(async () => ({ id: editor.participantId, user: { role: globalRole } })),
      findMany: jest.fn(async () => []),
    },
    user: { findUnique: jest.fn(async () => ({ role: globalRole })), findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    conversation: { findUnique: jest.fn(async () => null) },
    post: { findUnique: jest.fn(async () => null) },
  };
  const deps: MessageHandlerDependencies = {
    io,
    prisma,
    messagingService: {} as any,
    translationService: { retranslateMessageAsync: jest.fn(async () => undefined) } as any,
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: {} as any,
    connectedUsers: new Map([[editor.id, user]]) as any,
    socketToUser: new Map([['socket-1', editor.id]]),
    stats: { messages_processed: 0, errors: 0 },
    attachmentService: {} as any,
    readStatusService: {} as any,
    privacyPreferencesService: {} as any,
    agentClient: null,
    deliveryQueue: null,
  };
  const socket: any = { id: 'socket-1', emit: jest.fn(), broadcast: { to: () => ({ emit: jest.fn() }), emit: jest.fn() } };
  const handler = new MessageHandler(deps);
  (handler as any).translationService = { retranslateMessageAsync: jest.fn(async () => undefined) };
  const edited = () => emitted.find((e) => e.event === 'message:edited')?.payload;
  return { handler, prisma, socket, edited };
}

describe('socket `message:edit` — #11375, la modification par un modérateur est à visage découvert', () => {
  it('un MODERATOR de plateforme sur le message d’autrui : écrit et diffusé avec son identité et son rôle', async () => {
    const { handler, prisma, socket, edited } = setup(MODERATOR, 'MODERATOR');
    const callback = jest.fn();

    await handler.handleMessageEdit(socket, { messageId: MESSAGE_ID, content: 'après' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ editedById: MODERATOR.id, editedByRole: 'MODERATOR' }),
    }));
    expect(edited()).toMatchObject({ editedById: MODERATOR.id, editedByRole: 'MODERATOR' });
  });

  it('l’auteur : les deux colonnes remises à null, et null diffusé', async () => {
    const { handler, prisma, socket, edited } = setup(AUTHOR, 'USER');

    await handler.handleMessageEdit(socket, { messageId: MESSAGE_ID, content: 'après' }, jest.fn());

    expect(prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ editedById: null, editedByRole: null }),
    }));
    expect(edited()).toMatchObject({ editedById: null, editedByRole: null });
  });

  it('un utilisateur ordinaire sur le message d’autrui est refusé et rien n’est écrit', async () => {
    const { handler, prisma, socket, edited } = setup(MODERATOR, 'USER');
    const callback = jest.fn();

    await handler.handleMessageEdit(socket, { messageId: MESSAGE_ID, content: 'après' }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(edited()).toBeUndefined();
  });
});
