/**
 * CallEventsHandler — `call:signal` payload-less/malformed emit no longer
 * crashes the gateway (continuous-improvement calling-stack audit).
 *
 * `call:signal` was the only call handler dereferencing `data.callId`
 * unguarded — including inside its own `catch` block — while every sibling
 * handler (`call:join`, `call:end`, `handleMediaToggle`,
 * `call:request-ice-servers`, `call:screen-capture-detected`,
 * `call:analytics`) uses `data?.callId`. A client emitting `call:signal`
 * with no payload (Socket.IO delivers `data === undefined`) threw a
 * `TypeError` reading `.callId` off `undefined` — and the `catch` block
 * re-threw the SAME error re-dereferencing `data.callId` again. That escapes
 * the async listener as an unhandled promise rejection, which under Node's
 * `--unhandled-rejections=throw` default takes the whole gateway process
 * down (see `CLAUDE.md` § Critical Gotchas, Leçon 230) — one client could
 * trigger this at up to the `CALL_SIGNAL` rate-limit ceiling.
 *
 * The witness is the `unhandledRejection` event itself, not a thrown/rejected
 * return value: `socket.on('call:signal', async (data) => {...})` never
 * awaits its own handler, so a listener that throws surfaces only via this
 * process-level event — probed after the microtask queue drains, mirroring
 * `handlers/__tests__/PostReactionHandler.test.ts`.
 */

import { jest, describe, it, expect, afterEach } from '@jest/globals';

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
  validateSocketEvent: jest.fn(() => ({ success: false, error: 'Invalid payload' })),
  isValidationFailure: jest.fn((r: any) => !r.success),
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
  checkSocketRateLimit: jest.fn<any>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    CALL_SIGNAL: { maxRequests: 100, windowMs: 10000, keyPrefix: 'socket:call:signal' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = 'user-signal-crash-abc';

function makePrisma() {
  return {} as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-signal-crash',
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

async function drainMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('CallEventsHandler — call:signal survives a payload-less emit', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not raise an unhandledRejection when authenticated and data is undefined', async () => {
    const { socket, io, handlers } = makeSocket();
    const handler = new CallEventsHandler(makePrisma(), {} as any);
    handler.setupCallEvents(socket as any, io as any, () => USER_ID);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      await handlers[CALL_EVENTS.SIGNAL](undefined as any, jest.fn<any>());
      await drainMicrotasks();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toEqual([]);
  });

  it('emits CALL_EVENTS.ERROR with INVALID_SIGNAL (not a thrown TypeError) when authenticated and data is undefined', async () => {
    const { socket, io, handlers, directEmit } = makeSocket();
    const handler = new CallEventsHandler(makePrisma(), {} as any);
    handler.setupCallEvents(socket as any, io as any, () => USER_ID);

    await handlers[CALL_EVENTS.SIGNAL](undefined as any, jest.fn<any>());

    expect(directEmit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({
        code: CALL_ERROR_CODES.INVALID_SIGNAL,
        callId: undefined,
      })
    );
  });

  it('does not raise an unhandledRejection when unauthenticated and data is undefined', async () => {
    const { socket, io, handlers, directEmit } = makeSocket();
    const handler = new CallEventsHandler(makePrisma(), {} as any);
    handler.setupCallEvents(socket as any, io as any, () => undefined);

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      await handlers[CALL_EVENTS.SIGNAL](undefined as any, jest.fn<any>());
      await drainMicrotasks();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toEqual([]);
    expect(directEmit).toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({ code: 'NOT_AUTHENTICATED', callId: undefined })
    );
  });
});
