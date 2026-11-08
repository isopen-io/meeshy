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
import { matchesMongoWhere, type MongoDocument } from '../../../__tests__/helpers/mongo-where';
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
  resolveMentionedUsers: (...a: any[]) => mockResolveMentionedUsers(...a), withoutPendingMessageRequests: async (_p: unknown, _c: unknown, ids: readonly string[]) => [...ids],
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
  const sent: Array<{ rooms: readonly string[]; excepts: readonly string[]; args: any[] }> = [];
  // `except` RETIENT, il n'avale plus. Un double qui le laissait tomber
  // enregistrait une diffusion de room comme si elle atteignait TOUT LE MONDE,
  // y compris les lecteurs qu'elle venait d'exclure : aucun témoin d'exclusion
  // ne pouvait s'y écrire — un double mente aussi par ce qu'il ACCEPTE.
  const chain = (rooms: readonly string[], excepts: readonly string[]): any => ({
    to: jest.fn((room: string) => chain([...rooms, room], excepts)),
    except: jest.fn((room: string | string[]) =>
      chain(rooms, [...excepts, ...(Array.isArray(room) ? room : [room])]),
    ),
    emit: jest.fn((...args: any[]) => {
      sent.push({ rooms, excepts, args });
      for (const room of rooms) emitsByRoom.set(room, [...(emitsByRoom.get(room) ?? []), args]);
      return true;
    }),
  });
  return {
    to: jest.fn((room: string) => chain([room], [])),
    sockets: { adapter: { rooms: new Map() } },
    __emitsByRoom: emitsByRoom,
    __sent: sent,
  } as unknown as jest.Mocked<SocketIOServer>;
}

/** Les émissions d'un événement qui ATTEIGNENT réellement une room donnée. */
function reaching(io: SocketIOServer, event: string, room: string): any[] {
  const sent = (io as unknown as { __sent: Array<{ rooms: readonly string[]; excepts: readonly string[]; args: any[] }> }).__sent;
  return sent.filter(
    (s) =>
      s.args[0] === event &&
      (s.rooms.includes(room) || s.rooms.includes(ROOMS.conversation(VALID_CONV_ID))) &&
      !s.excepts.includes(room),
  );
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

/**
 * Le PLANCHER D'HISTORIQUE sur ce transport — le second de l'édition.
 *
 * Un audit adversarial l'a prouvé ROUGE : la garde du cycle 147 avait été
 * posée sur `broadcastMessageMutation` (le chemin REST) et pas ici, alors que
 * deux doc-comments du dépôt nomment celui-ci « le transport d'édition
 * PRIMAIRE ». `CLIENT_EVENTS.MESSAGE_EDIT` est enregistré, validé Zod et
 * rate-limité : toute socket authentifiée l'atteint. Et #9223 exige qu'un
 * ancien client continue de fonctionner — c'est précisément l'ancien web qui
 * l'émettait.
 *
 * Les témoins vivent dans CE fichier, et non dans un nouveau : son harnais
 * porte déjà les seize doubles de module du gestionnaire, et en recopier une
 * partie est le « double partiel » que le dépôt documente trois fois (il ne se
 * signale qu'au moment où le module grandit).
 *
 * Le double de participants ÉVALUE le `where` : la requête des lecteurs
 * TARDIFS doit pouvoir ne rien rendre, sans quoi chaque participant est tenu
 * pour suspect et l'audience se restreint dans tous les témoins du fichier.
 */
describe('message:edited — le transport socket respecte le PLANCHER D\'HISTORIQUE', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;

  const HOTE: MongoDocument = {
    id: PARTICIPANT_ID, userId: USER_ID, conversationId: VALID_CONV_ID, isActive: true,
    role: 'creator', joinedAt: new Date(CREATED_AT.getTime() - 86_400_000),
    shareLinkId: null, historyVisibleFrom: null, permissions: null,
    anonymousSession: null, user: { role: 'USER' },
  };

  /** Entré APRÈS le message, et son lien REFUSE l'historique. */
  const invite = (overrides: MongoDocument = {}): MongoDocument => ({
    id: 'p-invite', userId: null, conversationId: VALID_CONV_ID, isActive: true,
    role: 'member', joinedAt: new Date(CREATED_AT.getTime() + 60_000),
    shareLinkId: 'lnk-ferme', historyVisibleFrom: null, permissions: null,
    anonymousSession: { rights: null }, user: null, ...overrides,
  });

  const ROOM_INVITE = ROOMS.user('p-invite');

  function armer(participants: MongoDocument[]): void {
    (deps.prisma.participant.findMany as jest.Mock<any>).mockImplementation(async (args: any) =>
      participants.filter((row) => matchesMongoWhere(row, args?.where ?? {})),
    );
    (deps.prisma.message.findUnique as jest.Mock<any>).mockResolvedValue({ createdAt: CREATED_AT });
    (deps.prisma as unknown as Record<string, unknown>).conversationShareLink = {
      findMany: jest.fn(async () => [
        { id: 'lnk-ferme', allowViewHistory: false },
        { id: 'lnk-ouvert', allowViewHistory: true },
      ]),
    };
  }

  const editer = () =>
    handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'SECRET APRÈS ÉDITION' }, callback);

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockGetRateLimitInfo.mockReturnValue({ resetIn: 30000 });
    mockValidateSocketEvent.mockReturnValue({
      success: true,
      data: { messageId: VALID_MSG_ID, content: 'SECRET APRÈS ÉDITION' },
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
    (deps.prisma.mention.findMany as jest.Mock<any>).mockResolvedValue([]);
  });

  it('un invité SANS historique, entré après le message, ne reçoit pas le texte édité', async () => {
    armer([HOTE, invite()]);

    await editer();

    // Ni par sa room personnelle, ni par une diffusion de room qui l'inclut.
    expect(reaching(deps.io, SERVER_EVENTS.MESSAGE_EDITED, ROOM_INVITE)).toEqual([]);
  });

  it("l'hôte reçoit bien son édition — la porte échoue en montrant moins, pas rien", async () => {
    armer([HOTE, invite()]);

    await editer();

    const versHote = reaching(deps.io, SERVER_EVENTS.MESSAGE_EDITED, ROOMS.user(USER_ID));
    expect(versHote.length).toBeGreaterThan(0);
    expect(JSON.stringify(versHote)).toContain('SECRET APRÈS ÉDITION');
  });

  it('cas nominal — personne n’est arrivé après le message : la room entière', async () => {
    armer([HOTE, invite({ joinedAt: new Date(CREATED_AT.getTime() - 3_600_000) })]);

    await editer();

    const versRoom = emitsTo(deps.io, ROOMS.conversation(VALID_CONV_ID)).filter(
      (c) => c[0] === SERVER_EVENTS.MESSAGE_EDITED,
    );
    expect(versRoom.length).toBe(1);
  });

  it('un invité entré après le message mais par un lien OUVERT reçoit son édition', async () => {
    armer([HOTE, invite({ shareLinkId: 'lnk-ouvert' })]);

    await editer();

    const versRoom = emitsTo(deps.io, ROOMS.conversation(VALID_CONV_ID)).filter(
      (c) => c[0] === SERVER_EVENTS.MESSAGE_EDITED,
    );
    expect(versRoom.length).toBe(1);
  });
});

/**
 * #17026 — CINQUIÈME site de la famille, que l'issue n'énumérait pas.
 *
 * `handleMessageEdit` lit le plan signé, émet `message:edited`, PUIS enfile
 * pour les absents — les trois dans le MÊME `try`, dont le `catch` journalise
 * « message:edit failed » et rend une erreur au client. L'édition est déjà
 * PERSISTÉE à ce point (`message.updateMany` a rendu `{count: 1}`) : une
 * diffusion ou une lecture tombée la faisait donc disparaître pour les pairs EN
 * LIGNE **et** pour les ABSENTS, en annonçant à l'éditeur un échec sur un geste
 * réussi.
 *
 * Une énumération de sites porte DEUX affirmations — « ces sites appliquent la
 * règle » (vérifiable) et « ce sont les sites où elle s'applique » (presque
 * jamais vérifiée, leçon 261). Celui-ci s'est trouvé en relisant ce que l'import
 * partagé touchait dans le fichier, pas en cherchant le site.
 */
describe('#17026 — l’émission de `message:edited` n’emporte pas l’enfilage des absents', () => {
  let handler: MessageHandler;
  let deps: ReturnType<typeof makeDeps>;
  let socket: jest.Mocked<Socket>;
  let callback: jest.Mock<any>;
  let enqueueSpy: jest.Mock<any>;

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

    // La SORTIE DURABLE, observée à sa frontière : la file elle-même n'est pas
    // câblée dans ce harnais, et c'est l'APPEL qui porte la garantie.
    enqueueSpy = jest.fn(async () => undefined) as jest.Mock<any>;
    (handler as unknown as Record<string, unknown>)._enqueueOfflineEventForParticipants = enqueueSpy;

    // `io.to(...).emit(...)` LÈVE sur `message:edited` — adaptateur ou encodeur
    // en défaut, ce que le dépôt affirme là où il s'en garde (`emitWithSeq`).
    const io = deps.io as unknown as { to: jest.Mock<any> };
    const base = io.to;
    io.to = jest.fn((room: string) => {
      const target = base(room);
      return { ...target, emit: jest.fn((event: string) => { if (event === SERVER_EVENTS.MESSAGE_EDITED) throw new Error('adapter down'); return true; }) };
    }) as jest.Mock<any>;
  });

  it('une diffusion tombée laisse l’enfilage hors ligne avoir lieu', async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(enqueueSpy).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'edited', messageId: VALID_MSG_ID }),
    );
  });

  it("et l'éditeur n'apprend pas un ÉCHEC sur une édition persistée", async () => {
    await handler.handleMessageEdit(socket, { messageId: VALID_MSG_ID, content: 'Edited content' }, callback);

    expect(callback).not.toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
