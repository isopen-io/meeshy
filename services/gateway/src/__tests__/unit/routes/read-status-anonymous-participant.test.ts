/**
 * Route tests — le suivi de lecture d'un participant SANS COMPTE.
 *
 * Un invité de lien partagé est un participant de plein droit : il lit, il
 * envoie, il réagit. Le serveur compte même ses non-lus et lui pousse le badge
 * dans sa room personnelle (`ROOMS.user(userId ?? id)`, rejointe par
 * `AuthHandler` pour les sockets anonymes). Il ne lui manquait que la moitié qui
 * REMET LE BADGE À ZÉRO, et elle lui manquait deux fois :
 *
 *   1. la porte — `allowAnonymous: false` répondait 403 avant de regarder la
 *      conversation ;
 *   2. la clé — chaque garde d'appartenance filtrait `Participant.userId` avec
 *      `authContext.userId`, qui vaut un **Participant.id** pour un anonyme
 *      (`middleware/auth.ts`). La comparaison n'appariait donc rien.
 *
 * Ces tests verrouillent les deux moitiés. Le double Prisma APPARIE RÉELLEMENT
 * le `where` : une garde revenue à `userId` seul ne trouve plus le participant
 * et le test rougit, ce qu'un `mockResolvedValue` constant n'aurait jamais vu.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import messageReadStatusRoutes from '../../../routes/message-read-status';
import { findFirstIn, type MongoDocument } from '../../helpers/mongo-where';
import { makeChainableIO } from '../../helpers/chainable-io';

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const MESSAGE_ID = '507f1f77bcf86cd799439013';
const ANONYMOUS_PARTICIPANT_ID = '507f1f77bcf86cd799439088';
const REGISTERED_USER_ID = '507f1f77bcf86cd799439077';
const REGISTERED_PARTICIPANT_ID = '507f1f77bcf86cd799439066';
const UNREAD_COUNT = 4;
// #4349 critère 4 — DÉLIBÉRÉMENT différent d'`UNREAD_COUNT` : `markedCount` est
// ce que le marquage a FIGÉ, jamais le compte de non-lus d'avant.
const FROZEN_COUNT = 6;

// --- module mocks (le préfixe `mock` est requis par le hoisting de jest) ---

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args)
}));

const mockShouldShowReadReceipts = jest.fn();
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: mockShouldShowReadReceipts
  }))
}));

/**
 * Le contexte d'auth est mutable pour que chaque test choisisse SON appelant.
 * `mockAuthOptions` capture les options du middleware : c'est la seule façon de
 * verrouiller `allowAnonymous` sans monter la vraie chaîne d'authentification.
 */
const mockAuthContext: { current: Record<string, unknown> } = { current: {} };
const mockAuthOptions: Array<Record<string, unknown>> = [];
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, options: Record<string, unknown>) => {
    mockAuthOptions.push(options);
    return async (request: any) => {
      request.authContext = mockAuthContext.current;
    };
  }
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn()
}));

const mockGetMessageReadStatus = jest.fn();
const mockGetConversationReadStatuses = jest.fn();
const mockGetUnreadCount = jest.fn();
const mockMarkMessagesAsRead = jest.fn();
const mockMarkMessagesAsReceived = jest.fn();
const mockGetLatestMessageSummary = jest.fn();
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageReadStatus: mockGetMessageReadStatus,
    getConversationReadStatuses: mockGetConversationReadStatuses,
    getUnreadCount: mockGetUnreadCount,
    markMessagesAsRead: mockMarkMessagesAsRead,
    markMessagesAsReceived: mockMarkMessagesAsReceived,
    getLatestMessageSummary: mockGetLatestMessageSummary
  }))
}));

jest.mock('../../../utils/rate-limiter', () => ({
  createCustomRateLimiter: () => ({
    middleware: () => async () => undefined
  })
}));

// --- double Prisma : deux lignes `Participant`, appariées pour de vrai ---
//
// `findFirstIn` ÉVALUE le `where` (helpers/mongo-where) : une garde revenue à
// `userId` seul cesse de trouver la ligne anonyme, et le test le voit. Aucune
// ligne ne porte `bannedAt` — c'est la branche `isSet: false` d'`unsetOrNull`
// qui l'apparie, exactement comme en base.

const ROWS: MongoDocument[] = [
  { id: ANONYMOUS_PARTICIPANT_ID, userId: null, conversationId: CONVERSATION_ID, isActive: true },
  { id: REGISTERED_PARTICIPANT_ID, userId: REGISTERED_USER_ID, conversationId: CONVERSATION_ID, isActive: true }
];

const participantFindFirst = jest.fn(findFirstIn(ROWS));

const mockPrisma: any = {
  participant: { findFirst: participantFindFirst, findMany: jest.fn(), findUnique: jest.fn() },
  message: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  messageStatusEntry: { findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
  conversationReadCursor: {
    upsert: jest.fn(), updateMany: jest.fn(), create: jest.fn(),
    findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn()
  }
};

function anonymousContext() {
  return {
    type: 'anonymous',
    isAuthenticated: true,
    isAnonymous: true,
    participantId: ANONYMOUS_PARTICIPANT_ID,
    // C'est le piège que ces tests verrouillent : `userId` porte un
    // `Participant.id` pour un anonyme.
    userId: ANONYMOUS_PARTICIPANT_ID,
    hasFullAccess: false
  };
}

function registeredContext() {
  return {
    type: 'user',
    isAuthenticated: true,
    isAnonymous: false,
    userId: REGISTERED_USER_ID,
    hasFullAccess: true
  };
}

describe('read-status routes — un participant sans compte', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.decorate('prisma', mockPrisma);
    // Un `io` est nécessaire pour que la question de la confidentialité se pose
    // : l'unité partagée abandonne avant de la poser quand aucun socket n'est
    // joignable — il n'y aurait rien à taire. Ce double ne sert qu'à ouvrir le
    // chemin ; les assertions d'émission vivent dans le second `describe`.
    app.decorate('socketIOHandler', {
      getManager: () => ({ getIO: () => makeChainableIO() })
    } as never);
    await app.register(messageReadStatusRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    participantFindFirst.mockClear();
    mockResolveConversationId.mockReset().mockResolvedValue(CONVERSATION_ID);
    mockShouldShowReadReceipts.mockReset().mockResolvedValue(false);
    mockGetUnreadCount.mockReset().mockResolvedValue(UNREAD_COUNT);
    mockMarkMessagesAsRead.mockReset().mockResolvedValue(FROZEN_COUNT);
    mockMarkMessagesAsReceived.mockReset().mockResolvedValue(undefined);
    mockGetLatestMessageSummary.mockReset().mockResolvedValue(null);
    mockGetConversationReadStatuses.mockReset().mockResolvedValue(new Map([[MESSAGE_ID, { readBy: [] }]]));
    mockGetMessageReadStatus.mockReset().mockResolvedValue({ readBy: [] });
    mockPrisma.message.findUnique.mockReset().mockResolvedValue({ id: MESSAGE_ID, conversationId: CONVERSATION_ID, senderId: 'someone-else' });
    // #4349 — la garde d'appartenance de la COLLECTION lit les ids RAPPORTÉS
    // par `findMany` (là où la porte d'avant lisait `findUnique`) et échoue
    // FERMÉ quand la lecture ne les rend pas tous. Le double rejoue la ligne
    // que `findUnique` décrit.
    mockPrisma.message.findMany.mockReset().mockImplementation(async (args: any) => {
      const ids: string[] = args?.where?.id?.in ?? [];
      if (ids.length === 0) return [];
      const row = await mockPrisma.message.findUnique();
      if (!row || row.deletedAt || row.conversationId !== args?.where?.conversationId) return [];
      return ids.map((id) => ({ id, senderId: row.senderId, createdAt: row.createdAt ?? new Date(0) }));
    });
    mockPrisma.participant.findMany.mockReset().mockResolvedValue([]);
    mockPrisma.participant.findUnique.mockReset().mockResolvedValue(null);
    mockAuthContext.current = anonymousContext();
  });

  it('ouvre la porte aux participants sans compte (allowAnonymous), sans ouvrir aux non-authentifiés', () => {
    expect(mockAuthOptions).not.toHaveLength(0);
    for (const options of mockAuthOptions) {
      expect(options).toMatchObject({ requireAuth: true, allowAnonymous: true });
    }
  });

  it('mark-as-read résout l\'appelant par Participant.id, jamais par la colonne userId', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.markedCount).toBe(FROZEN_COUNT);
    expect(response.json().data.markedCount).not.toBe(UNREAD_COUNT);
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(
      ANONYMOUS_PARTICIPANT_ID,
      CONVERSATION_ID,
      undefined,
      undefined
    );
    const wheres = participantFindFirst.mock.calls.map((call: any) => call[0].where);
    expect(wheres).toContainEqual(expect.objectContaining({ id: ANONYMOUS_PARTICIPANT_ID }));
    expect(wheres.every((where: any) => where.userId === undefined)).toBe(true);
  });

  it('mark-as-received avance le curseur du participant sans compte', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`
    });

    expect(response.statusCode).toBe(200);
    expect(mockMarkMessagesAsReceived).toHaveBeenCalledWith(ANONYMOUS_PARTICIPANT_ID, CONVERSATION_ID);
  });

  it('read-statuses répond au participant sans compte', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/read-statuses?messageIds=${MESSAGE_ID}`
    });

    expect(response.statusCode).toBe(200);
  });

  it('le statut de lecture d\'un message reste lisible par le participant sans compte', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/messages/${MESSAGE_ID}/read-status`
    });

    expect(response.statusCode).toBe(200);
  });

  it('les préférences de confidentialité d\'un anonyme sont demandées EN TANT QU\'anonyme', async () => {
    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(mockShouldShowReadReceipts).toHaveBeenCalledWith(ANONYMOUS_PARTICIPANT_ID, true);
  });

  it('refuse un participant sans compte étranger à la conversation', async () => {
    mockAuthContext.current = { ...anonymousContext(), participantId: 'un-participant-ailleurs', userId: 'un-participant-ailleurs' };

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(403);
  });

  it('un utilisateur enregistré reste résolu par sa colonne userId', async () => {
    mockAuthContext.current = registeredContext();

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);
    expect(mockMarkMessagesAsRead).toHaveBeenCalledWith(
      REGISTERED_PARTICIPANT_ID,
      CONVERSATION_ID,
      undefined,
      undefined
    );
    expect(mockShouldShowReadReceipts).toHaveBeenCalledWith(REGISTERED_USER_ID, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENT l'événement NOMME cet acteur sans compte
// ═══════════════════════════════════════════════════════════════════════════════
//
// Les tests ci-dessus verrouillent que l'invité PASSE. Ceux-ci verrouillent ce
// que le serveur DIT de lui en le diffusant.
//
// `read-status:updated` nomme l'acteur par deux champs qui ne disent pas la
// même chose. `participantId` porte sa ligne `Participant` ; `userId` porte sa
// ligne `User` — et un invité de lien n'en a pas. Le contrat le dit aux trois
// bouts de la chaîne, dans les mêmes termes :
//
//   • `ReadStatusUpdatedEventData.userId` (packages/shared) — « `User.id` de
//     l'acteur, ou `null` quand c'est un participant ANONYME »
//   • `ReadStatusUpdateEvent.userId` (iOS, MessageSocketManager.swift) — `String?`
//   • `ReadStatusUpdatedEvent.userId` (Android, SocketEvents.kt) — `String? = null`
//
// `broadcastReadStatus` recevait UN `userId: string` et le servait à DEUX
// rôles opposés : le champ du contrat, et la CLÉ DE ROOM du badge — laquelle
// vaut `userId ?? participantId` (`participantUserRoomTargets`, et
// `AuthHandler` qui fait rejoindre `ROOMS.user(Participant.id)` aux sockets
// anonymes). C'est la forme ROOM qui gagnait, donc le champ partait en portant
// un `Participant.id`.
//
// Les émetteurs SOCKET du MÊME événement nommaient déjà cet acteur `null` —
// `ConversationHandler._resyncReadStatusToSocket` (qui prend un
// `registeredUserId: string | null` distinct de `participantRowId`, et dont le
// commentaire dit exactement pourquoi), `MessageHandler.autoDeliverToOnlineRecipients`,
// et le drain. Le même invité, dans la même conversation, était donc nommé de
// deux façons selon le transport qui parlait.

type CapturedEmit = {
  readonly rooms: readonly string[];
  readonly excepts: readonly string[];
  readonly event: string;
  readonly payload: any;
};

describe('read-status:updated — comment l\'événement nomme un acteur sans compte', () => {
  let socketApp: FastifyInstance;
  const emits: CapturedEmit[] = [];

  // Double de room CHAÎNÉE : `io.to(a).to(b).emit(e, p)` est la forme réelle
  // d'`emitToConversationParticipants`. Capturer la chaîne entière (et pas le
  // dernier `.to()`) est ce qui rend la clé de room observable.
  const chain = (rooms: readonly string[], excepts: readonly string[] = []): any => ({
    to: (room: string) => chain([...rooms, room], excepts),
    // L'exclusion est RETENUE, pas avalee : c'est elle qui garantit que
    // l'acteur ne recoit pas DEUX copies d'un evenement dont une seule porte
    // ses champs prives.
    except: (room: string) => chain(rooms, [...excepts, room]),
    emit: (event: string, payload: unknown) => {
      emits.push({ rooms, excepts, event, payload });
      return true;
    }
  });
  const io = { to: (room: string) => chain([room]) };

  const payloadOf = (event: string) => emits.find((e) => e.event === event)?.payload;
  const roomsOf = (event: string) => emits.find((e) => e.event === event)?.rooms ?? [];

  beforeAll(async () => {
    socketApp = Fastify({ logger: false });
    socketApp.decorate('prisma', mockPrisma);
    socketApp.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) });
    await socketApp.register(messageReadStatusRoutes);
    await socketApp.ready();
  });

  afterAll(async () => {
    await socketApp.close();
  });

  beforeEach(() => {
    emits.length = 0;
    participantFindFirst.mockClear();
    mockResolveConversationId.mockReset().mockResolvedValue(CONVERSATION_ID);
    // Diffusion AUTORISÉE : c'est la branche qui construit le payload.
    mockShouldShowReadReceipts.mockReset().mockResolvedValue(true);
    mockGetUnreadCount.mockReset().mockResolvedValue(UNREAD_COUNT);
    mockMarkMessagesAsRead.mockReset().mockResolvedValue(0);
    mockMarkMessagesAsReceived.mockReset().mockResolvedValue(undefined);
    mockGetLatestMessageSummary.mockReset().mockResolvedValue({
      totalMembers: 2, deliveredCount: 1, readCount: 1
    });
    mockPrisma.message.findUnique.mockReset().mockResolvedValue({
      id: MESSAGE_ID, conversationId: CONVERSATION_ID, senderId: REGISTERED_PARTICIPANT_ID, deletedAt: null
    });
    mockPrisma.participant.findMany.mockReset().mockResolvedValue([
      { id: ANONYMOUS_PARTICIPANT_ID, userId: null },
      { id: REGISTERED_PARTICIPANT_ID, userId: REGISTERED_USER_ID }
    ]);
    mockPrisma.conversationReadCursor.findUnique.mockReset().mockResolvedValue(null);
    mockAuthContext.current = anonymousContext();
  });

  it('mark-as-read ne nomme PAS l\'invité par un User.id qu\'il n\'a pas', async () => {
    const response = await socketApp.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(response.statusCode).toBe(200);
    const payload = payloadOf('read-status:updated');
    expect(payload).toBeDefined();
    expect(payload.userId).toBeNull();
    // L'identité n'est pas perdue : elle est là où le contrat la place pour un
    // participant sans ligne `User`.
    expect(payload.participantId).toBe(ANONYMOUS_PARTICIPANT_ID);
  });

  it('n\'annonce l\'invité que sous UN nom d\'événement', async () => {
    await socketApp.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    // L'alias `message:read-status-updated` doublait cette annonce depuis le
    // 2026-07-05 sans qu'aucun client ne l'écoute — retiré au cycle 64
    // (tasks/socketio-events-cleanup.md § 3). La garde porte sur le NOMBRE de
    // noms, donc un troisième alias la ferait rougir aussi.
    const names = emits.map((e) => e.event).filter((e) => String(e).includes('read-status'));
    expect(new Set(names)).toEqual(new Set(['read-status:updated']));
  });

  it('mark-as-received nomme l\'invité de la même façon', async () => {
    const response = await socketApp.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-received`
    });

    expect(response.statusCode).toBe(200);
    const payload = payloadOf('read-status:updated');
    expect(payload).toBeDefined();
    expect(payload.type).toBe('received');
    expect(payload.userId).toBeNull();
    expect(payload.participantId).toBe(ANONYMOUS_PARTICIPANT_ID);
  });

  it('delivery-receipt nomme l\'invité de la même façon', async () => {
    const response = await socketApp.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/messages/${MESSAGE_ID}/delivery-receipt`
    });

    expect(response.statusCode).toBe(200);
    const payload = payloadOf('read-status:updated');
    expect(payload).toBeDefined();
    expect(payload.userId).toBeNull();
    expect(payload.participantId).toBe(ANONYMOUS_PARTICIPANT_ID);
  });

  // ANTI-SUR-CORRECTION. Nuller le CHAMP ne doit pas nuller la CLÉ DE ROOM :
  // `ROOMS.user(Participant.id)` est celle qu'`AuthHandler` fait rejoindre aux
  // sockets anonymes, et la seule par laquelle le badge d'un invité revient à
  // zéro. Un correctif qui propagerait le `null` jusque-là émettrait vers
  // `user:null` et collerait définitivement le badge de tous les invités.
  it('le badge de l\'invité reste adressé à SA room personnelle', async () => {
    await socketApp.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    expect(roomsOf('conversation:unread-updated')).toEqual([`user:${ANONYMOUS_PARTICIPANT_ID}`]);
    for (const captured of emits) {
      expect(captured.rooms).not.toContain('user:null');
      expect(captured.rooms).not.toContain('user:undefined');
    }
  });

  // L'autre moitié de l'anti-sur-correction : personne n'est laissé de côté,
  // celui sans compte étant joint par son `Participant.id`.
  //
  // Les deux ne sont plus atteints par la MÊME chaîne, et c'est voulu : ici
  // l'invité est l'ACTEUR, donc l'éventail l'exclut pour qu'il reçoive à part
  // la version portant sa frontière de lecture et son arriéré — deux mesures de
  // sa personne, que le pair enregistré n'a pas à recevoir. L'union des chaînes
  // reste ce que ce témoin garde : aucune room ne disparaît.
  it('personne n\'est laissé de côté : le pair enregistré par l\'éventail, l\'acteur sans compte par sa room', async () => {
    await socketApp.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    const readStatusEmits = emits.filter((emit) => emit.event === 'read-status:updated');
    const allRooms = readStatusEmits.flatMap((emit) => emit.rooms);
    expect(allRooms).toContain(`user:${ANONYMOUS_PARTICIPANT_ID}`);
    expect(allRooms).toContain(`user:${REGISTERED_USER_ID}`);

    // L'éventail — la chaîne de plus d'une room — porte le pair, pas l'acteur.
    const fanOut = readStatusEmits.filter((emit) => emit.rooms.length > 1);
    expect(fanOut).not.toHaveLength(0);
    for (const emit of fanOut) {
      expect(emit.rooms).toContain(`user:${REGISTERED_USER_ID}`);
      expect(emit.rooms).not.toContain(`user:${ANONYMOUS_PARTICIPANT_ID}`);
      expect(emit.excepts).toContain(`user:${ANONYMOUS_PARTICIPANT_ID}`);
      expect(emit.payload).not.toHaveProperty('unreadCount');
    }

    // La chaîne d'une seule room est celle de l'acteur, et elle porte les deux
    // champs qui ne regardent que lui.
    const actorEmit = readStatusEmits.find(
      (emit) => emit.rooms.length === 1 && emit.rooms[0] === `user:${ANONYMOUS_PARTICIPANT_ID}`
    );
    expect(actorEmit).toBeDefined();
    expect(actorEmit!.payload).toHaveProperty('unreadCount');
  });

  // NON-RÉGRESSION : l'acteur AVEC compte continue de se nommer par son
  // `User.id`. C'est la moitié du contrat qui porte la synchro multi-appareils
  // du curseur de lecture, et que ce correctif ne touche pas.
  it('un acteur AVEC compte porte toujours son User.id', async () => {
    mockAuthContext.current = registeredContext();

    await socketApp.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-as-read`
    });

    const payload = payloadOf('read-status:updated');
    expect(payload).toBeDefined();
    expect(payload.userId).toBe(REGISTERED_USER_ID);
    expect(payload.participantId).toBe(REGISTERED_PARTICIPANT_ID);
    expect(roomsOf('conversation:unread-updated')).toEqual([`user:${REGISTERED_USER_ID}`]);
  });
});
