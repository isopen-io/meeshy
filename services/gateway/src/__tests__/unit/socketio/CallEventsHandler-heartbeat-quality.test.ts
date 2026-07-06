/**
 * CallEventsHandler — call:heartbeat / call:quality-report hardening
 *
 * Both handlers previously had no rate limit at all (unlike every sibling
 * call:* handler), and `call:quality-report` persisted `bytesSent` /
 * `bytesReceived` / `level` to ANY caller-supplied callId with no membership
 * check — only the (conditional) quality-alert broadcast further down ever
 * resolved the caller's participantId. An authenticated user could flood-write
 * bogus stats onto a call they aren't in, or spam either event unrate-limited.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: any) => !r.success),
}));

const mockCheckLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockCheckSocketRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: (...args: any[]) => mockCheckSocketRateLimit(...args),
  SOCKET_RATE_LIMITS: {
    CALL_HEARTBEAT: { maxRequests: 12, windowMs: 60000, keyPrefix: 'socket:call:heartbeat' },
    CALL_QUALITY_REPORT: { maxRequests: 30, windowMs: 60000, keyPrefix: 'socket:call:quality' },
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

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const VALID_CALL_ID = '507f1f77bcf86cd799439011';
const VALID_CONV_ID = '507f1f77bcf86cd799439012';
const USER_ID = 'user-quality-abc';

function makePrisma() {
  return {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: VALID_CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers };
}

function makeCallService(overrides: { participants?: Array<{ participantId: string; userId?: string; leftAt?: Date | null }> } = {}) {
  const participants = overrides.participants ?? [
    { participantId: 'participant-1', userId: USER_ID, leftAt: null },
  ];
  return {
    recordHeartbeat: jest.fn<any>(),
    persistCallStats: jest.fn<any>().mockResolvedValue(undefined),
    getCallSession: jest.fn<any>().mockResolvedValue({
      participants: participants.map((p) => ({
        participantId: p.participantId,
        leftAt: p.leftAt ?? null,
        participant: p.userId ? { userId: p.userId } : undefined,
      })),
    }),
  } as any;
}

describe('CallEventsHandler — call:heartbeat / call:quality-report hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCheckSocketRateLimit.mockResolvedValue(true);
  });

  describe('call:heartbeat', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_HEARTBEAT', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.HEARTBEAT]({ callId: VALID_CALL_ID });

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:heartbeat' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(callService.recordHeartbeat).toHaveBeenCalledWith(VALID_CALL_ID, 'participant-1');
    });

    it('drops the event when the rate limit is exceeded', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.HEARTBEAT]({ callId: VALID_CALL_ID });

      expect(callService.recordHeartbeat).not.toHaveBeenCalled();
    });

    it('never records a heartbeat for a callId the caller is not a participant of', async () => {
      const prisma = makePrisma();
      const callService = makeCallService({ participants: [] });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.HEARTBEAT]({ callId: VALID_CALL_ID });

      expect(callService.recordHeartbeat).not.toHaveBeenCalled();
    });

    it('never records a heartbeat when the caller is a member of the conversation but not an active participant of THIS call', async () => {
      // Regression: `resolveActiveCallParticipantId` must check the caller is
      // an active CallParticipant of the specific callId, not merely a member
      // of the underlying conversation — otherwise any other conversation
      // member could plant a phantom in-memory heartbeat entry for a call
      // they never joined, polluting the zombie-call GC's liveness data.
      const prisma = makePrisma();
      const callService = makeCallService({
        participants: [{ participantId: 'someone-elses-participant-id', userId: 'other-user', leftAt: null }],
      });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.HEARTBEAT]({ callId: VALID_CALL_ID });

      expect(callService.recordHeartbeat).not.toHaveBeenCalled();
    });

    it('never records a heartbeat when the caller already left THIS call (leftAt set)', async () => {
      const prisma = makePrisma();
      const callService = makeCallService({
        participants: [{ participantId: 'participant-1', userId: USER_ID, leftAt: new Date() }],
      });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.HEARTBEAT]({ callId: VALID_CALL_ID });

      expect(callService.recordHeartbeat).not.toHaveBeenCalled();
    });
  });

  describe('call:quality-report', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_QUALITY_REPORT', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:quality' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(callService.persistCallStats).toHaveBeenCalledWith(VALID_CALL_ID, {
        bytesSent: 100,
        bytesReceived: 200,
        level: 'good',
      });
    });

    it('drops the event when the rate limit is exceeded, without persisting stats', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(callService.persistCallStats).not.toHaveBeenCalled();
    });

    it('never persists stats for a callId the caller is not a participant of', async () => {
      const prisma = makePrisma();
      const callService = makeCallService({ participants: [] });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(callService.persistCallStats).not.toHaveBeenCalled();
    });

    it('never persists stats when the caller is a member of the conversation but not an active participant of THIS call', async () => {
      // Regression: `resolveActiveCallParticipantId` must check the caller is
      // an active CallParticipant of the specific callId, not merely a member
      // of the underlying conversation (calls are capped at 2 participants
      // even inside group conversations — other conversation members must
      // not be able to write stats onto someone else's active call).
      const prisma = makePrisma();
      const callService = makeCallService({
        participants: [{ participantId: 'someone-elses-participant-id', userId: 'other-user', leftAt: null }],
      });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(callService.persistCallStats).not.toHaveBeenCalled();
    });

    it('never persists stats when the caller already left THIS call (leftAt set)', async () => {
      const prisma = makePrisma();
      const callService = makeCallService({
        participants: [{ participantId: 'participant-1', userId: USER_ID, leftAt: new Date() }],
      });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT]({
        callId: VALID_CALL_ID,
        stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
      });

      expect(callService.persistCallStats).not.toHaveBeenCalled();
    });
  });

  // L'alerte « votre contact a une mauvaise connexion » ne doit être diffusée
  // qu'après un signal SOUTENU (2 rapports dégradés consécutifs ≈ 10 s, miroir
  // serveur du DegradedLinkTracker client) et JAMAIS revenir au rapporteur
  // lui-même (socket.to exclut l'émetteur ; io.to inondait toute la room, donc
  // le participant dégradé voyait « votre contact » pour sa PROPRE connexion).
  describe('call:quality-alert emission (sustained + reporter excluded)', () => {
    const degradedReport = {
      callId: VALID_CALL_ID,
      stats: { bytesSent: 100, bytesReceived: 200, level: 'poor', rtt: 400, packetLoss: 0 },
    };
    const healthyReport = {
      callId: VALID_CALL_ID,
      stats: { bytesSent: 100, bytesReceived: 200, level: 'good', rtt: 50, packetLoss: 0 },
    };

    it('does NOT alert on a single isolated degraded report', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);

      expect(socket.to).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });

    it('alerts on the 2nd consecutive degraded report, via socket.to (reporter excluded), never io.to', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);
      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);

      expect(io.to).not.toHaveBeenCalled();
      expect(socket.to).toHaveBeenCalledWith(`call:${VALID_CALL_ID}`);
      const roomEmit = (socket.to as jest.Mock).mock.results[0]?.value?.emit as jest.Mock;
      expect(roomEmit).toHaveBeenCalledWith(
        CALL_EVENTS.QUALITY_ALERT,
        expect.objectContaining({
          callId: VALID_CALL_ID,
          participantId: 'participant-1',
          metric: 'rtt',
          value: 400,
          threshold: 300,
        })
      );
    });

    it('keeps alerting on the 3rd+ consecutive degraded report (client auto-clear needs refreshes)', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);
      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);
      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);

      expect(socket.to).toHaveBeenCalledTimes(2);
    });

    it('a healthy report resets the streak — degraded/healthy/degraded never alerts', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);
      await handlers[CALL_EVENTS.QUALITY_REPORT](healthyReport);
      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);

      expect(socket.to).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
    });

    it('tracks streaks per participant — two different reporters at 1 degraded report each never alert', async () => {
      const prisma = makePrisma();
      const callService = makeCallService({
        participants: [
          { participantId: 'participant-1', userId: USER_ID, leftAt: null },
          { participantId: 'participant-2', userId: 'user-other', leftAt: null },
        ],
      });
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      const other = makeSocket();
      handler.setupCallEvents(other.socket as any, other.io as any, () => 'user-other');

      await handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);
      await other.handlers[CALL_EVENTS.QUALITY_REPORT](degradedReport);

      expect(socket.to).not.toHaveBeenCalled();
      expect(other.socket.to).not.toHaveBeenCalled();
    });
  });
});
