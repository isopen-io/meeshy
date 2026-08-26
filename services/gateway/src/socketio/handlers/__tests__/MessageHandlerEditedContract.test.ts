/**
 * @jest-environment node
 *
 * `message:edited` a TROIS producteurs, et un seul décodeur par client.
 *
 * - `MessageHandler.handleMessageEdit` — le transport socket, celui QU'EMPLOIE
 *   LE WEB (`messaging.service.ts` émet `message:edit`) et que son propre
 *   commentaire nomme « le transport d'édition PRIMAIRE » ;
 * - `MeeshySocketIOManager.broadcastMessageEdited` — le chemin des résumés
 *   d'appel ;
 * - `broadcastMessageMutation` — le chemin REST, celui qu'emploie iOS pour
 *   ÉDITER (`PUT /messages/:messageId`).
 *
 * Les trois construisent leur charge utile à la main, chacun dans son fichier.
 * C'est la « quatrième famille » (cf. `services/gateway/CLAUDE.md`) : une
 * déclaration PRÉSENTE, bien formée, et fausse contre son producteur. Le
 * contrat partagé déclare `message:edited` comme un `SocketIOMessage`
 * (`socketio-events.ts`), dont SEPT champs sont requis — et le producteur
 * socket n'en servait que quatre.
 *
 * **Ce n'est pas un piège armé, c'est une panne.** Le décodeur iOS
 * (`APIMessage.init(from:)`, MessageModels.swift) lit `senderId` et `createdAt`
 * en `try c.decode(...)` — NON tolérant, contrairement à ses voisins en
 * `decodeIfPresent`. Une clé absente y fait échouer le décodage du message
 * ENTIER ; `MessageSocketManager.decode` journalise « decode DROP » et
 * abandonne, si bien que `messageEdited` ne publie jamais rien.
 *
 *     un utilisateur web édite un message
 *       → la passerelle diffuse la charge partielle à TOUT le salon
 *       → chaque client iOS présent la rejette au décodage
 *       → l'édition n'apparaît JAMAIS en direct sur iOS.
 *
 * web → web marchait (son écouteur est typé `any` et applique un patch),
 * Android marchait (`ApiMessage.senderId`/`createdAt` sont `String? = null`) —
 * seul iOS, le client le plus strict, tombait, et en silence.
 *
 * Les affirmations sont SÉPARÉES parce que la séparation EST le diagnostic :
 * la première qui tombe nomme le champ perdu, là où un unique `toEqual`
 * laisserait chercher partout.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer, Socket } from 'socket.io';

// ── Module-level mocks ─────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    })),
    warn: jest.fn(),
  },
  performanceLogger: {
    withTiming: jest.fn().mockImplementation((_n: unknown, fn: () => unknown) => fn()),
  },
}));

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
const mockGetConnectedUser = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: (...a: any[]) => mockGetConnectedUser(...a),
  extractJWTToken: jest.fn(),
  extractSessionToken: jest.fn(),
  normalizeConversationId: (...a: any[]) => mockNormalizeConversationId(...a),
}));

const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: (...a: any[]) => mockValidateSocketEvent(...a),
}));

const mockValidateMessageLength = jest.fn() as jest.Mock<any>;
jest.mock('../../../config/message-limits', () => ({
  validateMessageLength: (...a: any[]) => mockValidateMessageLength(...a),
  MESSAGE_LIMITS: { MAX_MESSAGE_LENGTH: 5000 },
}));

const mockCheckLimit = jest.fn() as jest.Mock<any>;
const mockGetRateLimitInfo = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: () => ({
    checkLimit: (...a: any[]) => mockCheckLimit(...a),
    getRateLimitInfo: (...a: any[]) => mockGetRateLimitInfo(...a),
  }),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    MESSAGE_SEND_PER_CONVERSATION: { maxRequests: 10, windowMs: 10000, keyPrefix: 'socket:message:send-conv' },
    MESSAGE_EDIT: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:edit' },
    MESSAGE_DELETE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:delete' },
  },
}));

const mockIsBlockedBetween = jest.fn() as jest.Mock<any>;
jest.mock('../../../utils/blocking', () => ({
  isBlockedBetween: (...a: any[]) => mockIsBlockedBetween(...a),
}));

const mockResolveParticipant = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/participant-resolver', () => ({
  resolveParticipant: (...a: any[]) => mockResolveParticipant(...a),
}));

const mockGroupSocketsByLanguage = jest.fn() as jest.Mock<any>;
const mockFilterMessagePayloadForLanguages = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/message-payload-filter', () => ({
  groupSocketsByLanguage: (...a: any[]) => mockGroupSocketsByLanguage(...a),
  filterMessagePayloadForLanguages: (...a: any[]) => mockFilterMessagePayloadForLanguages(...a),
}));

const mockGetCacheStore = jest.fn() as jest.Mock<any>;
const mockCacheGet = jest.fn() as jest.Mock<any>;
const mockCacheSet = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => mockGetCacheStore(),
}));

const mockResolveMentionedUsers = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: (...a: any[]) => mockResolveMentionedUsers(...a),
}));

jest.mock('../../../services/messaging/postReplySnapshot', () => ({
  buildPostReplyTo: jest.fn(),
  postReplyToFromMetadata: jest.fn(() => null),
  POST_REPLY_SNAPSHOT_SELECT: { id: true },
}));

jest.mock('../../serializeAttachmentForSocket', () => ({
  serializeAttachmentForSocket: jest.fn((a: unknown) => a),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { updateOnNewMessage: jest.fn(() => Promise.resolve()) },
}));

jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onNewMessage: jest.fn(() => Promise.resolve()),
    onMessageDeleted: jest.fn(() => Promise.resolve()),
    onMessageEdited: jest.fn(() => Promise.resolve()),
  },
}));

// ── After all mocks, import the class ──────────────────────────────────────

import { MessageHandler, type MessageHandlerDependencies } from '../MessageHandler';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

// ── Constants ──────────────────────────────────────────────────────────────

const VALID_MSG_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const VALID_CONV_ID = 'c1d2e3f4a5b6c1d2e3f4a5b6';
const USER_ID = 'user0011223344556677889900';
const PARTICIPANT_ID = 'part0011223344556677889900';
/**
 * DANS la fenêtre d'édition de 24 h (`admitMessageEdit`). Une date figée dans
 * le passé y ferait tomber le témoin sur un refus d'admission — c'est-à-dire
 * pour la mauvaise raison, sans jamais atteindre le producteur qu'il garde.
 */
const CREATED_AT = new Date(Date.now() - 60_000);

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSocket(overrides: Partial<Socket> = {}): jest.Mocked<Socket> {
  return {
    id: 'socket-1',
    emit: jest.fn(),
    broadcast: { to: jest.fn(() => ({ emit: jest.fn() })) },
    ...overrides,
  } as unknown as jest.Mocked<Socket>;
}

function makeIO(): jest.Mocked<SocketIOServer> {
  const emitsByRoom = new Map<string, any[][]>();
  const chain = (rooms: readonly string[]): any => ({
    to: jest.fn((room: string) => chain([...rooms, room])),
    except: jest.fn(() => chain(rooms)),
    emit: jest.fn((...args: any[]) => {
      for (const room of rooms) emitsByRoom.set(room, [...(emitsByRoom.get(room) ?? []), args]);
      return true;
    }),
  });
  return {
    to: jest.fn((room: string) => chain([room])),
    sockets: { adapter: { rooms: new Map() } },
    __emitsByRoom: emitsByRoom,
  } as unknown as jest.Mocked<SocketIOServer>;
}

function emitsTo(io: SocketIOServer, room: string): any[][] {
  return ((io as unknown as { __emitsByRoom: Map<string, any[][]> }).__emitsByRoom.get(room)) ?? [];
}

function makePrisma(): jest.Mocked<PrismaClient> {
  return {
    conversation: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    participant: { findMany: jest.fn(), findFirst: jest.fn() },
    message: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    mention: { findMany: jest.fn(), deleteMany: jest.fn() },
    post: { findUnique: jest.fn() },
  } as unknown as jest.Mocked<PrismaClient>;
}

function makeDeps(): MessageHandlerDependencies {
  return {
    io: makeIO(),
    prisma: makePrisma(),
    messagingService: { handleMessage: jest.fn() } as any,
    translationService: { retranslateMessageAsync: jest.fn(() => Promise.resolve()) } as any,
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: { createMessageNotification: jest.fn() } as any,
    connectedUsers: new Map<string, any>(),
    socketToUser: new Map<string, string>(),
    stats: { messages_processed: 0, errors: 0 },
    agentClient: null,
    attachmentService: {
      getAttachment: jest.fn(),
      deleteAttachment: jest.fn(() => Promise.resolve()),
    } as any,
    readStatusService: {
      getUnreadCountsForParticipants: jest.fn(),
      markMessagesAsReceived: jest.fn(),
      getLatestMessageSummary: jest.fn(),
    } as any,
    privacyPreferencesService: {
      shouldShowReadReceipts: jest.fn(),
      getPreferencesForUsers: jest.fn(),
    } as any,
  } as MessageHandlerDependencies;
}

/**
 * La ligne que le `select` de `handleMessageEdit` rapporte réellement — pas une
 * ligne inventée. Tout ce que le producteur peut servir doit sortir d'ici : si
 * un champ requis n'y est pas, c'est le `select` qu'il faut élargir, et le
 * témoin doit le dire en tombant.
 */
function makeMessageRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_MSG_ID,
    conversationId: VALID_CONV_ID,
    senderId: PARTICIPANT_ID,
    content: 'Original content',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: CREATED_AT,
    expiresAt: null,
    metadata: null,
    sender: { id: PARTICIPANT_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'member' },
    attachments: [],
    conversation: { isActive: true, closedAt: null, createdAt: CREATED_AT, lastMessageAt: CREATED_AT, participants: [] },
    ...overrides,
  };
}

// ── Suite ──────────────────────────────────────────────────────────────────

describe('message:edited — le transport socket sert le contrat que le décodeur iOS EXIGE', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;

  /** La charge utile `message:edited` réellement passée à `emit`. */
  function emittedEdited(): Record<string, unknown> | undefined {
    const call = emitsTo(deps.io, ROOMS.conversation(VALID_CONV_ID))
      .find((c) => c[0] === SERVER_EVENTS.MESSAGE_EDITED);
    return call?.[1] as Record<string, unknown> | undefined;
  }

  async function editOverSocket(): Promise<Record<string, unknown>> {
    await handler.handleMessageEdit(
      socket,
      { messageId: VALID_MSG_ID, content: 'Edited content' },
      callback
    );
    const payload = emittedEdited();
    // Nommer le refus quand il y en a un : sans cela le témoin tombe sur
    // « payload undefined » et laisse chercher partout, alors que le
    // gestionnaire a déjà dit pourquoi il n'a rien émis.
    expect(callback).not.toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(payload).toBeDefined();
    return payload as Record<string, unknown>;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: 'Edited content' },
    });
    mockGetCacheStore.mockReturnValue({ get: mockCacheGet, set: mockCacheSet });
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockResolvedValue(undefined);
    mockNormalizeConversationId.mockResolvedValue(VALID_CONV_ID);
    mockResolveMentionedUsers.mockResolvedValue([]);

    deps = makeDeps();
    handler = new MessageHandler(deps);
    socket = makeSocket();
    callback = jest.fn();

    deps.socketToUser.set('socket-1', USER_ID);
    deps.connectedUsers.set(USER_ID, {
      id: USER_ID, socketId: 'socket-1', isAnonymous: false,
      language: 'fr', resolvedLanguages: ['fr'], userId: USER_ID, participantId: PARTICIPANT_ID,
    });
    mockGetConnectedUser.mockImplementation((id: string, map: Map<string, any>) => {
      const u = map.get(id);
      return u ? { user: u, realUserId: u.id } : null;
    });

    (deps.prisma.message.findFirst as jest.Mock<any>).mockResolvedValue(makeMessageRecord());
    (deps.prisma.message.updateMany as jest.Mock<any>).mockResolvedValue({ count: 1 });
    (deps.prisma.participant.findMany as jest.Mock<any>).mockResolvedValue([]);
    (deps.prisma.mention.findMany as jest.Mock<any>).mockResolvedValue([]);
  });

  it("sert `senderId` — sans lui le décodage iOS du message ENTIER échoue", async () => {
    const payload = await editOverSocket();

    // `APIMessage.senderId` est un `String` NON optionnel, décodé en
    // `try c.decode`. Son absence ne dégrade pas la bulle : elle fait tomber
    // tout le message, en silence, dans un `decode DROP`.
    expect(payload.senderId).toBeDefined();
  });

  it("sert `createdAt` — même exigence, même issue silencieuse", async () => {
    const payload = await editOverSocket();

    expect(payload.createdAt).toBeDefined();
  });

  it('sert `messageType` — requis par `SocketIOMessage`', async () => {
    const payload = await editOverSocket();

    expect(payload.messageType).toBe('text');
  });

  it("sert le `senderId` du fil comme un `User.id`, pas un `Participant.id`", async () => {
    const payload = await editOverSocket();

    // Le contrat de fil est celui de `buildMessageNewPayload` : les clients
    // comparent le `senderId` reçu à leur propre `User.id` pour reconnaître
    // leurs messages. Servir le `Participant.id` sur l'édition et le `User.id`
    // sur l'envoi ferait de la même bulle « la mienne » puis « celle d'un
    // autre » selon l'événement qui l'a touchée en dernier.
    expect(payload.senderId).toBe(USER_ID);
  });

  it('ne perd RIEN de ce que le producteur servait déjà', async () => {
    const payload = await editOverSocket();

    // Le lot est ADDITIF : un décodeur qui lisait déjà l'un de ces champs
    // continue de le lire. Ce témoin est ce qui rend la mesure vérifiable.
    expect(payload.id).toBe(VALID_MSG_ID);
    expect(payload.conversationId).toBe(VALID_CONV_ID);
    expect(payload.content).toBe('Edited content');
    expect(payload.originalLanguage).toBe('fr');
    expect(payload.isEdited).toBe(true);
    expect(payload.editedAt).toBeInstanceOf(Date);
    expect(payload.translations).toEqual([]);
    expect(payload.attachments).toEqual([]);
    expect(payload.sender).toEqual(
      expect.objectContaining({ id: PARTICIPANT_ID, userId: USER_ID, displayName: 'Alice' })
    );
  });
});
