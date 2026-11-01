/**
 * @jest-environment node
 *
 * Décision porteur du 2026-11-01 — le transport d'édition PRIMAIRE du web
 * (socket `message:edit`) modifie un message `server`/`hybrid` et RESCELLE le
 * texte modifié comme un message neuf : `content: ''`, le chiffré et ses
 * métadonnées à côté. `message:edited` porte le clair, jamais le chiffré.
 * Une conversation `e2ee` reste refusée.
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


// Le coffre de la passerelle, doublé au plus près : sceller rend un chiffré qui
// ne contient pas le clair, ouvrir le relit ; `vault` simule la clé absente.
const encode = (text: string): string => Buffer.from(`sealed:${text}`, 'utf8').toString('base64');
const decode = (ciphertext: string): string => Buffer.from(ciphertext, 'base64').toString('utf8').replace(/^sealed:/, '');
const vault = { masterKeyAvailable: true };
jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: async () => ({
    sealAtRest: async (params: any) => {
      if (!vault.masterKeyAvailable) {
        const { ServerAtRestUnavailableError } = jest.requireActual<typeof import('../../../services/messaging/serverAtRest')>('../../../services/messaging/serverAtRest');
        throw new ServerAtRestUnavailableError('missing');
      }
      return { ciphertext: encode(params.plaintext), metadata: { protocol: 'aes-256-gcm', keyId: params.preferredKeyId ?? 'key-conv', iv: 'aXY=', authTag: 'dGFn', aad: 'conversation:v1' } };
    },
    openAtRest: async (envelope: any) => decode(envelope.ciphertext),
  }),
}));

const mockApplyMessageEditEffects: any = jest.fn(async () => undefined);
jest.mock('../../../services/messaging/messageEditEffects', () => ({
  applyMessageEditEffects: (...a: any[]) => mockApplyMessageEditEffects(...a),
}));

const mockReconcileEditedLinks: any = jest.fn(async (params: any) => ({ processedContent: params.content, trackingLinks: [], reconciled: true }));
jest.mock('../../../services/messaging/messageLinks', () => ({
  ...jest.requireActual<typeof import('../../../services/messaging/messageLinks')>('../../../services/messaging/messageLinks'),
  reconcileEditedLinks: (...a: any[]) => mockReconcileEditedLinks(...a),
}));

import { MessageHandler } from '../../../socketio/handlers/MessageHandler';
import type { MessageHandlerDependencies } from '../../../socketio/handlers/MessageHandler';

const MESSAGE_ID = 'aabbccddee1122334455aabb';
const AUTHOR = { id: 'user-1', participantId: 'participant-1' };
const BEFORE = 'le code est 4471';
const AFTER = 'le code est 9902';

function setup(conversationMode: string) {
  const user = { id: AUTHOR.id, userId: AUTHOR.id, participantId: AUTHOR.participantId, socketId: 'socket-1', isAnonymous: false, language: 'fr', resolvedLanguages: ['fr'], displayName: 'X' };
  mockGetConnectedUser.mockReturnValue({ user });
  mockValidateSocketEvent.mockReturnValue({ success: true, data: { messageId: MESSAGE_ID, content: AFTER } });
  const emitted: Array<{ event: string; payload: any }> = [];
  const chain: any = { emit: (event: string, payload: unknown) => emitted.push({ event, payload }), except: () => chain, to: () => chain };
  const io: any = { to: () => chain, sockets: { adapter: { rooms: new Map() } } };
  const prisma: any = {
    message: {
      findFirst: jest.fn(async () => ({
        id: MESSAGE_ID,
        conversationId: 'conv-abc',
        senderId: AUTHOR.participantId,
        content: '',
        isEncrypted: conversationMode !== 'e2ee',
        encryptionMode: conversationMode,
        encryptedContent: encode(BEFORE),
        encryptionMetadata: { mode: conversationMode, keyId: 'key-conv', iv: 'aXY=', authTag: 'dGFn', aad: 'conversation:v1' },
        originalLanguage: 'fr',
        messageType: 'text',
        createdAt: new Date(Date.now() - 60_000),
        metadata: null,
        isViewOnce: false,
        effectFlags: 0,
        conversation: { isActive: true, closedAt: null, type: 'group', encryptionMode: conversationMode, serverEncryptionKeyId: 'key-conv' },
        sender: { id: AUTHOR.participantId, userId: AUTHOR.id, displayName: 'Alice', avatar: null, role: 'member' },
        attachments: [],
      })),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => null),
    },
    participant: { findFirst: jest.fn(async () => ({ id: AUTHOR.participantId, user: { role: 'USER' } })), findMany: jest.fn(async () => []) },
    user: { findUnique: jest.fn(async () => ({ role: 'USER' })), findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    conversation: { findUnique: jest.fn(async () => null) },
    post: { findUnique: jest.fn(async () => null) },
  };
  const deps: MessageHandlerDependencies = {
    io, prisma,
    messagingService: {} as any,
    translationService: { retranslateMessageAsync: jest.fn(async () => undefined) } as any,
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: {} as any,
    connectedUsers: new Map([[AUTHOR.id, user]]) as any,
    socketToUser: new Map([['socket-1', AUTHOR.id]]),
    stats: { messages_processed: 0, errors: 0 },
    attachmentService: {} as any, readStatusService: {} as any, privacyPreferencesService: {} as any,
    agentClient: null, deliveryQueue: null,
  };
  const socket: any = { id: 'socket-1', emit: jest.fn(), broadcast: { to: () => ({ emit: jest.fn() }), emit: jest.fn() } };
  const handler = new MessageHandler(deps);
  const retranslate = jest.fn(async (_messageId: string, _message: unknown) => undefined);
  (handler as any).translationService = { retranslateMessageAsync: retranslate };
  const edited = () => emitted.find((e) => e.event === 'message:edited')?.payload;
  return { handler, prisma, socket, edited, retranslate };
}

describe('socket `message:edit` — au repos, le texte modifié se rescelle (décision 2026-11-01)', () => {
  it.each(['server', 'hybrid'])('mode %s : content vide et le chiffré écrits, jamais le clair', async (mode) => {
    vault.masterKeyAvailable = true;
    const { handler, prisma, socket } = setup(mode);
    const callback = jest.fn();

    await handler.handleMessageEdit(socket, { messageId: MESSAGE_ID, content: AFTER }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const data = (prisma.message.updateMany.mock.calls[0] as any)[0].data;
    expect(data).toMatchObject({ content: '', isEncrypted: true, encryptionMode: mode, encryptedContent: encode(AFTER) });
    expect(JSON.stringify(data)).not.toContain('le code est');
  });

  it('`message:edited` porte le texte modifié en clair, sans chiffré', async () => {
    vault.masterKeyAvailable = true;
    const { handler, socket, edited } = setup('server');

    await handler.handleMessageEdit(socket, { messageId: MESSAGE_ID, content: AFTER }, jest.fn());

    expect(edited()).toMatchObject({ content: AFTER });
    expect(JSON.stringify(edited())).not.toContain(encode(AFTER));
  });

  it('aucune adresse suivie au repos, et les effets durables comptent depuis le texte d’AVANT ouvert', async () => {
    vault.masterKeyAvailable = true;
    mockReconcileEditedLinks.mockClear();
    mockApplyMessageEditEffects.mockClear();
    const { handler, socket, retranslate } = setup('server');

    await handler.handleMessageEdit(socket, { messageId: MESSAGE_ID, content: AFTER }, jest.fn());

    expect(mockReconcileEditedLinks).not.toHaveBeenCalled();
    expect(mockApplyMessageEditEffects).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ previousContent: BEFORE, content: AFTER }));
    expect(retranslate).toHaveBeenCalledWith(MESSAGE_ID, expect.objectContaining({ id: MESSAGE_ID }));
  });

  it('sans clé maîtresse : refusé avec SERVER_AT_REST_UNAVAILABLE, rien d’écrit ni diffusé', async () => {
    vault.masterKeyAvailable = false;
    const { handler, prisma, socket, edited } = setup('server');
    const callback = jest.fn();

    await handler.handleMessageEdit(socket, { messageId: MESSAGE_ID, content: AFTER }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'SERVER_AT_REST_UNAVAILABLE' }));
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(edited()).toBeUndefined();
    vault.masterKeyAvailable = true;
  });

  it('une conversation e2ee reste refusée : le serveur n’écrit aucun clair', async () => {
    const { handler, prisma, socket } = setup('e2ee');
    const callback = jest.fn();

    await handler.handleMessageEdit(socket, { messageId: MESSAGE_ID, content: AFTER }, callback);

    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'E2EE_PLAINTEXT_REFUSED' }));
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });
});
