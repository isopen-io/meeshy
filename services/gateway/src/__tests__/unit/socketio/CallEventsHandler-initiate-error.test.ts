/**
 * CallEventsHandler — call:initiate error fallback branch
 *
 * Covers the `error.message || 'Failed to initiate call'` branch inside the
 * catch block of call:initiate (line 651).
 *
 * This branch fires when a thrown value has no `.message` property (e.g. a
 * plain object or number).  The guard ensures the emitted ERROR event always
 * carries a well-formed string — never `undefined`.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

const mockInitiateCall = jest.fn<any>();
const mockGenerateIceServers4 = jest.fn<any>();
const mockScheduleRingingTimeout = jest.fn<any>();
const mockCreateCallSummaryMessage4 = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    initiateCall: mockInitiateCall,
    generateIceServers: mockGenerateIceServers4,
    scheduleRingingTimeout: mockScheduleRingingTimeout,
    createCallSummaryMessage: mockCreateCallSummaryMessage4,
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
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

const mockCheckRateLimit4 = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: mockCheckRateLimit4,
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: mockCheckRateLimit4,
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

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { validateSocketEvent } from '../../../middleware/validation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const PARTICIPANT_ID = 'participant-abc';

const INITIATE_DATA = {
  conversationId: CONV_ID,
  type: 'audio' as const,
  settings: {},
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(overrides: {
  participantFindFirst?: jest.MockedFunction<any>;
  participantFindMany?: jest.MockedFunction<any>;
} = {}) {
  return {
    participant: {
      findFirst: overrides.participantFindFirst
        ?? jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
      findMany: overrides.participantFindMany
        ?? jest.fn<any>().mockResolvedValue([]),
    },
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
    },
  } as unknown as PrismaClient;
}

function makeCallSession(overrides: Partial<{
  id: string;
  conversationId: string;
  mode: string;
  metadata: unknown;
  initiatorUsername: string | null;
  initiatorDisplayName: string | null;
}> = {}) {
  return {
    id: 'id' in overrides ? overrides.id! : CALL_ID,
    conversationId: 'conversationId' in overrides ? overrides.conversationId! : CONV_ID,
    mode: 'mode' in overrides ? overrides.mode! : 'p2p',
    metadata: 'metadata' in overrides ? overrides.metadata : { type: 'audio' },
    initiator: {
      id: USER_ID,
      username: 'initiatorUsername' in overrides ? overrides.initiatorUsername : 'alice',
      displayName: 'initiatorDisplayName' in overrides ? overrides.initiatorDisplayName : 'Alice Smith',
      avatar: null,
    },
    participants: [],
  };
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-initiate-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: directEmit,
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  return { socket, handlers, directEmit };
}

function makeIo() {
  const roomEmit = jest.fn<any>();
  const fetchSockets = jest.fn<any>().mockResolvedValue([]);
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets }),
  };
  return { io, roomEmit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:initiate error fallback branch', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockGenerateIceServers4.mockReturnValue([]);
    mockScheduleRingingTimeout.mockReturnValue(undefined);
    mockCreateCallSummaryMessage4.mockResolvedValue(null);
  });

  describe('call:initiate error path: thrown value has no .message', () => {
    it('emits CALL_EVENTS.ERROR with "Failed to initiate call" when error has no .message', async () => {
      // Throw a plain object — no .message property → triggers the `|| 'Failed to initiate call'` branch
      mockInitiateCall.mockRejectedValue({ statusCode: 500 });

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      const ack = jest.fn<any>();
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, ack);

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ message: 'Failed to initiate call' })
      );
    });

    it('acks { success: false } when initiateCall throws without .message', async () => {
      mockInitiateCall.mockRejectedValue({ statusCode: 500 });

      const prisma = makePrisma();
      const { socket, handlers } = makeSocket();
      const { io } = makeIo();
      const ack = jest.fn<any>();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, ack);

      expect(ack).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('parses error code correctly when error.message has a colon', async () => {
      mockInitiateCall.mockRejectedValue(new Error('CALL_ALREADY_ACTIVE: A call is already active'));

      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'CALL_ALREADY_ACTIVE', message: 'A call is already active' })
      );
    });

    it('does NOT call initiateCall when resolveParticipantId returns null', async () => {
      const prisma = {
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
        },
      } as unknown as PrismaClient;

      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(mockInitiateCall).not.toHaveBeenCalled();
      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'NOT_A_PARTICIPANT' })
      );
    });

    it('emits NOT_AUTHENTICATED when userId is undefined', async () => {
      const prisma = makePrisma();
      const { socket, handlers, directEmit } = makeSocket();
      const { io } = makeIo();

      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => undefined);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(directEmit).toHaveBeenCalledWith(
        CALL_EVENTS.ERROR,
        expect.objectContaining({ code: 'NOT_AUTHENTICATED' })
      );
      expect(mockInitiateCall).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // call:initiate happy path — covers callerName and offline push branches
  // -------------------------------------------------------------------------

  describe('call:initiate: callerName fallback (line 591) and offline push (line 641)', () => {
    it('uses "Unknown" as callerName when initiator has no displayName or username', async () => {
      // initiatorDisplayName=null AND initiatorUsername=null → hits the `|| 'Unknown'` branch
      const session = makeCallSession({ initiatorDisplayName: null, initiatorUsername: null });
      mockInitiateCall.mockResolvedValue(session);

      // One offline member — no sockets in their room → offlineUserIds.length = 1
      const offlineMemberId = 'user-offline-1';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });

      const { socket, handlers } = makeSocket();
      const { io } = makeIo(); // io.in().fetchSockets() → [] by default

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const mockPushService = { sendToUser: mockSendToUser };

      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService(mockPushService as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      // VoIP push was sent to the offline member with 'Unknown' as caller name
      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: offlineMemberId,
          payload: expect.objectContaining({
            callerName: 'Unknown',
          }),
        })
      );
    });

    it('sends VoIP push to offline members when offlineUserIds.length > 0 (line 641)', async () => {
      // Normal caller with displayName — just need offline member
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-2';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });

      const { socket, handlers } = makeSocket();
      // io.in().fetchSockets() returns [] → member treated as offline
      const { io } = makeIo();

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const mockPushService = { sendToUser: mockSendToUser };

      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService(mockPushService as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      // offlineUserIds.length > 0 → VoIP push attempted
      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: offlineMemberId })
      );
    });

    it('skips VoIP push when no push service is configured', async () => {
      // Even with offline members, no push sent when pushService is null
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-3';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      // NO push service set
      const handler = new CallEventsHandler(prisma);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      // Verify handler ran without errors and initiateCall was called
      expect(mockInitiateCall).toHaveBeenCalled();
    });

    it('uses initiator.username as callerName when displayName is null but username is set', async () => {
      const session = makeCallSession({ initiatorDisplayName: null, initiatorUsername: 'alice_user' });
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-4';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ callerName: 'alice_user' }),
        })
      );
    });

    it('localise le push VoIP à la langue résolue du callee (Prisme, audit #11)', async () => {
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-en';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });
      (prisma as any).user = {
        findMany: jest.fn<any>().mockResolvedValue([
          {
            id: offlineMemberId,
            systemLanguage: 'en',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: null,
          },
        ]),
      };

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: offlineMemberId,
          payload: expect.objectContaining({
            title: 'Alice Smith is calling you',
            body: 'Audio call',
          }),
        })
      );
    });

    it('retombe sur le français quand la résolution de langue échoue (le push part toujours)', async () => {
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-dbdown';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });
      (prisma as any).user = {
        findMany: jest.fn<any>().mockRejectedValue(new Error('db down')),
      };

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: offlineMemberId,
          payload: expect.objectContaining({
            title: 'Alice Smith vous appelle',
            body: 'Appel audio',
          }),
        })
      );
    });

    it('does not send VoIP push when all members are foreground (line 641 false branch)', async () => {
      // Member has an active foreground socket → foregroundUserIds.has(memberId) = true
      // → offlineUserIds = [] → if (offlineUserIds.length > 0) is false → line 641 not logged
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const foregroundMemberId = 'user-foreground-1';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: foregroundMemberId }]),
      });

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();
      // Override fetchSockets to return a socket with appForeground: true
      (io.in as jest.MockedFunction<any>).mockReturnValue({
        fetchSockets: jest.fn<any>().mockResolvedValue([
          { data: { appForeground: true }, emit: jest.fn<any>() },
        ]),
      });

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      // No offline member → sendToUser must not be called
      expect(mockSendToUser).not.toHaveBeenCalled();
      expect(mockInitiateCall).toHaveBeenCalled();
    });

    // Guideline 5 (MIIT) — CallKit must be inactive in China. iOS never
    // registers PushKit VoIP for China-region devices, so the gateway must
    // route those callees' incoming-call push through 'apns' instead of
    // 'voip' — same payload, no CallKit involved.
    it('routes the offline push via types: [\'apns\'] when the callee\'s deviceCountry is CN', async () => {
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-cn';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });
      (prisma as any).user = {
        findMany: jest.fn<any>().mockResolvedValue([
          {
            id: offlineMemberId,
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: null,
            deviceCountry: 'CN',
          },
        ]),
      };

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: offlineMemberId, types: ['apns'] })
      );
    });

    it('routes the offline push via types: [\'voip\'] when the callee\'s deviceCountry is not CN (unchanged behavior)', async () => {
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-fr';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });
      (prisma as any).user = {
        findMany: jest.fn<any>().mockResolvedValue([
          {
            id: offlineMemberId,
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: null,
            deviceCountry: 'FR',
          },
        ]),
      };

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: offlineMemberId, types: ['voip'] })
      );
    });

    it('routes the offline push via types: [\'voip\'] when deviceCountry is null (conservative default)', async () => {
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-nocountry';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });
      (prisma as any).user = {
        findMany: jest.fn<any>().mockResolvedValue([
          {
            id: offlineMemberId,
            systemLanguage: 'fr',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: null,
            deviceCountry: null,
          },
        ]),
      };

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: offlineMemberId, types: ['voip'] })
      );
    });

    it('preserves the exact same payload (title/body/callId/data) regardless of the routing type', async () => {
      const session = makeCallSession();
      mockInitiateCall.mockResolvedValue(session);

      const offlineMemberId = 'user-offline-payload-check';
      const prisma = makePrisma({
        participantFindMany: jest.fn<any>().mockResolvedValue([{ userId: offlineMemberId }]),
      });
      (prisma as any).user = {
        findMany: jest.fn<any>().mockResolvedValue([
          {
            id: offlineMemberId,
            systemLanguage: 'en',
            regionalLanguage: null,
            customDestinationLanguage: null,
            deviceLocale: null,
            deviceCountry: 'CN',
          },
        ]),
      };

      const { socket, handlers } = makeSocket();
      const { io } = makeIo();

      const mockSendToUser = jest.fn<any>().mockResolvedValue(undefined);
      const handler = new CallEventsHandler(prisma);
      handler.setPushNotificationService({ sendToUser: mockSendToUser } as any);
      handler.setupCallEvents(socket as any, io, () => USER_ID);
      await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

      expect(mockSendToUser).toHaveBeenCalledWith(
        expect.objectContaining({
          types: ['apns'],
          bypassDnd: true,
          payload: expect.objectContaining({
            title: 'Alice Smith is calling you',
            body: 'Audio call',
            callId: CALL_ID,
            data: expect.objectContaining({
              type: 'call',
              callId: CALL_ID,
              conversationId: CONV_ID,
            }),
          }),
        })
      );
    });
  });
});
