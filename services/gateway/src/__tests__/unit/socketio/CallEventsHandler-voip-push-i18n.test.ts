/**
 * CallEventsHandler — call:initiate VoIP push localization (Prisme Linguistique)
 *
 * Audit appels 2026-07-11 #11 — le push VoIP de sonnerie était codé en dur en
 * français ("{callerName} vous appelle" / "Appel vidéo"/"Appel audio"), quelle
 * que soit la langue du callee. Corrigé pour résoudre la langue via
 * resolveUserLanguage() (SSOT Prisme) et localiser via le catalogue partagé
 * notification-strings (call.incoming.title / call.incoming.body).
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockInitiateCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>();
const mockScheduleRingingTimeout = jest.fn<any>();
const mockCreateCallSummaryMessage = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    initiateCall: mockInitiateCall,
    generateIceServers: mockGenerateIceServers,
    scheduleRingingTimeout: mockScheduleRingingTimeout,
    createCallSummaryMessage: mockCreateCallSummaryMessage,
    clearRingingTimeout: jest.fn<any>(),
    endCall: jest.fn<any>(),
    leaveCall: jest.fn<any>(),
    joinCall: jest.fn<any>(),
    listHistory: jest.fn<any>(),
    handleMissedCall: jest.fn<any>(),
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
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r) => !r.success),
}));

const mockCheckRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimit,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimit,
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' },
    CALL_INITIATE: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:call:initiate' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
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

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const USER_ID = 'user-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = 'participant-abc';

function makePrisma(participantFindMany: jest.MockedFunction<any>) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
      findMany: participantFindMany,
    },
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
  } as unknown as PrismaClient;
}

function makeCallSession(type: 'audio' | 'video' = 'video') {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    mode: 'p2p',
    metadata: { type },
    initiator: { id: USER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null },
    participants: [],
  };
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-i18n-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => { handlers[event] = fn; }),
    emit: jest.fn<any>(),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  return { socket, handlers };
}

function makeIo() {
  const roomEmit = jest.fn<any>();
  const fetchSockets = jest.fn<any>().mockResolvedValue([]);
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets }),
  };
  return { io };
}

describe('CallEventsHandler — call:initiate VoIP push i18n (audit #11)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockGenerateIceServers.mockReturnValue([]);
    mockScheduleRingingTimeout.mockReturnValue(undefined);
    mockCreateCallSummaryMessage.mockResolvedValue(null);
  });

  it('localizes title/body to the callee systemLanguage (en) instead of hardcoded French', async () => {
    mockInitiateCall.mockResolvedValue(makeCallSession('video'));
    const offlineUserId = 'user-offline-en';
    const prisma = makePrisma(
      jest.fn<any>().mockResolvedValue([
        { userId: offlineUserId, user: { systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null } },
      ])
    );
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();
    const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);

    const handler = new CallEventsHandler(prisma);
    handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers[CALL_EVENTS.INITIATE]({ conversationId: CONV_ID, type: 'video', settings: {} }, jest.fn<any>());

    expect(mockSendToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: offlineUserId,
        payload: expect.objectContaining({
          title: 'Alice Smith is calling you',
          body: 'Video call',
        }),
      })
    );
  });

  it('localizes title/body to the callee systemLanguage (es) for an audio call', async () => {
    mockInitiateCall.mockResolvedValue(makeCallSession('audio'));
    const offlineUserId = 'user-offline-es';
    const prisma = makePrisma(
      jest.fn<any>().mockResolvedValue([
        { userId: offlineUserId, user: { systemLanguage: 'es', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null } },
      ])
    );
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();
    const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);

    const handler = new CallEventsHandler(prisma);
    handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers[CALL_EVENTS.INITIATE]({ conversationId: CONV_ID, type: 'audio', settings: {} }, jest.fn<any>());

    expect(mockSendToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: offlineUserId,
        payload: expect.objectContaining({
          title: 'Alice Smith te está llamando',
          body: 'Llamada de voz',
        }),
      })
    );
  });

  it('falls back to French when the member row carries no resolvable user language (legacy/no-user)', async () => {
    mockInitiateCall.mockResolvedValue(makeCallSession('video'));
    const offlineUserId = 'user-offline-no-lang';
    const prisma = makePrisma(
      jest.fn<any>().mockResolvedValue([{ userId: offlineUserId }])
    );
    const { socket, handlers } = makeSocket();
    const { io } = makeIo();
    const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);

    const handler = new CallEventsHandler(prisma);
    handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers[CALL_EVENTS.INITIATE]({ conversationId: CONV_ID, type: 'video', settings: {} }, jest.fn<any>());

    expect(mockSendToUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: offlineUserId,
        payload: expect.objectContaining({
          title: 'Alice Smith vous appelle',
          body: 'Appel vidéo',
        }),
      })
    );
  });
});
