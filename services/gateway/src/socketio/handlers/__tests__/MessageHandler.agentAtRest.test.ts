/**
 * @jest-environment node
 *
 * Décision porteur du 2026-11-01 (directive #9224 : « sans E2EE, toutes les
 * features serveur ») — l'agent IA (`agent:new-message`) revient dans les
 * conversations `server`/`hybrid`, et il y reçoit le texte DÉCHIFFRÉ : une
 * ligne au repos porte `content: ''`, la passerelle l'ouvre avant de notifier.
 * Il reste ABSENT de tout message chiffré de bout en bout (`e2ee`), où le
 * serveur ne détient aucun clair. Les deux transports socket (texte, pièces
 * jointes) suivent la même règle.
 *
 * Ce qui sort du modèle de menace du repos, et le porteur l'a tranché : le
 * texte transmis à `services/agent` se pose dans sa fenêtre Redis, chez le
 * fournisseur LLM et dans ses résumés MongoDB, hors du chiffrement au repos
 * de la passerelle (#12822 H1, levé par la décision du 2026-11-01).
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer, Socket } from 'socket.io';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined }),
    warn: () => undefined,
  },
  performanceLogger: { withTiming: (_name: unknown, fn: () => unknown) => fn() },
}));

jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (id: string, map: Map<string, { id: string }>) => {
    const user = map.get(id);
    return user ? { user, realUserId: user.id } : null;
  },
  extractJWTToken: () => undefined,
  extractSessionToken: () => undefined,
  normalizeConversationId: async (id: string) => id,
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: (_schema: unknown, data: unknown) => ({ success: true, data }),
}));

jest.mock('../../../config/message-limits', () => ({
  validateMessageLength: () => ({ isValid: true }),
  MESSAGE_LIMITS: { MAX_MESSAGE_LENGTH: 5000 },
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: () => ({ checkLimit: async () => true, getRateLimitInfo: () => ({ resetIn: 30000 }) }),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    MESSAGE_SEND_PER_CONVERSATION: { maxRequests: 10, windowMs: 10000, keyPrefix: 'socket:message:send-conv' },
  },
}));

jest.mock('../../../utils/blocking', () => ({ isBlockedBetween: async () => false }));

jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipant: async () => ({ participantId: 'part0011223344556677889900' }),
}));

jest.mock('../../utils/message-payload-filter', () => ({
  groupSocketsByLanguage: () => [],
  filterMessagePayloadForLanguages: (payload: unknown) => payload,
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: async () => null, set: async () => undefined }),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: async () => [],
  resolveUsernamesToIds: async () => [],
}));

jest.mock('../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: () => null,
  postReplyToFromMetadata: () => null,
  POST_REPLY_SNAPSHOT_SELECT: { id: true },
}));

jest.mock('../../serializeAttachmentForSocket', () => ({
  serializeAttachmentForSocket: (attachment: unknown) => attachment,
  serializeMessageAttachmentsForSocket: (list: unknown) => (Array.isArray(list) ? list : []),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: async () => undefined },
}));

jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: { onNewMessage: async () => undefined },
}));

const encode = (text: string): string => Buffer.from(`sealed:${text}`, 'utf8').toString('base64');
jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: async () => ({
    openAtRest: async (envelope: { ciphertext: string }) => Buffer.from(envelope.ciphertext, 'base64').toString('utf8').replace(/^sealed:/, ''),
  }),
}));

import { MessageHandler, type MessageHandlerDependencies } from '../MessageHandler';

const CONVERSATION_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const USER_ID = 'user0011223344556677889900';
const PARTICIPANT_ID = 'part0011223344556677889900';
const ATTACHMENT_ID = 'a1b2c3d4e5f6a1b2c3d4e5f0';
const SECRET = 'code porte 4471';

const makeIO = (): SocketIOServer => {
  const room = { emit: () => true, to: () => room, except: () => room };
  return { to: () => room, sockets: { adapter: { rooms: new Map() } } } as unknown as SocketIOServer;
};

const makePrisma = (): PrismaClient => ({
  conversation: { findUnique: async () => null },
  participant: { findMany: async () => [], findFirst: async () => null },
  message: { findUnique: async () => null },
  user: { findMany: async () => [] },
  post: { findUnique: async () => null },
}) as unknown as PrismaClient;

type SavedShape = { readonly content: string; readonly isEncrypted: boolean; readonly encryptedContent?: string; readonly encryptionMetadata?: unknown };

/** Ce que `saveMessage` rend d'ordinaire : la ligne déjà servie en clair (`servedClearAtRest`). */
const SERVED_CLEAR: SavedShape = { content: SECRET, isEncrypted: false };

/** Une ligne restée SCELLÉE (le chemin d'envoi n'a pas encore ouvert le repos) : l'agent doit recevoir le clair quand même. */
const STILL_SEALED: SavedShape = {
  content: '',
  isEncrypted: true,
  encryptedContent: encode(SECRET),
  encryptionMetadata: { mode: 'server', keyId: 'key-conv', iv: 'aXY=', authTag: 'dGFn', aad: 'conversation:v1' },
};

const makeSavedMessage = (encryptionMode: string | null, shape: SavedShape = SERVED_CLEAR) => ({
  id: 'msg0011223344556677889900',
  conversationId: CONVERSATION_ID,
  senderId: PARTICIPANT_ID,
  originalLanguage: 'fr',
  encryptionMode,
  createdAt: new Date('2026-10-25T08:00:00Z'),
  ...shape,
});

const makeWorld = (encryptionMode: string | null, shape: SavedShape = SERVED_CLEAR) => {
  const sendEvent = jest.fn(async (_event: Record<string, unknown>) => undefined);
  const deps = {
    io: makeIO(),
    prisma: makePrisma(),
    messagingService: { handleMessage: async () => ({ success: true, data: makeSavedMessage(encryptionMode, shape) }) },
    translationService: {},
    statusService: { updateLastSeen: () => undefined },
    notificationService: { createMessageNotification: async () => undefined },
    connectedUsers: new Map([[USER_ID, {
      id: USER_ID, socketId: 'socket-1', isAnonymous: false, language: 'fr',
      resolvedLanguages: ['fr'], userId: USER_ID, participantId: PARTICIPANT_ID,
    }]]),
    socketToUser: new Map([['socket-1', USER_ID]]),
    stats: { messages_processed: 0, errors: 0 },
    agentClient: { sendEvent },
    attachmentService: {
      getAttachment: async () => ({ id: ATTACHMENT_ID, uploadedBy: USER_ID }),
      getAttachmentsByIds: async (ids: readonly string[]) => ids.map((id) => ({ id, uploadedBy: USER_ID })),
    },
    readStatusService: {
      getUnreadCountsForParticipants: async () => new Map(),
      markMessagesAsReceived: async () => undefined,
      getLatestMessageSummary: async () => null,
    },
    privacyPreferencesService: { shouldShowReadReceipts: async () => true, getPreferencesForUsers: async () => new Map() },
  } as unknown as MessageHandlerDependencies;
  const socket = { id: 'socket-1', emit: () => true, broadcast: { to: () => ({ emit: () => true }) } } as unknown as Socket;
  return { handler: new MessageHandler(deps), socket, sendEvent };
};

const sendText = async (encryptionMode: string | null, shape: SavedShape = SERVED_CLEAR) => {
  const world = makeWorld(encryptionMode, shape);
  await world.handler.handleMessageSend(world.socket as never, { conversationId: CONVERSATION_ID, content: SECRET } as never, () => undefined);
  return world.sendEvent;
};

const sendWithAttachment = async (encryptionMode: string | null) => {
  const world = makeWorld(encryptionMode);
  await world.handler.handleMessageSendWithAttachments(
    world.socket as never,
    { conversationId: CONVERSATION_ID, content: SECRET, attachmentIds: [ATTACHMENT_ID] } as never,
    () => undefined,
  );
  return world.sendEvent;
};

describe('décision 2026-11-01 — l’agent IA lit les conversations chiffrées au repos, jamais le bout en bout', () => {
  it.each(['server', 'hybrid', 'SERVER'])('texte, mode %s : agent:new-message porte le texte en clair', async (mode) => {
    const sendEvent = await sendText(mode);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent:new-message', content: SECRET }));
  });

  it.each(['server', 'hybrid'])('pièce jointe, mode %s : agent:new-message part', async (mode) => {
    const sendEvent = await sendWithAttachment(mode);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent:new-message', content: SECRET }));
  });

  it('une ligne restée scellée (content vide) : l’agent reçoit le texte DÉCHIFFRÉ, jamais la chaîne vide ni le chiffré', async () => {
    const sendEvent = await sendText('server', STILL_SEALED);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent:new-message', content: SECRET }));
    expect(JSON.stringify(sendEvent.mock.calls)).not.toContain(encode(SECRET));
  });

  it.each(['e2ee', 'E2EE'])('mode %s : aucun agent:new-message — le serveur ne détient aucun clair', async (mode) => {
    const sendEvent = await sendText(mode, { content: '[Encrypted]', isEncrypted: true });
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it('une conversation en clair notifie toujours l’agent, texte compris', async () => {
    const sendEvent = await sendText(null);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent:new-message', content: SECRET }));
  });

  it('les pièces jointes d’une conversation en clair notifient toujours l’agent', async () => {
    const sendEvent = await sendWithAttachment(null);
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent:new-message' }));
  });
});
