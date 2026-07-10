/**
 * CallEventsHandler — call:reconnecting / call:reconnected / call:request-ice-servers
 * rate limiting
 *
 * These three handlers were the last call:* handlers with no rate limit at
 * all (audit calling-feature routine 2026-07-03), unlike every sibling
 * (HEARTBEAT, QUALITY_REPORT, TRANSCRIPTION_SEGMENT, ANALYTICS,
 * SCREEN_CAPTURE). Each does real work per event — RECONNECTING/RECONNECTED
 * write to the CallSession via `updateCallStatus`, REQUEST_ICE_SERVERS mints
 * fresh HMAC TURN credentials — so a flooding authenticated participant could
 * still amplify load onto the DB/TURN secret even though authorization was
 * already correctly enforced (Audit P1-21 / backlog item "authz
 * call:request-ice-servers").
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

const mockCheckSocketRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: jest.fn().mockResolvedValue(true),
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: jest.fn().mockResolvedValue(true),
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: (...args: any[]) => mockCheckSocketRateLimit(...args),
  SOCKET_RATE_LIMITS: {
    CALL_RECONNECTING: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:reconnecting' },
    CALL_RECONNECTED: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:reconnected' },
    CALL_ICE_SERVERS_REFRESH: { maxRequests: 10, windowMs: 60000, keyPrefix: 'socket:call:ice-servers-refresh' },
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

const USER_ID = 'user-reconnect-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CALL_ROOM = `call:${CALL_ID}`;

function makePrisma() {
  return {
    callSession: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  } as unknown as PrismaClient;
}

function makeCallService() {
  return {
    updateCallStatus: jest.fn<any>().mockResolvedValue(undefined),
    generateIceServers: jest.fn<any>().mockReturnValue([{ urls: 'stun:stun.example.com:3478' }]),
    getIceServerTtl: jest.fn<any>().mockReturnValue(480),
    getCallSession: jest.fn<any>().mockResolvedValue({
      status: 'active',
      participants: [{ participantId: 'participant-1', leftAt: null, participant: { userId: USER_ID } }],
    }),
  } as any;
}

function makeSocket({ inCallRoom = true }: { inCallRoom?: boolean } = {}) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const rooms = new Set<string>(['socket-id-1']);
  if (inCallRoom) rooms.add(CALL_ROOM);
  const socket = {
    id: 'socket-id-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms,
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers };
}

describe('CallEventsHandler — reconnect/ICE-refresh rate limiting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockCheckSocketRateLimit.mockResolvedValue(true);
  });

  describe('call:reconnecting', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_RECONNECTING', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.RECONNECTING]({ callId: CALL_ID, participantId: 'participant-1', attempt: 1 });

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:reconnecting' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(callService.updateCallStatus).toHaveBeenCalled();
    });

    it('drops the event when the rate limit is exceeded, without touching call status', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.RECONNECTING]({ callId: CALL_ID, participantId: 'participant-1', attempt: 1 });

      expect(callService.updateCallStatus).not.toHaveBeenCalled();
    });
  });

  describe('call:reconnected', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_RECONNECTED', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.RECONNECTED]({ callId: CALL_ID, participantId: 'participant-1' });

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:reconnected' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(callService.updateCallStatus).toHaveBeenCalled();
    });

    it('drops the event when the rate limit is exceeded, without touching call status', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket();

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.RECONNECTED]({ callId: CALL_ID, participantId: 'participant-1' });

      expect(callService.updateCallStatus).not.toHaveBeenCalled();
    });
  });

  describe('call:request-ice-servers', () => {
    it('is rate-limited via SOCKET_RATE_LIMITS.CALL_ICE_SERVERS_REFRESH', async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket({ inCallRoom: true });

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.REQUEST_ICE_SERVERS]({ callId: CALL_ID });

      expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
        socket,
        USER_ID,
        expect.objectContaining({ keyPrefix: 'socket:call:ice-servers-refresh' }),
        expect.anything(),
        CALL_EVENTS.ERROR
      );
      expect(callService.generateIceServers).toHaveBeenCalled();
    });

    it('drops the event when the rate limit is exceeded, without minting fresh credentials', async () => {
      mockCheckSocketRateLimit.mockResolvedValueOnce(false);
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers } = makeSocket({ inCallRoom: true });

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.REQUEST_ICE_SERVERS]({ callId: CALL_ID });

      expect(callService.generateIceServers).not.toHaveBeenCalled();
    });
  });
});
