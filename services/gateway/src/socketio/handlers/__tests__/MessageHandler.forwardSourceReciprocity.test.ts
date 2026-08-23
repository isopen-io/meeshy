/**
 * @jest-environment node
 *
 * `message:new` — la SOURCE d'un transfert ne doit pas QUITTER le serveur vers
 * un destinataire à qui la réciprocité l'interdit.
 *
 * Ce chemin est le plus exposé des trois : Socket.IO ne passe PAS par
 * fast-json-stringify, donc rien n'y est strippé par omission de déclaration.
 * Ce que le handler pose sur le payload part littéralement sur le fil.
 *
 * Et il est le plus difficile : `message:new` est diffusé À UN SALON, un seul
 * objet pour tous. La moitié « lecteur » de la règle exige donc un découpage.
 * Celui qu'on emploie ici passe par les SALONS UTILISATEUR (`ROOMS.user`), que
 * l'adaptateur Redis propage — et surtout PAS par l'énumération de socket ids
 * de `_emitMessageNewByLanguage`, qui ne voit que le nœud local et dont le
 * repli multi-nœud rediffuse le payload COMPLET.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Server as SocketIOServer, Socket } from 'socket.io';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
    warn: jest.fn(),
  },
  performanceLogger: {
    withTiming: jest.fn().mockImplementation((_n: unknown, fn: () => unknown) => fn()),
  },
}));

const mockNormalizeConversationId = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/socket-helpers', () => ({
  getConnectedUser: jest.fn(),
  extractJWTToken: jest.fn(),
  extractSessionToken: jest.fn(),
  normalizeConversationId: (...a: any[]) => mockNormalizeConversationId(...a),
}));

jest.mock('../../../middleware/validation', () => ({ validateSocketEvent: jest.fn() }));
jest.mock('../../../config/message-limits', () => ({
  validateMessageLength: jest.fn(() => ({ isValid: true })),
  MESSAGE_LIMITS: { MAX_MESSAGE_LENGTH: 5000 },
}));
jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: () => ({ checkLimit: jest.fn(), getRateLimitInfo: jest.fn() }),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'a' },
    MESSAGE_SEND_PER_CONVERSATION: { maxRequests: 10, windowMs: 10000, keyPrefix: 'b' },
  },
}));
jest.mock('../../../utils/blocking', () => ({ isBlockedBetween: jest.fn() }));
jest.mock('../../utils/participant-resolver', () => ({ resolveParticipant: jest.fn() }));
jest.mock('../../utils/message-payload-filter', () => ({
  groupSocketsByLanguage: jest.fn(),
  filterMessagePayloadForLanguages: jest.fn((p: unknown) => p),
}));
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: () => ({ get: jest.fn<any>().mockResolvedValue(null), set: jest.fn<any>().mockResolvedValue(undefined) }),
}));
jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn<any>().mockResolvedValue([]),
  resolveUsernamesToIds: jest.fn<any>().mockResolvedValue([]),
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
  conversationStatsService: { updateOnNewMessage: jest.fn<any>().mockResolvedValue(undefined) },
}));
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  conversationMessageStatsService: { onNewMessage: jest.fn<any>().mockResolvedValue(undefined) },
}));

import { MessageHandler, type MessageHandlerDependencies } from '../MessageHandler';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

// ── Constantes ─────────────────────────────────────────────────────────────

const CONV_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';
const FORWARDER_USER_ID = 'user0011223344556677889900';
const FORWARDER_PARTICIPANT_ID = 'part0011223344556677889900';
/** Destinataire qui laisse le réglage à `true` (le défaut). */
const OPEN_READER_ID = 'user0022334455667788990011';
/** Destinataire qui a DÉSACTIVÉ l'affichage des sources. */
const SILENT_READER_ID = 'user0033445566778899001122';

const ORIGIN_ID = 'orig-msg';
const ORIGIN_CONV_ID = 'orig-conv';

// ── Un io qui RETIENT ses cibles, ses exclusions et ses payloads ───────────

type Emission = { readonly rooms: string[]; readonly except: string[]; readonly event: string; readonly payload: any };

function makeRecordingIO() {
  const emissions: Emission[] = [];

  const operator = (rooms: string[], except: string[]): any => ({
    to: (r: string | string[]) => operator([...rooms, ...(Array.isArray(r) ? r : [r])], except),
    except: (r: string | string[]) => operator(rooms, [...except, ...(Array.isArray(r) ? r : [r])]),
    emit: (event: string, payload: any) => {
      emissions.push({ rooms, except, event, payload });
      return true;
    },
  });

  const io = {
    to: (r: string | string[]) => operator(Array.isArray(r) ? r : [r], []),
    sockets: { adapter: { rooms: new Map() } },
  } as unknown as jest.Mocked<SocketIOServer>;

  return { io, emissions };
}

type Options = { readonly optedOut?: readonly string[] };

type QueuedEntry = { readonly queueKey: string; readonly payload: any };

function makeDeps({ optedOut = [] }: Options) {
  const { io, emissions } = makeRecordingIO();
  const queued: QueuedEntry[] = [];

  const prisma = {
    conversation: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: FORWARDER_PARTICIPANT_ID, userId: FORWARDER_USER_ID, joinedAt: new Date() },
        { id: 'p-open', userId: OPEN_READER_ID, joinedAt: new Date() },
        { id: 'p-silent', userId: SILENT_READER_ID, joinedAt: new Date() },
      ]),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
    message: {
      findUnique: jest.fn<any>(({ where }: any) => {
        if (where?.id === ORIGIN_ID) {
          return Promise.resolve({
            id: ORIGIN_ID,
            content: "Message d'origine",
            senderId: 'origin-participant',
            messageType: 'text',
            createdAt: new Date(),
            metadata: null,
            sender: { id: 'origin-participant', userId: 'origin-user', displayName: 'Auteur Origine', avatar: null, type: 'user' },
            attachments: [],
          });
        }
        return Promise.resolve({ translations: [] });
      }),
    },
    conversation_: null,
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    post: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userPreferences: {
      findMany: jest.fn<any>((args: any) =>
        Promise.resolve(
          (args?.where?.userId?.in ?? [])
            .filter((id: string) => optedOut.includes(id))
            .map((userId: string) => ({ userId, privacy: { showForwardSource: false } }))
        )
      ),
    },
    userPreference: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as unknown as jest.Mocked<PrismaClient>;

  (prisma as any).conversation.findUnique = jest.fn<any>().mockResolvedValue({
    id: ORIGIN_CONV_ID,
    title: 'Groupe Public Source',
    identifier: 'mshy_source',
    type: 'public',
    avatar: null,
  });

  const deps = {
    io,
    prisma,
    messagingService: { handleMessage: jest.fn() } as any,
    translationService: {} as any,
    statusService: { updateLastSeen: jest.fn() } as any,
    notificationService: { createMessageNotification: jest.fn() } as any,
    connectedUsers: new Map<string, any>(),
    socketToUser: new Map<string, string>(),
    stats: { messages_processed: 0, errors: 0 },
    agentClient: null,
    attachmentService: { getAttachment: jest.fn(), getAttachmentsByIds: jest.fn<any>().mockResolvedValue([]) } as any,
    readStatusService: {
      getUnreadCountsForParticipants: jest.fn<any>().mockResolvedValue(new Map()),
      markMessagesAsReceived: jest.fn<any>().mockResolvedValue(undefined),
      getLatestMessageSummary: jest.fn<any>().mockResolvedValue(null),
    } as any,
    privacyPreferencesService: {
      shouldShowReadReceipts: jest.fn<any>().mockResolvedValue(false),
      getPreferencesForUsers: jest.fn<any>().mockResolvedValue(new Map()),
    } as any,
    // `connectedUsers` reste VIDE : tout le monde est hors ligne, donc tout le
    // monde passe par la file de rejeu.
    deliveryQueue: {
      enqueue: jest.fn<any>(async (queueKey: string, entry: any) => {
        queued.push({ queueKey, payload: entry.payload });
      }),
    } as any,
  } as unknown as MessageHandlerDependencies;

  return { deps, emissions, queued };
}

const forwardedMessage = () => ({
  id: 'msg-forward-1',
  conversationId: CONV_ID,
  senderId: FORWARDER_PARTICIPANT_ID,
  content: 'regarde',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date(),
  replyToId: null,
  storyReplyToId: null,
  forwardedFromId: ORIGIN_ID,
  forwardedFromConversationId: ORIGIN_CONV_ID,
  isEncrypted: false,
  sender: { id: FORWARDER_PARTICIPANT_ID, userId: FORWARDER_USER_ID, displayName: 'Transfereur', username: 'transfereur', avatar: null, type: 'user' },
  attachments: [],
  translations: [],
});

const messageNewEmissions = (emissions: Emission[]) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_NEW);

/** Ce que reçoit RÉELLEMENT un lecteur donné : la 1re émission qui l'atteint. */
const payloadReaching = (emissions: Emission[], userId: string) =>
  messageNewEmissions(emissions).find(
    (e) =>
      (e.rooms.includes(`conversation:${CONV_ID}`) || e.rooms.includes(`user:${userId}`)) &&
      !e.except.includes(`user:${userId}`)
  )?.payload;

async function broadcast(options: Options) {
  const { deps, emissions, queued } = makeDeps(options);
  const handler = new MessageHandler(deps);
  await handler.broadcastNewMessage(forwardedMessage() as any, CONV_ID);
  return { emissions, queued };
}

const emissionsOf = async (options: Options) => (await broadcast(options)).emissions;

const queuedFor = (queued: QueuedEntry[], userId: string) =>
  queued.find((entry) => entry.queueKey === userId)?.payload;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('message:new — réciprocité de la source des transferts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizeConversationId.mockImplementation((id: string) => Promise.resolve(id));
    clearPrivacyPreferencesCache();
  });

  it("sert la source à tout le salon quand personne n'a rien réglé — défaut TRUE", async () => {
    const emissions = await emissionsOf({});

    expect(payloadReaching(emissions, OPEN_READER_ID)?.forwardedFrom).toBeDefined();
    expect(payloadReaching(emissions, SILENT_READER_ID)?.forwardedFromConversation).toBeDefined();
  });

  it("ne diffuse AUCUN nom quand l'AUTEUR du transfert a désactivé", async () => {
    const emissions = await emissionsOf({ optedOut: [FORWARDER_USER_ID] });

    for (const emission of messageNewEmissions(emissions)) {
      if (emission.rooms.includes(`user:${FORWARDER_USER_ID}`)) continue;
      expect(emission.payload.forwardedFrom).toBeUndefined();
      expect(emission.payload.forwardedFromConversation).toBeUndefined();
      expect(JSON.stringify(emission.payload)).not.toContain('Groupe Public Source');
      expect(JSON.stringify(emission.payload)).not.toContain('Auteur Origine');
    }
  });

  it("ne livre pas la source au LECTEUR qui a désactivé, tout en la servant aux autres", async () => {
    const emissions = await emissionsOf({ optedOut: [SILENT_READER_ID] });

    const silent = payloadReaching(emissions, SILENT_READER_ID);
    expect(silent).toBeDefined();
    expect(silent.forwardedFrom).toBeUndefined();
    expect(silent.forwardedFromConversation).toBeUndefined();

    expect(payloadReaching(emissions, OPEN_READER_ID)?.forwardedFrom).toBeDefined();
  });

  it('conserve les identifiants pour le lecteur masqué — le badge « Transféré » survit', async () => {
    const emissions = await emissionsOf({ optedOut: [SILENT_READER_ID] });
    const silent = payloadReaching(emissions, SILENT_READER_ID);

    expect(silent.forwardedFromId).toBe(ORIGIN_ID);
    expect(silent.forwardedFromConversationId).toBe(ORIGIN_CONV_ID);
  });

  it("laisse l'auteur du transfert voir SA propre source sur ses autres appareils", async () => {
    const emissions = await emissionsOf({ optedOut: [FORWARDER_USER_ID] });
    const own = messageNewEmissions(emissions).find((e) => e.rooms.includes(`user:${FORWARDER_USER_ID}`));

    expect(own?.payload.forwardedFrom).toBeDefined();
    expect(own?.payload.forwardedFromConversation).toBeDefined();
  });

  it("ne REJOUE pas la source au lecteur retiré qui était hors ligne", async () => {
    // Sans garde sur la file, la règle n'est qu'un rideau différé : le nom
    // arrive intact au drain de reconnexion.
    const { queued } = await broadcast({ optedOut: [SILENT_READER_ID] });

    const silent = queuedFor(queued, SILENT_READER_ID);
    expect(silent).toBeDefined();
    expect(silent.forwardedFrom).toBeUndefined();
    expect(silent.forwardedFromConversation).toBeUndefined();
    expect(silent.forwardedFromId).toBe(ORIGIN_ID);

    expect(queuedFor(queued, OPEN_READER_ID)?.forwardedFrom).toBeDefined();
  });

  it("ne REJOUE la source à personne quand l'AUTEUR s'est retiré", async () => {
    const { queued } = await broadcast({ optedOut: [FORWARDER_USER_ID] });

    for (const entry of queued) {
      expect(entry.payload.forwardedFrom).toBeUndefined();
      expect(entry.payload.forwardedFromConversation).toBeUndefined();
    }
  });

  it("n'exclut PERSONNE du salon quand tout le monde autorise — aucun coût sur le cas nominal", async () => {
    const emissions = await emissionsOf({});
    const roomEmission = messageNewEmissions(emissions).find((e) =>
      e.rooms.includes(`conversation:${CONV_ID}`)
    );

    expect(roomEmission?.except).toEqual([`user:${FORWARDER_USER_ID}`]);
  });
});
