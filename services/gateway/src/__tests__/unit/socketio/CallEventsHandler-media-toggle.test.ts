/**
 * CallEventsHandler — call:toggle-audio / call:toggle-video broadcast targeting
 *
 * Regression guard: the sender must NEVER receive its own call:media-toggled
 * echo. iOS treats any received event as reflecting the REMOTE peer's media
 * state (drives the mute indicator / avatar placeholder), so broadcasting via
 * `io.to()` (which includes the sender) corrupts the sender's own view of the
 * peer's state on every self-toggle. `socket.to()` excludes the sender and is
 * the only correct primitive here — this was already true for video but was
 * missed for audio.
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
  isValidationFailure: jest.fn((r) => !r.success),
}));

const mockCheckLimit = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MEDIA_TOGGLE: { maxRequests: 50, windowMs: 60000, keyPrefix: 'socket:call:media' },
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
const USER_ID = 'user-toggler-abc';

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
  const directEmit = jest.fn<any>();
  const socketRoomEmit = jest.fn<any>();
  const ioRoomEmit = jest.fn<any>();
  const socket = {
    id: 'socket-test-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: socketRoomEmit }),
    data: {},
  };
  const io = {
    to: jest.fn().mockReturnValue({ emit: ioRoomEmit }),
  };
  return { socket, io, handlers, directEmit, socketRoomEmit, ioRoomEmit };
}

function makeCallService() {
  return {
    updateParticipantMedia: jest.fn<any>().mockResolvedValue(undefined),
  } as any;
}

describe('CallEventsHandler — media toggle broadcast excludes sender', () => {
  beforeEach(() => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
  });

  describe('call:toggle-audio', () => {
    let socketRoomEmit: jest.MockedFunction<any>;
    let ioRoomEmit: jest.MockedFunction<any>;
    let socketToMock: jest.MockedFunction<any>;
    let ioToMock: jest.MockedFunction<any>;

    beforeEach(async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers, socketRoomEmit: sre, ioRoomEmit: ire } = makeSocket();
      socketRoomEmit = sre;
      ioRoomEmit = ire;
      socketToMock = socket.to as jest.MockedFunction<any>;
      ioToMock = io.to as jest.MockedFunction<any>;

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.TOGGLE_AUDIO]({ callId: VALID_CALL_ID, enabled: false });
    });

    it('broadcasts via socket.to (excludes sender), never io.to', () => {
      expect(socketToMock).toHaveBeenCalledWith(expect.stringContaining(VALID_CALL_ID));
      expect(socketRoomEmit).toHaveBeenCalledTimes(1);
      expect(ioToMock).not.toHaveBeenCalled();
      expect(ioRoomEmit).not.toHaveBeenCalled();
    });

    it('relays the correct media type and enabled flag', () => {
      const [eventName, payload] = socketRoomEmit.mock.calls[0];
      expect(eventName).toBe(CALL_EVENTS.MEDIA_TOGGLED);
      expect(payload.mediaType).toBe('audio');
      expect(payload.enabled).toBe(false);
    });
  });

  describe('call:toggle-video (reference behaviour, must stay excluded)', () => {
    let socketRoomEmit: jest.MockedFunction<any>;
    let ioRoomEmit: jest.MockedFunction<any>;

    beforeEach(async () => {
      const prisma = makePrisma();
      const callService = makeCallService();
      const { socket, io, handlers, socketRoomEmit: sre, ioRoomEmit: ire } = makeSocket();
      socketRoomEmit = sre;
      ioRoomEmit = ire;

      const handler = new CallEventsHandler(prisma, callService);
      handler.setupCallEvents(socket as any, io as any, () => USER_ID);

      await handlers[CALL_EVENTS.TOGGLE_VIDEO]({ callId: VALID_CALL_ID, enabled: true });
    });

    it('broadcasts via socket.to (excludes sender), never io.to', () => {
      expect(socketRoomEmit).toHaveBeenCalledTimes(1);
      expect(ioRoomEmit).not.toHaveBeenCalled();
    });
  });
});
