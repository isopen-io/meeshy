/**
 * CallEventsHandler — validation-failure error emission parity
 *
 * Continuous-improvement audit finding: `call:request-ice-servers`,
 * `call:backgrounded`, `call:foregrounded`, `call:screen-capture-detected`,
 * and `call:analytics` silently dropped malformed payloads
 * (`if (!validation.success) return;`) while every other call handler
 * (`call:initiate`, `call:join`, `call:signal`, `call:end`,
 * `call:toggle-audio`/`video`) emits `CALL_EVENTS.ERROR` with the
 * VALIDATION_ERROR code. A client sending a malformed payload on these five
 * events got a silent drop with no diagnostic — inconsistent and harder to
 * debug than every sibling handler.
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
    CALL_ICE_SERVERS_REFRESH: { maxRequests: 50, windowMs: 60000, keyPrefix: 'socket:call:ice' },
    CALL_BACKGROUNDED: { maxRequests: 50, windowMs: 60000, keyPrefix: 'socket:call:bg' },
    CALL_FOREGROUNDED: { maxRequests: 50, windowMs: 60000, keyPrefix: 'socket:call:fg' },
    CALL_SCREEN_CAPTURE: { maxRequests: 50, windowMs: 60000, keyPrefix: 'socket:call:sc' },
    CALL_ANALYTICS: { maxRequests: 50, windowMs: 60000, keyPrefix: 'socket:call:analytics' },
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
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const VALID_CALL_ID = '507f1f77bcf86cd799439011';
const USER_ID = 'user-validation-abc';

function makePrisma() {
  return {} as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-test-validation',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  return { socket, io, handlers, directEmit };
}

function makeCallService() {
  return {} as any;
}

describe('CallEventsHandler — malformed payload emits CALL_EVENTS.ERROR', () => {
  beforeEach(() => {
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({
      success: false,
      error: 'Invalid payload',
    });
  });

  const cases: Array<[string, any]> = [
    [CALL_EVENTS.REQUEST_ICE_SERVERS, { callId: VALID_CALL_ID }],
    [CALL_EVENTS.BACKGROUNDED, { callId: VALID_CALL_ID, participantId: 'p1' }],
    [CALL_EVENTS.FOREGROUNDED, { callId: VALID_CALL_ID, participantId: 'p1' }],
    [CALL_EVENTS.SCREEN_CAPTURE_DETECTED, { callId: VALID_CALL_ID, participantId: 'p1', isCapturing: true }],
    [CALL_EVENTS.ANALYTICS, { callId: VALID_CALL_ID }],
  ];

  it.each(cases)('%s emits CALL_EVENTS.ERROR with VALIDATION_ERROR on malformed payload', async (event, payload) => {
    const prisma = makePrisma();
    const callService = makeCallService();
    const { socket, io, handlers, directEmit } = makeSocket();

    const handler = new CallEventsHandler(prisma, callService);
    handler.setupCallEvents(socket as any, io as any, () => USER_ID);

    await handlers[event](payload);

    expect(directEmit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({
        code: CALL_ERROR_CODES.VALIDATION_ERROR,
        callId: VALID_CALL_ID,
      })
    );
  });
});
