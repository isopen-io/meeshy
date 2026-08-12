/**
 * CallEventsHandler — cache courte durée de la session dans le hot-path
 * call:signal (audit appels 2026-07-11 #10).
 *
 * Chaque signal — y compris CHAQUE ICE candidate d'une rafale de gathering —
 * faisait un `getCallSession` findUnique+include lourd. Le cache (TTL court)
 * élimine ces lectures pendant les rafales, avec deux garde-fous de
 * correction :
 *  - participant absent de la session cachée (join tout frais) → re-lecture
 *    fraîche AVANT tout rejet — jamais de faux NOT_A_PARTICIPANT/TARGET ;
 *  - un signal `answer` lit TOUJOURS frais : `isFirstAnswer` dépend du
 *    `answeredAt` pré-update, un cache périmé casserait la détection de la
 *    première answer (mirror answered-elsewhere). Les answers sont rares —
 *    aucun coût.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockGetCallSession = jest.fn<any>();
const mockClearRingingTimeout = jest.fn<any>();
const mockUpdateCallStatus = jest.fn<any>().mockResolvedValue(undefined);

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    getCallSession: mockGetCallSession,
    clearRingingTimeout: mockClearRingingTimeout,
    updateCallStatus: mockUpdateCallStatus,
    getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
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
    CALL_ICE_CANDIDATE: { maxRequests: 60, windowMs: 10000, keyPrefix: 'socket:call:ice' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = '507f1f77bcf86cd799439021';
const CONV_ID = '507f1f77bcf86cd799439022';
const USER_A = 'user-a';
const USER_B = 'user-b';

function makeSession(overrides: Partial<{
  participants: unknown[];
  answeredAt: Date | null;
}> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: USER_A,
    answeredAt: 'answeredAt' in overrides ? overrides.answeredAt : null,
    status: 'ringing',
    participants: overrides.participants ?? [
      { participantId: 'pa', leftAt: null, participant: { userId: USER_A } },
      { participantId: 'pb', leftAt: null, participant: { userId: USER_B } },
    ],
  };
}

function makeSignal(overrides: Partial<{
  type: string;
  from: string;
  to: string;
}> = {}) {
  return {
    callId: CALL_ID,
    signal: {
      type: overrides.type ?? 'ice-candidate',
      from: overrides.from ?? USER_A,
      to: overrides.to ?? USER_B,
      payload: {},
    },
  };
}

function makeHarness() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-sig-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
  };
  const prisma = {} as unknown as PrismaClient;
  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(socket as any, io as any, () => USER_A);
  return { handler, handlers, directEmit };
}

describe('CallEventsHandler — signal-session cache (audit #10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockGetCallSession.mockResolvedValue(makeSession());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('une rafale ICE dans le TTL ne lit la session en DB qu’UNE fois', async () => {
    const { handlers } = makeHarness();

    await handlers[CALL_EVENTS.SIGNAL](makeSignal(), jest.fn<any>());
    await handlers[CALL_EVENTS.SIGNAL](makeSignal(), jest.fn<any>());
    await handlers[CALL_EVENTS.SIGNAL](makeSignal(), jest.fn<any>());

    expect(mockGetCallSession).toHaveBeenCalledTimes(1);
  });

  it('re-lit la DB une fois le TTL écoulé', async () => {
    const { handlers } = makeHarness();

    await handlers[CALL_EVENTS.SIGNAL](makeSignal(), jest.fn<any>());
    jest.advanceTimersByTime(5_000);
    await handlers[CALL_EVENTS.SIGNAL](makeSignal(), jest.fn<any>());

    expect(mockGetCallSession).toHaveBeenCalledTimes(2);
  });

  it('participant absent du cache (join tout frais) → re-lecture fraîche, jamais de faux rejet', async () => {
    const { handlers, directEmit } = makeHarness();

    // v1 : B n'a pas encore joint — un cache primé sur v1 ne connaît pas la
    // cible. Le signal A→B doit déclencher UNE re-lecture fraîche (v2, où B
    // a joint) au lieu de rejeter sur l'état périmé.
    const v1 = makeSession({
      participants: [{ participantId: 'pa', leftAt: null, participant: { userId: USER_A } }],
    });
    const v2 = makeSession();
    mockGetCallSession.mockResolvedValueOnce(v1).mockResolvedValueOnce(v2);

    await handlers[CALL_EVENTS.SIGNAL](makeSignal(), jest.fn<any>());

    expect(mockGetCallSession).toHaveBeenCalledTimes(2);
    expect(directEmit).not.toHaveBeenCalledWith(
      CALL_EVENTS.ERROR,
      expect.objectContaining({ message: 'Target participant not found in call' })
    );
  });

  it('un signal answer lit TOUJOURS frais (isFirstAnswer dépend du answeredAt pré-update)', async () => {
    const { handlers } = makeHarness();

    // Prime le cache avec une rafale ICE…
    await handlers[CALL_EVENTS.SIGNAL](makeSignal(), jest.fn<any>());
    expect(mockGetCallSession).toHaveBeenCalledTimes(1);

    // …l'answer qui suit dans le TTL ne doit PAS être servie du cache.
    await handlers[CALL_EVENTS.SIGNAL](makeSignal({ type: 'answer' }), jest.fn<any>());

    expect(mockGetCallSession).toHaveBeenCalledTimes(2);
  });
});
