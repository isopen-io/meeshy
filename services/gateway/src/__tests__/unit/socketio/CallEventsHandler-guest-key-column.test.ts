/**
 * #10473 — la clé d'un invité de lien est son `Participant.id` (`userId ?? id`,
 * la clé de sa room personnelle) et son `userId` est NUL. Les requêtes
 * d'appel qui cherchaient `Participant` par `userId = clé` ne rendaient RIEN
 * pour lui : à sa reconnexion, `call:check-active` ne lui rejouait jamais
 * l'appel qui sonnait, et `resolveParticipantId` (socket `call:initiate`,
 * `call:join`) le tenait pour étranger au fil.
 *
 * Le double de Prisma TIENT des lignes et ÉVALUE le `where` : un filtre qui
 * lit la mauvaise colonne rend une liste vide ici comme en base.
 *
 * Mais l'invité de lien ne sonne pas au premier appel (`ringableCallees`) :
 * `call:check-active` ne lui rejoue que l'appel qui l'INVITE (`invitedUserIds`),
 * jamais un autre — ni bannière, ni TURN neufs.
 *
 * Ce que la suite garde aussi : `call:initiate` et `call:join` par socket
 * REFUSENT un invité, explicitement (`PERMISSION_DENIED`, CVE-004) — jamais
 * par un `NOT_A_PARTICIPANT` muet.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn(),
}));
jest.mock('../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));
jest.mock('../../../services/PushNotificationService', () => ({ PushNotificationService: jest.fn() }));
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: jest.fn<any>().mockResolvedValue(true), destroy: jest.fn() })),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn<any>().mockResolvedValue(true), destroy: jest.fn() }),
  checkSocketRateLimit: jest.fn<any>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    CALL_CHECK_ACTIVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:check-active' },
    CALL_INITIATE: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:call:initiate' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
  },
}));
jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { resolveParticipantId, resolveJoinParticipantId } from '../../../socketio/call-participants';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CONV_ID = 'conv-1';
const CALL_ID = 'call-ringing';
const GUEST_KEY = 'participant-guest-1';
const MEMBER_USER_ID = 'user-member-1';
const MEMBER_PARTICIPANT_ID = 'participant-member-1';

type ParticipantRow = { id: string; userId: string | null; type: string; conversationId: string; isActive: boolean };

const ROWS: ParticipantRow[] = [
  { id: GUEST_KEY, userId: null, type: 'anonymous', conversationId: CONV_ID, isActive: true },
  { id: MEMBER_PARTICIPANT_ID, userId: MEMBER_USER_ID, type: 'user', conversationId: CONV_ID, isActive: true },
];

function matches(where: any, row: Record<string, unknown>): boolean {
  return Object.entries(where ?? {}).every(([key, expected]) => {
    if (key === 'OR') return (expected as any[]).some(branch => matches(branch, row));
    return row[key] === expected;
  });
}

function makePrisma() {
  const pick = (row: ParticipantRow, select: any) =>
    select ? Object.fromEntries(Object.keys(select).map(key => [key, (row as any)[key]])) : row;
  return {
    participant: {
      findMany: jest.fn<any>(async ({ where, select }: any) => ROWS.filter(row => matches(where, row)).map(row => pick(row, select))),
      findFirst: jest.fn<any>(async ({ where, select }: any) => {
        const row = ROWS.find(candidate => matches(where, candidate));
        return row ? pick(row, select) : null;
      }),
    },
    callSession: {
      findMany: jest.fn<any>(async ({ where }: any) => (where.conversationId.in.includes(CONV_ID) ? [{ id: CALL_ID }] : [])),
      findUnique: jest.fn<any>(async () => ({ conversationId: CONV_ID })),
    },
    callParticipant: {
      findMany: jest.fn<any>(async ({ where }: any) =>
        ROWS.filter(row => matches(where.participant, row)).map(row => ({ callSessionId: CALL_ID, participantId: row.id, leftAt: null }))
      ),
    },
  } as unknown as PrismaClient;
}

function makeCallService(invitedUserIds: string[] = []) {
  return {
    getCallSession: jest.fn<any>().mockResolvedValue({
      id: CALL_ID,
      conversationId: CONV_ID,
      mode: 'p2p',
      metadata: { type: 'audio' },
      initiator: { id: 'someone-else', username: 'other', displayName: 'Other', avatar: null },
      participants: [],
      invitedUserIds,
    }),
    generateIceServers: jest.fn<any>().mockReturnValue([]),
    initiateCall: jest.fn<any>(),
    joinCall: jest.fn<any>(),
  } as any;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => { handlers[event] = fn; }),
    emit: jest.fn(),
    join: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(['socket-1']),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers };
}

function setup(key: string, isAnonymous: boolean, invitedUserIds: string[] = []) {
  const prisma = makePrisma();
  const callService = makeCallService(invitedUserIds);
  const { socket, io, handlers } = makeSocket();
  new CallEventsHandler(prisma, callService).setupCallEvents(
    socket as any,
    io as any,
    () => key,
    () => ({ id: key, isAnonymous })
  );
  return { prisma, callService, socket, handlers };
}

const replays = (socket: { emit: jest.Mock }) =>
  socket.emit.mock.calls.filter(([event]) => event === CALL_EVENTS.INITIATED);

describe('#10473 — les requêtes d\'appel choisissent la colonne de la clé', () => {
  beforeEach(() => jest.clearAllMocks());

  it('call:check-active ne rejoue RIEN à un invité de lien que l\'appel n\'invite pas — ni bannière, ni TURN', async () => {
    const { socket, handlers, callService } = setup(GUEST_KEY, true);

    await handlers[CALL_EVENTS.CHECK_ACTIVE ?? 'call:check-active']();

    expect(replays(socket)).toHaveLength(0);
    expect(callService.generateIceServers).not.toHaveBeenCalled();
  });

  it('call:check-active rejoue l\'appel qui sonne à un invité de lien INVITÉ à cet appel', async () => {
    const { socket, handlers } = setup(GUEST_KEY, true, [GUEST_KEY]);

    await handlers[CALL_EVENTS.CHECK_ACTIVE ?? 'call:check-active']();

    expect(replays(socket)).toHaveLength(1);
    expect(replays(socket)[0][1]).toEqual(expect.objectContaining({ callId: CALL_ID }));
  });

  it('call:check-active rejoue toujours l\'appel à un membre INSCRIT, par son User.id', async () => {
    const { socket, handlers } = setup(MEMBER_USER_ID, false);

    await handlers[CALL_EVENTS.CHECK_ACTIVE ?? 'call:check-active']();

    expect(replays(socket)).toHaveLength(1);
  });

  it('le Participant.id d\'un membre INSCRIT ne désigne personne — ni rejeu, ni participation', async () => {
    const { socket, handlers, prisma, callService } = setup(MEMBER_PARTICIPANT_ID, false);

    await handlers[CALL_EVENTS.CHECK_ACTIVE ?? 'call:check-active']();

    expect(replays(socket)).toHaveLength(0);
    await expect(resolveParticipantId({ prisma, callService }, MEMBER_PARTICIPANT_ID, CONV_ID)).resolves.toBeNull();
  });

  it('resolveParticipantId rend la participation de l\'invité par son Participant.id, et celle de l\'inscrit par son User.id', async () => {
    const prisma = makePrisma();
    const deps = { prisma, callService: makeCallService() };

    await expect(resolveParticipantId(deps, GUEST_KEY, CONV_ID)).resolves.toBe(GUEST_KEY);
    await expect(resolveParticipantId(deps, MEMBER_USER_ID, CONV_ID)).resolves.toBe(MEMBER_PARTICIPANT_ID);
    await expect(resolveParticipantId(deps, GUEST_KEY, 'conv-other')).resolves.toBeNull();
  });

  it('resolveJoinParticipantId (call:join) rend la participation de l\'invité', async () => {
    const prisma = makePrisma();

    await expect(resolveJoinParticipantId({ prisma, callService: makeCallService() }, GUEST_KEY, CALL_ID)).resolves.toBe(GUEST_KEY);
  });

  it.each([
    [CALL_EVENTS.INITIATE, { conversationId: CONV_ID, type: 'audio' }],
    [CALL_EVENTS.JOIN, { callId: CALL_ID }],
  ])('%s par socket REFUSE un invité explicitement (PERMISSION_DENIED), sans toucher à l\'appel', async (event, payload) => {
    const { socket, handlers, callService } = setup(GUEST_KEY, true);
    const ack = jest.fn();

    await handlers[event](payload, ack);

    expect(ack).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({ code: CALL_ERROR_CODES.PERMISSION_DENIED }),
    });
    expect(socket.emit).toHaveBeenCalledWith(CALL_EVENTS.ERROR, expect.objectContaining({ code: CALL_ERROR_CODES.PERMISSION_DENIED }));
    expect(callService.initiateCall).not.toHaveBeenCalled();
    expect(callService.joinCall).not.toHaveBeenCalled();
  });
});
