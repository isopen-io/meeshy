/**
 * `CallEventsHandler.endCallParticipationForDepartedMember` — un membre qui
 * perd son appartenance sort AUSSI de l'appel en cours du fil.
 *
 * Ce que la suite tient :
 *
 * - la recherche de la ligne d'appel n'exige AUCUN `isActive` : la route
 *   appelante vient de la passer à `false`, et l'exiger reproduirait le
 *   silence même qu'on corrige (`call:force-leave`, le seul verbe de retrait
 *   existant, est muselé par cette exigence). C'est une preuve de STRUCTURE
 *   sur le `where` — l'absence d'une clause ne se lit pas dans un effet ;
 * - la room de l'appel n'est PAS celle du fil : l'éviction vise
 *   `ROOMS.call(callId)` et n'atteint que les appareils du PARTANT, parce
 *   qu'un appel de groupe continue pour ceux qui restent ;
 * - la diffusion précède l'éviction — c'est par la room de l'appel que les
 *   deux bords apprennent qu'ils doivent démonter leur `RTCPeerConnection`,
 *   seul geste qui coupe réellement le média P2P ;
 * - le verbe ne rejette JAMAIS : ses appelants ont déjà commis un
 *   bannissement, un départ ou un retrait, et leur succès ne dépend pas de
 *   cette hygiène.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockLeaveCallDep = jest.fn<any>();
const mockClearRingingTimeoutDep = jest.fn<any>();
const mockCreateCallSummaryDep = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    leaveCall: mockLeaveCallDep,
    clearRingingTimeout: mockClearRingingTimeoutDep,
    createCallSummaryMessage: mockCreateCallSummaryDep,
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    initiateCall: jest.fn<any>(),
    joinCall: jest.fn<any>(),
    endCall: jest.fn<any>(),
    getCallSession: jest.fn<any>(),
    generateIceServers: jest.fn<any>().mockReturnValue([]),
    scheduleRingingTimeout: jest.fn<any>(),
    forceEndOrphanedCallSession: jest.fn<any>().mockResolvedValue(null),
    listHistory: jest.fn<any>(),
    handleMissedCall: jest.fn<any>(),
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../utils/callEndedFanout', () => ({
  resolveCallEndedRooms: jest.fn<any>().mockResolvedValue(['call:room']),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: jest.fn<any>().mockResolvedValue(true),
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: jest.fn<any>().mockResolvedValue(true),
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { ROOMS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEPARTED_USER_ID = 'user-banned-001';
const REMAINING_USER_ID = 'user-staying-002';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const MEMBERSHIP_ID = 'membership-banned-001';
const CALL_PART_ID = 'call-participant-banned-001';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParticipation(status = 'active') {
  return {
    id: CALL_PART_ID,
    participantId: MEMBERSHIP_ID,
    callSessionId: CALL_ID,
    leftAt: null,
    callSession: { id: CALL_ID, mode: 'p2p', conversationId: CONV_ID, status },
  };
}

function makePrisma(participations: unknown[], findMany = jest.fn<any>()) {
  findMany.mockResolvedValue(participations);
  return {
    prisma: {
      callParticipant: {
        findMany,
        update: jest.fn<any>(),
        count: jest.fn<any>().mockResolvedValue(1),
      },
      participant: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: MEMBERSHIP_ID }),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      callSession: {
        findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      $transaction: jest.fn<any>(),
    } as unknown as PrismaClient,
    findMany,
  };
}

/**
 * Un serveur dont `in(room)` rend les sockets DE CETTE ROOM — sans quoi une
 * éviction ciblée serait indiscernable d'une éviction générale.
 */
function makeIo(roomSockets: Record<string, { id: string; leave: jest.Mock<any> }[]> = {}) {
  const emitsByRoom: { room: string; event: string; payload: unknown }[] = [];
  const io = {
    to: jest.fn<any>((room: string) => ({
      emit: (event: string, payload: unknown) => {
        emitsByRoom.push({ room, event, payload });
      },
    })),
    in: jest.fn<any>((room: string) => ({
      fetchSockets: jest.fn<any>().mockResolvedValue(roomSockets[room] ?? []),
    })),
  };
  return { io, emitsByRoom };
}

function makeSocketDouble(id: string, order?: string[]) {
  return {
    id,
    leave: jest.fn<any>((room: string) => {
      order?.push(`leave:${id}:${room}`);
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — endCallParticipationForDepartedMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateCallSummaryDep.mockResolvedValue(null);
    mockLeaveCallDep.mockResolvedValue({
      id: CALL_ID,
      conversationId: CONV_ID,
      status: 'active',
      duration: 0,
      endReason: null,
      mode: 'p2p',
    });
  });

  it("cherche la ligne d'appel SANS exiger une appartenance active — la route vient de la révoquer", async () => {
    const { prisma, findMany } = makePrisma([]);
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    const where = findMany.mock.calls[0][0].where;
    expect(where.participant).toEqual({ userId: DEPARTED_USER_ID, conversationId: CONV_ID });
    // Preuve de STRUCTURE : aucune clause `isActive` nulle part dans le filtre.
    expect(JSON.stringify(where)).not.toContain('isActive');
  });

  it("sort le partant de l'appel en cours, en gravant la même raison qu'un raccroché ordinaire", async () => {
    const { prisma } = makePrisma([makeParticipation()]);
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    expect(mockLeaveCallDep).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: CALL_ID,
        userId: DEPARTED_USER_ID,
        participantId: MEMBERSHIP_ID,
        endReasonHint: 'completed',
      })
    );
  });

  it("annonce le départ dans la room de l'APPEL — c'est par elle que les deux bords démontent leur connexion", async () => {
    const { prisma } = makePrisma([makeParticipation()]);
    const { io, emitsByRoom } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    expect(emitsByRoom).toContainEqual({
      room: ROOMS.call(CALL_ID),
      event: CALL_EVENTS.PARTICIPANT_LEFT,
      payload: expect.objectContaining({
        callId: CALL_ID,
        userId: DEPARTED_USER_ID,
        participantId: CALL_PART_ID,
      }),
    });
  });

  it("n'évince QUE les appareils du partant de la room d'appel — un appel de groupe continue", async () => {
    const departedSocket = makeSocketDouble('socket-departed');
    const remainingSocket = makeSocketDouble('socket-remaining');
    const { prisma } = makePrisma([makeParticipation()]);
    const { io } = makeIo({
      [ROOMS.user(DEPARTED_USER_ID)]: [departedSocket],
      [ROOMS.user(REMAINING_USER_ID)]: [remainingSocket],
    });

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    expect(departedSocket.leave).toHaveBeenCalledWith(ROOMS.call(CALL_ID));
    expect(remainingSocket.leave).not.toHaveBeenCalled();
  });

  it("ANNONCE avant d'évincer — évincé d'abord, le partant n'apprendrait jamais qu'il doit raccrocher", async () => {
    const order: string[] = [];
    const departedSocket = makeSocketDouble('socket-departed', order);
    const { prisma } = makePrisma([makeParticipation()]);
    const io = {
      to: jest.fn<any>((room: string) => ({
        emit: (event: string) => {
          order.push(`emit:${room}:${event}`);
        },
      })),
      in: jest.fn<any>((room: string) => ({
        fetchSockets: jest.fn<any>().mockResolvedValue(
          room === ROOMS.user(DEPARTED_USER_ID) ? [departedSocket] : []
        ),
      })),
    };

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    expect(order).toEqual([
      `emit:${ROOMS.call(CALL_ID)}:${CALL_EVENTS.PARTICIPANT_LEFT}`,
      `emit:${ROOMS.user(DEPARTED_USER_ID)}:call:force-leave`,
      `leave:socket-departed:${ROOMS.call(CALL_ID)}`,
    ]);
  });

  it("dit au sorti que c'est LUI qu'on sort — `call:participant-left` ne le dit à personne", async () => {
    const { prisma } = makePrisma([makeParticipation()]);
    const { io, emitsByRoom } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    expect(emitsByRoom).toContainEqual({
      room: ROOMS.user(DEPARTED_USER_ID),
      event: 'call:force-leave',
      payload: { callId: CALL_ID, reason: 'membership_ended' },
    });
  });

  it("n'annonce le retrait qu'au sorti — les restants n'ont pas à refermer leur écran", async () => {
    const { prisma } = makePrisma([makeParticipation()]);
    const { io, emitsByRoom } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    const forceLeaveRooms = emitsByRoom
      .filter(e => e.event === 'call:force-leave')
      .map(e => e.room);
    expect(forceLeaveRooms).toEqual([ROOMS.user(DEPARTED_USER_ID)]);
  });

  it("ignore une ligne résiduelle sur un appel déjà terminal — ce n'est pas un appel vivant", async () => {
    const { prisma } = makePrisma([makeParticipation('ended')]);
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    expect(mockLeaveCallDep).not.toHaveBeenCalled();
  });

  it("ne fait rien quand le partant n'était dans aucun appel", async () => {
    const { prisma } = makePrisma([]);
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    expect(mockLeaveCallDep).not.toHaveBeenCalled();
    expect(mockClearRingingTimeoutDep).not.toHaveBeenCalled();
  });

  it('ne rejette JAMAIS — la route appelante a déjà commis son bannissement', async () => {
    const findMany = jest.fn<any>().mockRejectedValue(new Error('Mongo indisponible'));
    const prisma = {
      callParticipant: { findMany },
    } as unknown as PrismaClient;
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await expect(
      handler.endCallParticipationForDepartedMember({
        io: io as any,
        conversationId: CONV_ID,
        userId: DEPARTED_USER_ID,
      })
    ).resolves.toBeUndefined();
  });

  it("ne clear PAS elle-même la minuterie de sonnerie — `leaveCall()` la scope déjà selon que l'appel continue ou se termine", async () => {
    // Vague 165 — `leaveCall()` (invoqué via `leaveParticipationAndBroadcast`,
    // mocké ici) décide déjà, en interne, s'il faut clear `ringingTimeouts`
    // (dernier participant → clear ; appel de groupe qui continue pour les
    // autres invités → laisse armé, voir CallService.leaveCall's branche
    // `isLastParticipant`). Un appel EXTERNE et INCONDITIONNEL ici — comme
    // sur les trois sites que la Vague 164 a fermés (call:end/leave/
    // force-leave) — court-circuiterait cette décision pour la SEULE branche
    // qui compte : celle où l'appel continue. `onDisconnectGraceExpired`,
    // l'autre appelant de `leaveParticipationAndBroadcast` dans ce même
    // fichier, ne porte déjà pas cet appel redondant — ce site doit s'y
    // aligner plutôt que le reconduire.
    const { prisma } = makePrisma([makeParticipation()]);
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    await handler.endCallParticipationForDepartedMember({
      io: io as any,
      conversationId: CONV_ID,
      userId: DEPARTED_USER_ID,
    });

    expect(mockClearRingingTimeoutDep).not.toHaveBeenCalled();
  });
});
