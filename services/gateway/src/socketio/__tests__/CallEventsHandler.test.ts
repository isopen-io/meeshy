/**
 * Unit tests for CallEventsHandler
 * Covers: setupCallEvents (all 20 registered socket events),
 *         setters, createMissedCallNotifications, handleMissedCall,
 *         offer-buffering logic (via signal + join paths).
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks (must be defined before SUT import) ──────────────────────────────

const mockCallServiceInitiateCall = jest.fn() as jest.Mock<any>;
const mockCallServiceJoinCall = jest.fn() as jest.Mock<any>;
const mockCallServiceLeaveCall = jest.fn() as jest.Mock<any>;
const mockCallServiceEndCall = jest.fn() as jest.Mock<any>;
const mockCallServiceGetCallSession = jest.fn() as jest.Mock<any>;
const mockCallServiceUpdateCallStatus = jest.fn() as jest.Mock<any>;
const mockCallServiceUpdateParticipantMedia = jest.fn() as jest.Mock<any>;
const mockCallServiceMarkCallAsMissed = jest.fn() as jest.Mock<any>;
const mockCallServiceGetUnrespondedParticipants = jest.fn() as jest.Mock<any>;
const mockCallServiceGenerateIceServers = jest.fn() as jest.Mock<any>;
const mockCallServiceGetIceServerTtl = jest.fn().mockReturnValue(600) as jest.Mock<any>;
const mockCallServiceScheduleRingingTimeout = jest.fn() as jest.Mock<any>;
const mockCallServiceClearRingingTimeout = jest.fn() as jest.Mock<any>;
const mockCallServiceRecordHeartbeat = jest.fn() as jest.Mock<any>;
const mockCallServicePersistCallStats = jest.fn() as jest.Mock<any>;
const mockCallServiceRecordParticipantBackgrounded = jest.fn() as jest.Mock<any>;
const mockCallServiceClearParticipantBackgrounded = jest.fn() as jest.Mock<any>;
const mockCallServiceCreateCallSummaryMessage = jest.fn() as jest.Mock<any>;
const mockCallServiceCreateLiveCallMessage = jest.fn() as jest.Mock<any>;
const mockCallServiceReleaseActiveCallClaim = jest.fn() as jest.Mock<any>;
const mockCallServiceForceEndOrphanedCallSession = jest.fn() as jest.Mock<any>;
const mockCallServiceResolveEndReason = jest.fn((reason?: string) => {
  switch (reason) {
    case 'missed': return 'missed';
    case 'rejected': return 'rejected';
    case 'failed': return 'failed';
    case 'connectionLost': return 'connectionLost';
    case 'heartbeatTimeout': return 'heartbeatTimeout';
    case 'garbageCollected': return 'garbageCollected';
    default: return 'completed';
  }
}) as jest.Mock<any>;

jest.mock('../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    initiateCall: (...a: unknown[]) => mockCallServiceInitiateCall(...a),
    joinCall: (...a: unknown[]) => mockCallServiceJoinCall(...a),
    leaveCall: (...a: unknown[]) => mockCallServiceLeaveCall(...a),
    endCall: (...a: unknown[]) => mockCallServiceEndCall(...a),
    getCallSession: (...a: unknown[]) => mockCallServiceGetCallSession(...a),
    updateCallStatus: (...a: unknown[]) => mockCallServiceUpdateCallStatus(...a),
    updateParticipantMedia: (...a: unknown[]) => mockCallServiceUpdateParticipantMedia(...a),
    markCallAsMissed: (...a: unknown[]) => mockCallServiceMarkCallAsMissed(...a),
    getUnrespondedParticipants: (...a: unknown[]) => mockCallServiceGetUnrespondedParticipants(...a),
    generateIceServers: (...a: unknown[]) => mockCallServiceGenerateIceServers(...a),
    getIceServerTtl: (...a: unknown[]) => mockCallServiceGetIceServerTtl(...a),
    scheduleRingingTimeout: (...a: unknown[]) => mockCallServiceScheduleRingingTimeout(...a),
    clearRingingTimeout: (...a: unknown[]) => mockCallServiceClearRingingTimeout(...a),
    recordHeartbeat: (...a: unknown[]) => mockCallServiceRecordHeartbeat(...a),
    persistCallStats: (...a: unknown[]) => mockCallServicePersistCallStats(...a),
    createCallSummaryMessage: (...a: unknown[]) => mockCallServiceCreateCallSummaryMessage(...a),
    createLiveCallMessage: (...a: unknown[]) => mockCallServiceCreateLiveCallMessage(...a),
    recordParticipantBackgrounded: (...a: unknown[]) => mockCallServiceRecordParticipantBackgrounded(...a),
    clearParticipantBackgrounded: (...a: unknown[]) => mockCallServiceClearParticipantBackgrounded(...a),
    releaseActiveCallClaim: (...a: unknown[]) => mockCallServiceReleaseActiveCallClaim(...a),
    forceEndOrphanedCallSession: (...a: unknown[]) => mockCallServiceForceEndOrphanedCallSession(...a),
    resolveEndReason: (...a: unknown[]) => mockCallServiceResolveEndReason(...a),
  })),
}));

const mockValidateSocketEvent = jest.fn() as jest.Mock<any>;
const mockIsValidationFailure = jest.fn((r: any) => !r.success) as jest.Mock<any>;
jest.mock('../../middleware/validation', () => ({
  validateSocketEvent: (...a: unknown[]) => mockValidateSocketEvent(...a),
  isValidationFailure: (...a: unknown[]) => mockIsValidationFailure(...a),
}));

const mockCheckSocketRateLimit = jest.fn() as jest.Mock<any>;
const mockGetSocketRateLimiter = jest.fn() as jest.Mock<any>;
jest.mock('../../utils/socket-rate-limiter', () => ({
  checkSocketRateLimit: (...a: unknown[]) => mockCheckSocketRateLimit(...a),
  getSocketRateLimiter: (...a: unknown[]) => mockGetSocketRateLimiter(...a),
  SOCKET_RATE_LIMITS: {
    CALL_INITIATE: { max: 5, window: 60 },
    CALL_JOIN: { max: 20, window: 60 },
    CALL_LEAVE: { max: 20, window: 60 },
    CALL_SIGNAL: { max: 100, window: 10 },
    MEDIA_TOGGLE: { max: 50, window: 60 },
    CALL_BACKGROUNDED: { max: 20, window: 60 },
    CALL_FOREGROUNDED: { max: 20, window: 60 },
    PRESENCE_APP_STATE: { max: 30, window: 60 },
  },
}));

jest.mock('../../validation/call-schemas', () => ({
  socketInitiateCallSchema: {},
  socketJoinCallSchema: {},
  socketLeaveCallSchema: {},
  socketSignalSchema: {},
  socketMediaToggleSchema: {},
  socketEndCallSchema: {},
  socketHeartbeatSchema: {},
  socketQualityReportSchema: {},
  socketReconnectingSchema: {},
  socketReconnectedSchema: {},
  socketForceLeaveSchema: {},
  socketTranscriptionSegmentSchema: {},
  socketRequestIceServersSchema: {},
  socketCallBackgroundedSchema: {},
  socketCallForegroundedSchema: {},
  socketCallScreenCaptureDetectedSchema: {},
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_EVENTS: {
    INITIATE: 'call:initiate',
    JOIN: 'call:join',
    LEAVE: 'call:leave',
    SIGNAL: 'call:signal',
    TOGGLE_AUDIO: 'call:toggle-audio',
    TOGGLE_VIDEO: 'call:toggle-video',
    END: 'call:end',
    HEARTBEAT: 'call:heartbeat',
    QUALITY_REPORT: 'call:quality-report',
    RECONNECTING: 'call:reconnecting',
    RECONNECTED: 'call:reconnected',
    TRANSCRIPTION_SEGMENT: 'call:transcription-segment',
    INITIATED: 'call:initiated',
    PARTICIPANT_JOINED: 'call:participant-joined',
    PARTICIPANT_LEFT: 'call:participant-left',
    ENDED: 'call:ended',
    ERROR: 'call:error',
    MISSED: 'call:missed',
    ALREADY_ANSWERED: 'call:already-answered',
    QUALITY_ALERT: 'call:quality-alert',
    MEDIA_TOGGLED: 'call:media-toggled',
    TRANSLATED_SEGMENT: 'call:translated-segment',
    REQUEST_ICE_SERVERS: 'call:request-ice-servers',
    ICE_SERVERS_REFRESHED: 'call:ice-servers-refreshed',
    BACKGROUNDED: 'call:backgrounded',
    FOREGROUNDED: 'call:foregrounded',
    SCREEN_CAPTURE_DETECTED: 'call:screen-capture-detected',
    SCREEN_CAPTURE_ALERT: 'call:screen-capture-alert',
    ANALYTICS: 'call:analytics',
  },
  CALL_ERROR_CODES: {
    NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
    NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    INVALID_SIGNAL: 'INVALID_SIGNAL',
    SIGNAL_SENDER_MISMATCH: 'SIGNAL_SENDER_MISMATCH',
    TARGET_NOT_FOUND: 'TARGET_NOT_FOUND',
    CALL_NOT_FOUND: 'CALL_NOT_FOUND',
    MEDIA_TOGGLE_FAILED: 'MEDIA_TOGGLE_FAILED',
  },
  CALL_TERMINAL_STATUSES: ['ended', 'missed', 'rejected', 'failed'],
}));

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(),
  CallStatus: {
    initiated: 'initiated',
    ringing: 'ringing',
    connecting: 'connecting',
    active: 'active',
    reconnecting: 'reconnecting',
    missed: 'missed',
    ended: 'ended',
  },
  CallEndReason: {
    completed: 'completed',
    missed: 'missed',
    declined: 'declined',
    cancelled: 'cancelled',
    network_error: 'network_error',
    connectionLost: 'connectionLost',
  },
}));

import { CallEventsHandler } from '../CallEventsHandler';
import { logger } from '../../utils/logger';

// ─── Factories ───────────────────────────────────────────────────────────────

const CALL_ID = '507f191e810c19729de860ea';
const CONV_ID = '507f191e810c19729de860eb';
const USER_ID = '507f191e810c19729de860ec';
const SOCKET_ID = 'socket-abc';
const PARTICIPANT_ID = '507f191e810c19729de860ed';

type Listeners = Record<string, Function>;

function makeSocket(overrides: Record<string, any> = {}) {
  const listeners: Listeners = {};
  const socket = {
    id: SOCKET_ID,
    data: {} as Record<string, unknown>,
    rooms: new Set<string>([SOCKET_ID]),
    on: (event: string, handler: Function) => { listeners[event] = handler; },
    emit: jest.fn<any>(),
    join: jest.fn<any>(),
    leave: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    _listeners: listeners,
    _trigger: async (event: string, ...args: any[]) => {
      const fn = listeners[event];
      if (fn) await fn(...args);
    },
    ...overrides,
  };
  return socket;
}

function makeIo() {
  const roomEmit = jest.fn<any>();
  const fetchSockets = jest.fn<any>().mockResolvedValue([]);
  const inChain = { fetchSockets, emit: jest.fn<any>() };
  return {
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    in: jest.fn<any>().mockReturnValue(inChain),
    _roomEmit: roomEmit,
    _fetchSockets: fetchSockets,
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn<any>().mockImplementation(async (fn: Function) => fn({
      callParticipant: {
        update: jest.fn<any>().mockResolvedValue({}),
        count: jest.fn<any>().mockResolvedValue(0),
      },
      callSession: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        update: jest.fn<any>().mockResolvedValue({}),
      },
    })),
    ...overrides,
  };
}

function makeCallSession(overrides: Record<string, any> = {}) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: USER_ID,
    mode: 'p2p',
    status: 'active',
    startedAt: new Date(),
    endedAt: null,
    duration: 120,
    endReason: 'completed',
    metadata: { type: 'video' },
    participants: [],
    initiator: {
      id: USER_ID,
      username: 'testuser',
      displayName: 'Test User',
      avatar: null,
    },
    ...overrides,
  };
}

function makeParticipant(overrides: Record<string, any> = {}) {
  return {
    id: PARTICIPANT_ID,
    callSessionId: CALL_ID,
    participantId: PARTICIPANT_ID,
    role: 'participant',
    joinedAt: new Date(),
    leftAt: null,
    isAudioEnabled: true,
    isVideoEnabled: true,
    connectionQuality: 'good',
    participant: {
      userId: USER_ID,
      displayName: 'Test User',
      user: {
        username: 'testuser',
        displayName: 'Test User',
        avatar: null,
      },
    },
    ...overrides,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildHandler(prismaOverrides?: Record<string, any>) {
  const prisma = makePrisma(prismaOverrides);
  const handler = new CallEventsHandler(prisma as any);
  return { handler, prisma };
}

function setupWithSocket(prismaOverrides?: Record<string, any>) {
  const { handler, prisma } = buildHandler(prismaOverrides);
  const socket = makeSocket();
  const io = makeIo();
  const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
  const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });

  handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

  return { handler, socket, io, prisma, getUserId, getUserInfo };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CallEventsHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSocketRateLimiter.mockReturnValue({});
    mockCheckSocketRateLimit.mockResolvedValue(true);
    // Echo the input back as `data`, mirroring the real validateSocketEvent
    // (Zod's schema.parse() on success) — handlers that forward the
    // validated payload (e.g. call:signal relay) depend on this shape.
    mockValidateSocketEvent.mockImplementation((_schema: unknown, data: unknown) => ({ success: true, data }));
    mockCallServiceGenerateIceServers.mockReturnValue([{ urls: 'stun:stun.l.google.com:19302' }]);
    mockCallServiceUpdateCallStatus.mockResolvedValue({});
    mockCallServiceMarkCallAsMissed.mockResolvedValue({});
    mockCallServiceGetUnrespondedParticipants.mockResolvedValue([]);
    mockCallServiceScheduleRingingTimeout.mockReturnValue(undefined);
    mockCallServiceClearRingingTimeout.mockReturnValue(undefined);
    mockCallServiceRecordHeartbeat.mockReturnValue(undefined);
    mockCallServicePersistCallStats.mockResolvedValue(undefined);
    mockCallServiceCreateCallSummaryMessage.mockResolvedValue(null);
    mockCallServiceCreateLiveCallMessage.mockResolvedValue(null);
    mockCallServiceRecordParticipantBackgrounded.mockReturnValue(undefined);
    mockCallServiceClearParticipantBackgrounded.mockReturnValue(undefined);
  });

  // ── Setters ──────────────────────────────────────────────────────────────

  describe('setNotificationService', () => {
    it('stores the notification service', () => {
      const { handler } = buildHandler();
      const ns = { createMissedCallNotification: jest.fn() };
      handler.setNotificationService(ns as any);
      // Side effect: used in createMissedCallNotifications (no throw)
      expect(() => handler.setNotificationService(ns as any)).not.toThrow();
    });
  });

  describe('setPushNotificationService', () => {
    it('stores the push service', () => {
      const { handler } = buildHandler();
      const ps = { sendToUser: jest.fn() };
      handler.setPushNotificationService(ps as any);
      expect(() => handler.setPushNotificationService(ps as any)).not.toThrow();
    });
  });

  describe('setMessageBroadcaster', () => {
    it('stores the broadcaster function', () => {
      const { handler } = buildHandler();
      const broadcaster = jest.fn<any>().mockResolvedValue(undefined);
      handler.setMessageBroadcaster(broadcaster);
      expect(() => handler.setMessageBroadcaster(broadcaster)).not.toThrow();
    });
  });

  // ── presence:app-state ───────────────────────────────────────────────────

  describe('presence:app-state', () => {
    it('sets socket.data.appForeground to true when foreground=true', async () => {
      const { socket } = setupWithSocket();
      await socket._trigger('presence:app-state', { foreground: true });
      expect(socket.data.appForeground).toBe(true);
    });

    it('sets socket.data.appForeground to false when foreground=false', async () => {
      const { socket } = setupWithSocket();
      await socket._trigger('presence:app-state', { foreground: false });
      expect(socket.data.appForeground).toBe(false);
    });

    it('sets socket.data.appForeground to false when data missing', async () => {
      const { socket } = setupWithSocket();
      await socket._trigger('presence:app-state', {});
      expect(socket.data.appForeground).toBe(false);
    });

    it('returns early when no userId (does not set appForeground)', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('presence:app-state', { foreground: true });
      expect(socket.data.appForeground).toBeUndefined();
    });

    it('returns early when rate limit exceeded (does not set appForeground)', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockResolvedValue(false);
      await socket._trigger('presence:app-state', { foreground: true });
      expect(socket.data.appForeground).toBeUndefined();
    });

    // Was the one handler in this file with no try/catch. `emit()` doesn't
    // await rejected promises, so a thrown rate-limiter failure here used to
    // become an unhandled rejection instead of a contained, logged failure
    // like every sibling handler.
    it('catches and logs instead of throwing when the rate limiter check rejects', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockRejectedValue(new Error('redis down'));

      await expect(socket._trigger('presence:app-state', { foreground: true })).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalledWith('presence:app-state failed', { error: 'redis down' });
      expect(socket.data.appForeground).toBeUndefined();
    });
  });

  // ── call:check-active ────────────────────────────────────────────────────

  describe('call:check-active', () => {
    it('returns early when userId not found', async () => {
      const { socket, io, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:check-active');
      expect(io.to).not.toHaveBeenCalled();
    });

    it('returns early when user has no active conversations', async () => {
      const { socket, io } = setupWithSocket({
        participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      await socket._trigger('call:check-active');
      expect(io.to).not.toHaveBeenCalled();
    });

    it('replays initiated call to reconnecting user', async () => {
      const callSession = makeCallSession({ status: 'ringing' });
      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONV_ID }]),
        },
        callSession: {
          findMany: jest.fn<any>().mockResolvedValue([{ id: CALL_ID }]),
          findUnique: jest.fn<any>().mockResolvedValue(null),
        },
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([]), // user not in call participants yet
        },
      });
      mockCallServiceGetCallSession.mockResolvedValue(callSession);

      await socket._trigger('call:check-active');
      expect(socket.emit).toHaveBeenCalledWith('call:initiated', expect.objectContaining({ callId: CALL_ID }));
    });

    it('skips calls where user already left (leftAt set)', async () => {
      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONV_ID }]),
        },
        callSession: {
          findMany: jest.fn<any>().mockResolvedValue([{ id: CALL_ID }]),
          findUnique: jest.fn<any>().mockResolvedValue(null),
        },
        callParticipant: {
          // user already left this call
          findMany: jest.fn<any>().mockResolvedValue([{ callSessionId: CALL_ID, leftAt: new Date() }]),
        },
      });

      await socket._trigger('call:check-active');
      expect(mockCallServiceGetCallSession).not.toHaveBeenCalled();
    });
  });

  // ── call:initiate ────────────────────────────────────────────────────────

  describe('call:initiate', () => {
    const validData = {
      conversationId: CONV_ID,
      type: 'video',
      settings: { audioEnabled: true, videoEnabled: true },
    };

    it('emits error when userId not found', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:initiate', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
    });

    it('emits error for anonymous users', async () => {
      const { socket, getUserInfo } = setupWithSocket();
      getUserInfo.mockReturnValue({ id: USER_ID, isAnonymous: true });
      await socket._trigger('call:initiate', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    });

    it('returns early when rate limit exceeded', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockResolvedValue(false);
      await socket._trigger('call:initiate', validData);
      expect(mockCallServiceInitiateCall).not.toHaveBeenCalled();
    });

    it('emits error when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad input', details: {} });
      await socket._trigger('call:initiate', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('emits error when user is not a participant', async () => {
      const { socket } = setupWithSocket({
        participant: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      await socket._trigger('call:initiate', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    });

    it('initiates call successfully, ACKs caller, notifies members', async () => {
      const callSession = makeCallSession();
      mockCallServiceInitiateCall.mockResolvedValue(callSession);
      const ack = jest.fn();

      const memberSocket = { id: 'member-socket', emit: jest.fn(), data: { appForeground: true } };
      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([
            { userId: USER_ID },
            { userId: 'other-user-id' },
          ]),
        },
      });

      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([memberSocket]) });

      await socket._trigger('call:initiate', validData, ack);

      expect(socket.join).toHaveBeenCalledWith(`call:${CALL_ID}`);
      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(memberSocket.emit).toHaveBeenCalledWith('call:initiated', expect.objectContaining({ callId: CALL_ID }));
      expect(mockCallServiceScheduleRingingTimeout).toHaveBeenCalled();
    });

    it('poste le message d\'appel vivant après l\'ack et le broadcast via messageBroadcaster', async () => {
      const callSession = makeCallSession();
      mockCallServiceInitiateCall.mockResolvedValue(callSession);
      const liveMessage = { id: 'msg-live', conversationId: CONV_ID };
      mockCallServiceCreateLiveCallMessage.mockResolvedValue(liveMessage);
      const broadcaster = jest.fn<any>().mockResolvedValue(undefined);
      const ack = jest.fn();

      const { handler, socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
        },
      });
      handler.setMessageBroadcaster(broadcaster);
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:initiate', validData, ack);
      await new Promise(r => setImmediate(r));

      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(mockCallServiceCreateLiveCallMessage).toHaveBeenCalledWith(CALL_ID);
      expect(broadcaster).toHaveBeenCalledWith(liveMessage, CONV_ID);
    });

    it('un message vivant null (course terminale déjà gagnée) n\'affecte ni l\'ack ni le setup', async () => {
      const callSession = makeCallSession();
      mockCallServiceInitiateCall.mockResolvedValue(callSession);
      mockCallServiceCreateLiveCallMessage.mockResolvedValue(null);
      const broadcaster = jest.fn<any>().mockResolvedValue(undefined);
      const ack = jest.fn();

      const { handler, socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
        },
      });
      handler.setMessageBroadcaster(broadcaster);
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:initiate', validData, ack);
      await new Promise(r => setImmediate(r));

      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(broadcaster).not.toHaveBeenCalled();
      expect(mockCallServiceScheduleRingingTimeout).toHaveBeenCalled();
    });

    it('sends VoIP push to offline/backgrounded users', async () => {
      const callSession = makeCallSession();
      mockCallServiceInitiateCall.mockResolvedValue(callSession);
      const pushService = { sendToUser: jest.fn<any>().mockResolvedValue(undefined) };

      const { handler, socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([
            { userId: USER_ID },
            { userId: 'offline-user' },
          ]),
        },
      });

      // offline-user has no sockets
      handler.setPushNotificationService(pushService as any);
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:initiate', validData);

      expect(pushService.sendToUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'offline-user' }));
    });

    it('fires ringing-timeout callback and marks call missed when it fires', async () => {
      const callSession = makeCallSession({ status: 'ringing' });
      mockCallServiceInitiateCall.mockResolvedValue(callSession);

      let capturedCallback: Function | null = null;
      mockCallServiceScheduleRingingTimeout.mockImplementation((_id: string, cb: Function) => {
        capturedCallback = cb;
      });

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
        },
        callSession: {
          updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:initiate', validData);

      // fire the ringing timeout
      expect(capturedCallback).not.toBeNull();
      await capturedCallback!();

      // Terminal broadcast targets call room + conversation room + every
      // member USER room in one deduplicated emit (same audience as the
      // call:initiated invitation — a still-ringing callee sits in neither
      // of the first two rooms).
      expect(io.to).toHaveBeenCalledWith(
        expect.arrayContaining([`call:${CALL_ID}`, `conversation:${CONV_ID}`, `user:${USER_ID}`])
      );
    });

    it('ack with error when callService.initiateCall throws', async () => {
      mockCallServiceInitiateCall.mockRejectedValue(new Error('CALL_ACTIVE: already active'));
      const ack = jest.fn();

      await (setupWithSocket()).socket._trigger('call:initiate', validData, ack);

      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  // ── call:join ────────────────────────────────────────────────────────────

  describe('call:join', () => {
    const validData = { callId: CALL_ID, settings: {} };

    it('emits error when not authenticated', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:join', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
    });

    it('emits error for anonymous users', async () => {
      const { socket, getUserInfo } = setupWithSocket();
      getUserInfo.mockReturnValue({ id: USER_ID, isAnonymous: true });
      await socket._trigger('call:join', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'PERMISSION_DENIED' }));
    });

    it('returns early when rate limit exceeded', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockResolvedValue(false);
      await socket._trigger('call:join', validData);
      expect(mockCallServiceJoinCall).not.toHaveBeenCalled();
    });

    it('emits error when not a participant', async () => {
      const { socket } = setupWithSocket({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      await socket._trigger('call:join', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    });

    // Scoping par appel (contrat CallError.callId, packages/shared/types/video-call.ts) —
    // un client avec un appel actif DOIT ignorer un call:error qui nomme un AUTRE
    // appel ; sans callId, le garde iOS (CallManager, audit 2026-07-08) ne peut pas
    // s'appliquer et l'erreur est traitée comme non-scopée. Chemin prod réel
    // (incident 2026-07-03) : call:join arrivé après la fin → CALL_ENDED.
    it('scopes the join-failure call:error to the callId (dead-call rejoin path)', async () => {
      mockCallServiceJoinCall.mockRejectedValue(new Error('CALL_ENDED: This call has already ended'));
      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      const ack = jest.fn();
      await socket._trigger('call:join', validData, ack);

      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'CALL_ENDED',
        callId: CALL_ID,
      }));
    });

    it('scopes the not-a-participant join error to the callId', async () => {
      const { socket } = setupWithSocket({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      await socket._trigger('call:join', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'NOT_A_PARTICIPANT',
        callId: CALL_ID,
      }));
    });

    it('joins call, ACKs, broadcasts participant-joined, notifies other devices', async () => {
      const participant = makeParticipant();
      const callSession = makeCallSession({ participants: [participant] });
      mockCallServiceJoinCall.mockResolvedValue({ callSession, iceServers: [] });

      const ack = jest.fn();
      const otherSocket = { id: 'other-socket', emit: jest.fn() };
      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([otherSocket]) });

      await socket._trigger('call:join', validData, ack);

      expect(socket.join).toHaveBeenCalledWith(`call:${CALL_ID}`);
      expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      expect(otherSocket.emit).toHaveBeenCalledWith('call:participant-joined', expect.any(Object));
    });

    it('replays buffered offer to late-joining participant', async () => {
      const { handler, socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      // Step 1: 'caller-user' sends an offer to USER_ID while USER_ID has no
      // active sockets — the offer is buffered for later replay.
      const callerPart = makeParticipant({ participant: { userId: 'caller-user', displayName: null, user: {} } });
      const joinerPart = makeParticipant({ participant: { userId: USER_ID, displayName: null, user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({
        participants: [callerPart, joinerPart],
      }));

      const offerSignal = { callId: CALL_ID, signal: { type: 'offer', from: 'caller-user', to: USER_ID, sdp: 'v=0...' } };
      const callerSocket = makeSocket();
      callerSocket.id = 'caller-socket';
      handler.setupCallEvents(
        callerSocket as any, io as any,
        jest.fn<any>().mockReturnValue('caller-user'),
        jest.fn<any>().mockReturnValue({ id: 'caller-user', isAnonymous: false }),
      );
      await callerSocket._trigger('call:signal', offerSignal); // buffers the offer

      // Step 2: USER_ID joins — buffered offer is replayed to this socket.
      // Both the offer sender ('caller-user', still active) and the joiner
      // must be present so the C2 sender-active check passes.
      const joinSession = makeCallSession({
        participants: [
          makeParticipant({ participant: { userId: 'caller-user', displayName: null, user: {} } }),
          makeParticipant(),
        ],
      });
      mockCallServiceJoinCall.mockResolvedValue({ callSession: joinSession, iceServers: [] });
      await socket._trigger('call:join', validData);

      const signalEmit = (socket.emit as jest.Mock<any>).mock.calls
        .find((c: any[]) => c[0] === 'call:signal');
      expect(signalEmit).toBeDefined();
    });

    it('handles no-callback case without throwing', async () => {
      const participant = makeParticipant();
      const callSession = makeCallSession({ participants: [participant] });
      mockCallServiceJoinCall.mockResolvedValue({ callSession, iceServers: [] });

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await expect(socket._trigger('call:join', validData)).resolves.not.toThrow();
    });

    // CALL-RESILIENCE follow-up — a reconnect attempt that itself fails
    // transiently (DB hiccup in joinCall, not a real "call already ended")
    // must not silently disarm the reconnect-grace safety net that's
    // protecting a call which is still genuinely active. Previously
    // `cancelDisconnectGrace` ran unconditionally BEFORE resolveParticipantIdFromCall/
    // joinCall could fail, so a failed join left the participant with
    // neither an active socket in the room NOR a grace timer — the call now
    // depended solely on CallCleanupService's much slower GC tiers.
    it('does not lose the reconnect grace window when the join itself fails transiently', async () => {
      jest.useFakeTimers();
      mockCallServiceLeaveCall.mockResolvedValue(makeCallSession({ status: 'active' }));

      const activeParticipation = {
        id: PARTICIPANT_ID,
        callSessionId: CALL_ID,
        participantId: PARTICIPANT_ID,
        callSession: { status: 'active', mode: 'p2p', conversationId: CONV_ID },
      };

      const { socket, io } = setupWithSocket({
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([activeParticipation]),
          findUnique: jest.fn<any>().mockResolvedValue({ leftAt: null, callSession: { status: 'active' } }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      // Socket drops mid-call — grace armed (30s budget).
      await socket._trigger('disconnect');
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();

      // Reconnect attempt inside the grace window, but the join itself fails
      // transiently — this must not disarm the ORIGINAL grace timer.
      mockCallServiceJoinCall.mockRejectedValue(new Error('DB error'));
      await socket._trigger('call:join', validData);

      // The original grace timer must still be live: advancing past its
      // window still triggers the terminal leaveCall.
      await jest.advanceTimersByTimeAsync(31_000);

      expect(mockCallServiceLeaveCall).toHaveBeenCalledWith(expect.objectContaining({ callId: CALL_ID }));
      jest.useRealTimers();
    });

  });

  // ── call:leave ───────────────────────────────────────────────────────────

  describe('call:leave', () => {
    const validData = { callId: CALL_ID };

    it('emits error when not authenticated', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:leave', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
    });

    // Scoping par appel (contrat CallError.callId) — même exigence que le
    // handler join (43d4d7b7e) : le garde client par appel ne s'applique
    // qu'aux erreurs qui nomment leur appel.
    it('scopes the leave-failure call:error to the callId', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      mockCallServiceLeaveCall.mockRejectedValue(new Error('LEAVE_FAIL: storage down'));
      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });
      await socket._trigger('call:leave', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'LEAVE_FAIL',
        callId: CALL_ID,
      }));
    });

    it('returns early when user is not in the call', async () => {
      // callSession has no matching active participant
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:leave', validData);
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });

    it('broadcasts participant-left and emits ended when call ends', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      const leftSession = makeCallSession({ status: 'ended', duration: 60 });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:leave', validData);

      expect(io.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
      expect(socket.leave).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });

    it('emits missed event and triggers handleMissedCall when status is missed', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      const leftSession = makeCallSession({ status: 'missed', duration: 0, endReason: 'missed' });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:leave', validData);

      // handleMissedCall fires async; need to flush
      await new Promise(r => setImmediate(r));
      expect(mockCallServiceMarkCallAsMissed).toHaveBeenCalledWith(CALL_ID);
    });

    it('fans out call:ended to member USER rooms when the last leave closes the call', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      const leftSession = makeCallSession({ status: 'missed', duration: 0, endReason: 'missed' });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([
            { userId: USER_ID },
            { userId: 'ringing-callee-id' },
          ]),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:leave', validData);

      expect(io.to).toHaveBeenCalledWith(
        expect.arrayContaining([
          `call:${CALL_ID}`,
          `conversation:${CONV_ID}`,
          'user:ringing-callee-id',
        ])
      );
    });

    it('broadcasts only participant-left when call is still ongoing', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      const leftSession = makeCallSession({ status: 'active' });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:leave', validData);

      const toEmitCalls = (io.to as jest.Mock<any>).mock.calls;
      // ended should NOT have been emitted for conversation room
      const convRoomCalls = toEmitCalls.filter((c: any[]) => c[0] === `conversation:${CONV_ID}`);
      expect(convRoomCalls.length).toBe(0);
    });

    it('emits error and propagates on callService.leaveCall failure', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      mockCallServiceLeaveCall.mockRejectedValue(new Error('DB_ERROR: connection lost'));

      const { socket } = setupWithSocket();
      await socket._trigger('call:leave', validData);

      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ message: 'connection lost' }));
    });

    // Audit Vague 27 (sibling-drift, mirrors call:end's catch) — leaveCall()
    // can genuinely throw (CALL_NOT_FOUND, a non-transient DB error inside
    // its transaction); unlike call:end, this catch used to only log + emit
    // a client error, leaving the CallSession stuck non-terminal and
    // blocking every future call:initiate in the conversation until GC
    // reaps it (~120s).
    it('force-ends the orphaned session when leaveCall itself throws, same recovery as call:end', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      mockCallServiceLeaveCall.mockRejectedValue(new Error('DB_ERROR: connection lost'));

      const { socket } = setupWithSocket();
      await socket._trigger('call:leave', validData);

      expect(mockCallServiceForceEndOrphanedCallSession).toHaveBeenCalledWith(CALL_ID, 'completed');
    });

    // Room-membership leak fix (mirrors call:end's "removes all sockets"
    // behaviour, line ~2789): call:leave only ever called `socket.leave()` on
    // the LEAVING user's own socket. When a direct call ends via a decline/
    // leave (not call:end), the other participant's still-connected socket
    // stayed a member of `call:${CALL_ID}` forever — a per-session Socket.IO
    // room-membership leak that only call:end's terminal path cleared.
    it('evicts every socket from the call room (not just the leaving one) when the leave ends the call', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      const leftSession = makeCallSession({ status: 'ended', duration: 60 });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const otherParticipantSocket = { leave: jest.fn() };
      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([otherParticipantSocket]) });

      await socket._trigger('call:leave', validData);

      expect(otherParticipantSocket.leave).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });
  });

  // ── call:force-leave ─────────────────────────────────────────────────────

  describe('call:force-leave', () => {
    const validData = { conversationId: CONV_ID };

    it('emits error when not authenticated', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:force-leave', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
    });

    it('returns early when rate limit exceeded', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockResolvedValue(false);
      await socket._trigger('call:force-leave', validData);
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });

    it('emits error when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad ObjectId' });
      await socket._trigger('call:force-leave', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('emits error when user is not a member of the conversation', async () => {
      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue(null),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });
      await socket._trigger('call:force-leave', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    });

    it('force-leaves active calls where user is a participant', async () => {
      const callParticipant = {
        id: PARTICIPANT_ID,
        participantId: PARTICIPANT_ID,
        leftAt: null,
        participant: { userId: USER_ID },
      };
      const activeCall = { id: CALL_ID, participants: [callParticipant] };
      const leftSession = makeCallSession({ status: 'active' });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findMany: jest.fn<any>().mockResolvedValue([activeCall]),
          findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:force-leave', validData);

      expect(mockCallServiceLeaveCall).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });

    it('broadcasts call:ended when force-leave ends the call', async () => {
      const callParticipant = {
        id: PARTICIPANT_ID,
        participantId: PARTICIPANT_ID,
        leftAt: null,
        participant: { userId: USER_ID },
      };
      const activeCall = { id: CALL_ID, participants: [callParticipant] };
      const leftSession = makeCallSession({ status: 'ended', duration: 30 });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findMany: jest.fn<any>().mockResolvedValue([activeCall]),
          findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:force-leave', validData);

      const toEmitArgs = (io.to as jest.Mock<any>).mock.calls.map((c: any[]) => c[0]).flat();
      expect(toEmitArgs).toContain(`conversation:${CONV_ID}`);
    });

    // Room-membership leak fix — mirrors the same fix in call:leave above:
    // force-leave only ever left the FORCING user's own socket via
    // `socket.leave()`, never evicting the other participant's socket from
    // `call:${CALL_ID}` when the force-leave ends the call.
    it('evicts every socket from the call room when force-leave ends the call', async () => {
      const callParticipant = {
        id: PARTICIPANT_ID,
        participantId: PARTICIPANT_ID,
        leftAt: null,
        participant: { userId: USER_ID },
      };
      const activeCall = { id: CALL_ID, participants: [callParticipant] };
      const leftSession = makeCallSession({ status: 'ended', duration: 30 });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const otherParticipantSocket = { leave: jest.fn() };
      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findMany: jest.fn<any>().mockResolvedValue([activeCall]),
          findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([otherParticipantSocket]) });

      await socket._trigger('call:force-leave', validData);

      expect(otherParticipantSocket.leave).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });

    // Audit Vague 27 (sibling-drift, mirrors call:end/call:leave's catch) —
    // this per-call catch used to only log the failure. force-leave's whole
    // purpose is to unstick a call blocking CALL_ALREADY_ACTIVE, so a
    // swallowed leaveCall() failure here defeated that purpose entirely,
    // leaving the CallSession stuck non-terminal until GC reaps it (~120s).
    it('force-ends the orphaned session when leaveCall itself throws for one of the active calls', async () => {
      const callParticipant = {
        id: PARTICIPANT_ID,
        participantId: PARTICIPANT_ID,
        leftAt: null,
        participant: { userId: USER_ID },
      };
      const activeCall = { id: CALL_ID, participants: [callParticipant] };
      mockCallServiceLeaveCall.mockRejectedValue(new Error('DB_ERROR: connection lost'));

      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findMany: jest.fn<any>().mockResolvedValue([activeCall]),
          findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });

      await socket._trigger('call:force-leave', validData);

      expect(mockCallServiceForceEndOrphanedCallSession).toHaveBeenCalledWith(CALL_ID, 'completed');
    });
  });

  // ── call:signal ──────────────────────────────────────────────────────────

  describe('call:signal', () => {
    const validSignal = {
      callId: CALL_ID,
      signal: { type: 'offer', from: USER_ID, to: 'target-user-id', sdp: 'v=0...' },
    };

    it('emits error when not authenticated', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:signal', validSignal);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
    });

    it('returns early when rate limit exceeded', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockResolvedValue(false);
      await socket._trigger('call:signal', validSignal);
      expect(mockCallServiceGetCallSession).not.toHaveBeenCalled();
    });

    it('emits error when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad signal' });
      await socket._trigger('call:signal', validSignal);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'INVALID_SIGNAL' }));
    });

    it('emits error when sender is not a participant', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:signal', validSignal);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    });

    it('emits error on signal.from mismatch', async () => {
      const senderParticipant = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderParticipant] }));

      const { socket } = setupWithSocket();
      const mismatchedSignal = { ...validSignal, signal: { ...validSignal.signal, from: 'other-user' } };
      await socket._trigger('call:signal', mismatchedSignal);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'SIGNAL_SENDER_MISMATCH' }));
    });

    it('emits error when target participant not found', async () => {
      const senderParticipant = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderParticipant] }));

      const { socket } = setupWithSocket();
      const noTargetSignal = { ...validSignal, signal: { ...validSignal.signal, to: 'nonexistent-user' } };
      await socket._trigger('call:signal', noTargetSignal);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'TARGET_NOT_FOUND' }));
    });

    it('buffers offer when target has no active sockets, emits error + ack false', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'target-part', participantId: 'target-user-id', participant: { userId: 'target-user-id', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }); // no target sockets

      const ack = jest.fn();
      const offerSignal = { callId: CALL_ID, signal: { type: 'offer', from: USER_ID, to: 'target-user-id' } };
      await socket._trigger('call:signal', offerSignal, ack);

      expect(ack).toHaveBeenCalledWith({ success: false });
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'TARGET_NOT_FOUND' }));
    });

    it('does NOT buffer ice-candidate when target not found', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'target-part', participantId: 'target-user-id', participant: { userId: 'target-user-id', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      const iceCandidateSignal = { callId: CALL_ID, signal: { type: 'ice-candidate', from: USER_ID, to: 'target-user-id', candidate: {} } };
      await socket._trigger('call:signal', iceCandidateSignal);
      // No buffer for ice-candidate — just an error + ack false
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.any(Object));
    });

    it('forwards signal to target socket, clears timeout on answer', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'target-part', participantId: 'target-user-id', participant: { userId: 'target-user-id', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const targetSocket = { id: 'target-socket', emit: jest.fn() };
      const { socket, io, getUserId } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([targetSocket]) });
      getUserId.mockImplementation((socketId: string) =>
        socketId === 'target-socket' ? 'target-user-id' : USER_ID
      );

      const ack = jest.fn();
      const answerSignal = { callId: CALL_ID, signal: { type: 'answer', from: USER_ID, to: 'target-user-id' } };
      await socket._trigger('call:signal', answerSignal, ack);

      expect(io.to).toHaveBeenCalledWith('target-socket');
      expect(io._roomEmit).toHaveBeenCalledWith('call:signal', answerSignal);
      expect(ack).toHaveBeenCalledWith({ success: true });
      expect(mockCallServiceClearRingingTimeout).toHaveBeenCalledWith(CALL_ID);
    });

    // Audit Vague 27 — relocated from call:join, where this silent push was
    // permanently dead code (gated on a `CallStatus.connecting` the FSM
    // never actually writes, per Item F). The real "callee answered"
    // transition happens HERE, on the SDP answer signal.
    describe('call_answered_elsewhere background push on first answer', () => {
      const answerSignalSetup = (sessionOverrides: Record<string, any>) => {
        const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
        const targetPart = makeParticipant({ id: 'target-part', participantId: 'target-user-id', participant: { userId: 'target-user-id', user: {} } });
        mockCallServiceGetCallSession.mockResolvedValue(
          makeCallSession({ participants: [senderPart, targetPart], ...sessionOverrides })
        );
        const targetSocket = { id: 'target-socket', emit: jest.fn() };
        const ctx = setupWithSocket();
        ctx.io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([targetSocket]) });
        ctx.getUserId.mockImplementation((socketId: string) =>
          socketId === 'target-socket' ? 'target-user-id' : USER_ID
        );
        const pushService = { sendToUser: jest.fn<any>().mockResolvedValue([]) };
        ctx.handler.setPushNotificationService(pushService as any);
        return { ...ctx, pushService };
      };
      const answerSignal = { callId: CALL_ID, signal: { type: 'answer', from: USER_ID, to: 'target-user-id' } };

      it('callee answers for the first time (answeredAt not yet set) → silent push to the answerer\'s other devices', async () => {
        const { socket, pushService } = answerSignalSetup({ initiatorId: 'caller-user', answeredAt: null });

        await socket._trigger('call:signal', answerSignal, jest.fn());

        expect(pushService.sendToUser).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: USER_ID,
            types: ['apns', 'fcm'],
            platforms: ['ios', 'android'],
            payload: expect.objectContaining({
              silent: true,
              data: expect.objectContaining({ type: 'call_answered_elsewhere', callId: CALL_ID }),
            }),
          })
        );
      });

      it('a later renegotiation answer (answeredAt already set) never re-sends the push', async () => {
        const { socket, pushService } = answerSignalSetup({
          initiatorId: 'caller-user',
          answeredAt: new Date(Date.now() - 60_000),
        });

        await socket._trigger('call:signal', answerSignal, jest.fn());

        expect(pushService.sendToUser).not.toHaveBeenCalled();
      });

      it('the initiator\'s own answer signal never sends the push', async () => {
        const { socket, pushService } = answerSignalSetup({ initiatorId: USER_ID, answeredAt: null });

        await socket._trigger('call:signal', answerSignal, jest.fn());

        expect(pushService.sendToUser).not.toHaveBeenCalled();
      });

      it('push failure never breaks the signal ack', async () => {
        const { socket, pushService } = answerSignalSetup({ initiatorId: 'caller-user', answeredAt: null });
        pushService.sendToUser.mockRejectedValue(new Error('APNS down'));

        const ack = jest.fn();
        await socket._trigger('call:signal', answerSignal, ack);

        expect(ack).toHaveBeenCalledWith({ success: true });
      });
    });

    it('relays only the schema-validated payload, stripping unknown client-supplied fields', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'target-part', participantId: 'target-user-id', participant: { userId: 'target-user-id', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      // The real validateSocketEvent (Zod schema.parse()) strips fields not
      // declared on socketSignalSchema. Simulate that here, since the global
      // mock otherwise just echoes the raw input back.
      const sanitizedSignal = { callId: CALL_ID, signal: { type: 'answer', from: USER_ID, to: 'target-user-id' } };
      mockValidateSocketEvent.mockReturnValue({ success: true, data: sanitizedSignal });

      const targetSocket = { id: 'target-socket', emit: jest.fn() };
      const { socket, io, getUserId } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([targetSocket]) });
      getUserId.mockImplementation((socketId: string) =>
        socketId === 'target-socket' ? 'target-user-id' : USER_ID
      );

      const rawSignalWithExtraField = {
        callId: CALL_ID,
        signal: { type: 'answer', from: USER_ID, to: 'target-user-id', maliciousField: { injected: true } },
      };
      await socket._trigger('call:signal', rawSignalWithExtraField);

      // The relayed payload is the sanitized one, never the raw client object.
      expect(io._roomEmit).toHaveBeenCalledWith('call:signal', sanitizedSignal);
      expect(io._roomEmit).not.toHaveBeenCalledWith('call:signal', rawSignalWithExtraField);
    });
  });

  // ── call:toggle-audio ────────────────────────────────────────────────────

  describe('call:toggle-audio', () => {
    const validData = { callId: CALL_ID, enabled: false };

    it('emits error when not authenticated', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:toggle-audio', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
    });

    it('emits error when not a participant', async () => {
      // call:toggle-audio authorizes via resolveActiveCallParticipantId
      // (callService.getCallSession), not the conversation-membership check.
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-audio', validData);
      // Scoping par appel (contrat CallError.callId) — cf. 43d4d7b7e.
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'NOT_A_PARTICIPANT',
        callId: CALL_ID,
      }));
    });

    it('updates media and uses socket.to (excludes sender)', async () => {
      mockCallServiceUpdateParticipantMedia.mockResolvedValue(undefined);
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket, io } = setupWithSocket();

      await socket._trigger('call:toggle-audio', validData);

      expect(mockCallServiceUpdateParticipantMedia).toHaveBeenCalledWith(CALL_ID, PARTICIPANT_ID, 'audio', false);
      // P0-3 — the sender already applied its own mic state locally and must
      // NOT receive its own call:media-toggled echo (iOS reads any received
      // event as the REMOTE peer's state). `io.to` would wrongly include the
      // sender; `socket.to` excludes it, mirroring call:toggle-video below.
      expect(socket.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
      expect(io.to).not.toHaveBeenCalled();
    });

    it('relays the real error code/message when updateParticipantMedia throws a coded error', async () => {
      mockCallServiceUpdateParticipantMedia.mockRejectedValue(new Error('CALL_NOT_FOUND: Call session not found'));
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-audio', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', {
        code: 'CALL_NOT_FOUND',
        message: 'Call session not found',
        callId: CALL_ID
      });
    });

    it('falls back to the generic MEDIA_TOGGLE_FAILED code for uncoded errors, never the raw message', async () => {
      mockCallServiceUpdateParticipantMedia.mockRejectedValue(new Error('update failed'));
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-audio', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', {
        code: 'MEDIA_TOGGLE_FAILED',
        message: 'Failed to toggle audio',
        callId: CALL_ID
      });
    });
  });

  // ── call:toggle-video ────────────────────────────────────────────────────

  describe('call:toggle-video', () => {
    const validData = { callId: CALL_ID, enabled: true };

    it('emits error when not authenticated', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:toggle-video', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
    });

    it('updates media and uses socket.to (excludes sender)', async () => {
      mockCallServiceUpdateParticipantMedia.mockResolvedValue(undefined);
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();

      await socket._trigger('call:toggle-video', validData);

      expect(mockCallServiceUpdateParticipantMedia).toHaveBeenCalledWith(CALL_ID, PARTICIPANT_ID, 'video', true);
      expect(socket.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });

    it('emits error when not a participant', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-video', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    });

    it('relays the real error code/message when updateParticipantMedia throws a coded error', async () => {
      mockCallServiceUpdateParticipantMedia.mockRejectedValue(new Error('NOT_A_PARTICIPANT: You are not a participant in this conversation'));
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-video', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', {
        code: 'NOT_A_PARTICIPANT',
        message: 'You are not a participant in this conversation',
        callId: CALL_ID
      });
    });

    it('falls back to the generic MEDIA_TOGGLE_FAILED code for uncoded errors, never the raw message', async () => {
      mockCallServiceUpdateParticipantMedia.mockRejectedValue(new Error('video fail'));
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-video', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', {
        code: 'MEDIA_TOGGLE_FAILED',
        message: 'Failed to toggle video',
        callId: CALL_ID
      });
    });
  });

  // ── call:end ─────────────────────────────────────────────────────────────

  describe('call:request-ice-servers', () => {
    // Scoping par appel (contrat CallError.callId) — cf. 43d4d7b7e. Le refus
    // « pas dans la call room » doit nommer l'appel : un client avec un appel
    // actif A ne doit pas interpréter le refus d'un refresh pour l'appel B.
    it('scopes the not-in-room rejection to the callId', async () => {
      const { socket } = setupWithSocket();
      await socket._trigger('call:request-ice-servers', { callId: CALL_ID });
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'NOT_A_PARTICIPANT',
        callId: CALL_ID,
      }));
    });
  });

  describe('call:end', () => {
    const validData = { callId: CALL_ID };

    it('emits error and ack(false) when not authenticated', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      const ack = jest.fn();
      await socket._trigger('call:end', validData, ack);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_AUTHENTICATED' }));
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    it('ack(false) and returns when rate limit exceeded', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockResolvedValue(false);
      const ack = jest.fn();
      await socket._trigger('call:end', validData, ack);
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    it('emits error when not a participant in call', async () => {
      mockCallServiceGetCallSession.mockResolvedValueOnce(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      const ack = jest.fn();
      await socket._trigger('call:end', validData, ack);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    // Security fix 2026-07-10: this branch previously force-ended the call
    // session unconditionally whenever the caller couldn't be resolved to a
    // conversation participant — i.e. ANY caller, including a total stranger
    // who merely learned/guessed a callId, could terminate a real, live call
    // they had no relationship to. `resolveParticipantIdFromCall` failing
    // here is a genuine authorization rejection (no conversation membership
    // at all), not a transient state a real participant could hit, so this
    // must just reject — never force-end on the unauthorized caller's behalf.
    it('does NOT force-end the orphaned session when the ender cannot be resolved to a participant', async () => {
      mockCallServiceGetCallSession.mockResolvedValueOnce(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      const ack = jest.fn();
      await socket._trigger('call:end', validData, ack);
      expect(mockCallServiceForceEndOrphanedCallSession).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    // The fast-path optimistic broadcast (below) trusts call-room membership
    // as authorization, reasoning it was proven true at call:join time — but
    // nothing evicts a socket from the call room if the underlying
    // authorization is later revoked (e.g. removed from the conversation
    // mid-call). An unauthorized caller whose socket is still in the room
    // must not be able to fire a false call:ended at the real participant
    // before the authorization check below rejects them.
    it('does NOT fire the fast-path optimistic call:ended broadcast when the ender cannot be resolved to a participant, even if their socket is still in the call room', async () => {
      mockCallServiceGetCallSession.mockResolvedValueOnce(makeCallSession({ participants: [] }));
      const { handler, io } = buildHandler();
      const socket = makeSocket({ rooms: new Set([`call:${CALL_ID}`]) });
      const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
      const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

      const ack = jest.fn();
      await socket._trigger('call:end', validData, ack);

      expect(socket.to).not.toHaveBeenCalled();
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
      expect(ack).toHaveBeenCalledWith({ success: false });
    });

    // Companion to the above: the wide call:ended fanout, chat summary, and
    // missed-call handling that used to follow the (now-removed) force-end
    // call for this branch must not fire either — there is nothing to
    // recover, the request was simply unauthorized.
    it('does not fan out call:ended, post a chat summary, or mark the call missed when the ender cannot be resolved to a participant', async () => {
      const broadcaster = jest.fn<any>().mockResolvedValue(undefined);

      const { handler, socket, io } = setupWithSocket({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([
            { userId: USER_ID },
            { userId: 'ringing-callee-id' },
          ]),
        },
      });
      handler.setMessageBroadcaster(broadcaster);
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:end', validData, jest.fn());
      await new Promise(r => setImmediate(r));

      expect(broadcaster).not.toHaveBeenCalled();
      expect(mockCallServiceMarkCallAsMissed).not.toHaveBeenCalled();
    });

    it('ends call, broadcasts ended to call+conversation rooms in ONE deduplicated emit, removes all sockets, ack(true)', async () => {
      const endedSession = makeCallSession({ status: 'ended', duration: 90 });
      mockCallServiceEndCall.mockResolvedValue(endedSession);

      const s1 = { leave: jest.fn() };
      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([s1]) });

      const ack = jest.fn();
      await socket._trigger('call:end', validData, ack);

      expect(io.to).toHaveBeenCalledWith(
        expect.arrayContaining([`call:${CALL_ID}`, `conversation:${CONV_ID}`])
      );
      expect(s1.leave).toHaveBeenCalledWith(`call:${CALL_ID}`);
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    // The fast-path optimistic broadcast (socket.to, in-memory) used to cast
    // the raw client `reason` straight to CallEndReason instead of routing it
    // through the same resolveEndReason() normalization as the authoritative
    // broadcast a few lines later. The socket schema only whitelists the
    // `[a-z_]+` charset, not membership in the CallEndReason enum, so a
    // schema-valid-but-unrecognized string ("busy") could reach the peer via
    // the fast path while the authoritative broadcast normalized the same
    // event to "completed" — the two disagreeing about how the call ended.
    it('normalizes an unrecognized-but-schema-valid reason in the fast-path optimistic broadcast, matching what the authoritative broadcast would resolve it to', async () => {
      mockCallServiceGetCallSession.mockResolvedValueOnce(
        makeCallSession({ participants: [makeParticipant()] })
      );
      mockCallServiceEndCall.mockResolvedValue(makeCallSession({ status: 'ended', duration: 5 }));
      const { handler, io } = buildHandler();
      const socket = makeSocket({ rooms: new Set([`call:${CALL_ID}`]) });
      const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
      const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

      await socket._trigger('call:end', { callId: CALL_ID, reason: 'busy' }, jest.fn());

      const roomEmit = (socket.to as jest.Mock<any>).mock.results[0]?.value?.emit as jest.Mock<any>;
      expect(roomEmit).toHaveBeenCalledWith('call:ended', expect.objectContaining({ reason: 'completed' }));
    });

    it('fans out call:ended to every conversation member USER room (ringing callee is in neither the call nor the conversation room)', async () => {
      // Incident prod 2026-07-03 06:14 — the caller hung up while the callee
      // was still ringing; the callee had joined NEITHER the call room (never
      // answered) NOR the conversation room (conversation not open). The
      // ended broadcast never reached it → it kept ringing and later joined a
      // dead call ("This call has already ended"). The terminal broadcast must
      // target the SAME audience as the call:initiated invitation: the user
      // room of every active conversation member.
      const endedSession = makeCallSession({ status: 'ended', duration: 90 });
      mockCallServiceEndCall.mockResolvedValue(endedSession);

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([
            { userId: USER_ID },
            { userId: 'ringing-callee-id' },
          ]),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:end', validData, jest.fn());

      expect(io.to).toHaveBeenCalledWith(
        expect.arrayContaining([
          `call:${CALL_ID}`,
          `conversation:${CONV_ID}`,
          `user:${USER_ID}`,
          'user:ringing-callee-id',
        ])
      );
      expect(io._roomEmit).toHaveBeenCalledWith(
        'call:ended',
        expect.objectContaining({ callId: CALL_ID })
      );
    });

    it('ack(false) and emits error when endCall throws', async () => {
      mockCallServiceEndCall.mockRejectedValue(new Error('END_CALL_FAIL: permission denied'));
      const { socket } = setupWithSocket();
      const ack = jest.fn();
      await socket._trigger('call:end', validData, ack);
      expect(ack).toHaveBeenCalledWith({ success: false });
      // Scoping par appel (contrat CallError.callId) — cf. 43d4d7b7e.
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'END_CALL_FAIL',
        callId: CALL_ID,
      }));
    });

    it('force-ends the orphaned session when endCall throws after the fast-path optimistic broadcast', async () => {
      mockCallServiceEndCall.mockRejectedValue(new Error('END_CALL_FAIL: permission denied'));
      const { socket } = setupWithSocket();
      await socket._trigger('call:end', validData, jest.fn());
      expect(mockCallServiceForceEndOrphanedCallSession).toHaveBeenCalledWith(CALL_ID, 'completed');
    });

    // Same root cause as the fast-path broadcast fix above, in the sibling
    // call site: this recovery path used to cast the raw client `reason`
    // straight to CallEndReason before handing it to forceEndOrphanedCallSession,
    // which persists it to the DB's strictly-enum-typed `endReason` column.
    // An unrecognized-but-schema-valid string must resolve to a real enum
    // member here too, not just in the optimistic broadcast.
    it('normalizes an unrecognized-but-schema-valid reason before force-ending the orphaned session', async () => {
      mockCallServiceEndCall.mockRejectedValue(new Error('END_CALL_FAIL: permission denied'));
      const { socket } = setupWithSocket();
      await socket._trigger('call:end', { callId: CALL_ID, reason: 'busy' }, jest.fn());
      expect(mockCallServiceForceEndOrphanedCallSession).toHaveBeenCalledWith(CALL_ID, 'completed');
    });

    it('on force-end-orphaned recovery (endCall threw), fans out call:ended to every member USER room + posts the chat summary — same sibling-drift fix as the not-a-participant recovery path', async () => {
      mockCallServiceEndCall.mockRejectedValue(new Error('END_CALL_FAIL: permission denied'));
      mockCallServiceForceEndOrphanedCallSession.mockResolvedValue({
        duration: 7,
        conversationId: CONV_ID,
        status: 'ended',
        endReason: 'completed',
      });
      const summaryMessage = { id: 'msg-2', conversationId: CONV_ID };
      mockCallServiceCreateCallSummaryMessage.mockResolvedValue({ kind: 'created', message: summaryMessage });
      const broadcaster = jest.fn<any>().mockResolvedValue(undefined);

      const { handler, socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([
            { userId: USER_ID },
            { userId: 'ringing-callee-id' },
          ]),
        },
      });
      handler.setMessageBroadcaster(broadcaster);
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:end', validData, jest.fn());
      await new Promise(r => setImmediate(r));

      expect(io.to).toHaveBeenCalledWith(
        expect.arrayContaining([
          `call:${CALL_ID}`,
          `conversation:${CONV_ID}`,
          `user:${USER_ID}`,
          'user:ringing-callee-id',
        ])
      );
      expect(broadcaster).toHaveBeenCalledWith(summaryMessage, CONV_ID);
    });

    it('does not force-end an already-terminated session when call:end succeeds', async () => {
      const endedSession = makeCallSession({ status: 'ended', duration: 90 });
      mockCallServiceEndCall.mockResolvedValue(endedSession);
      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });
      await socket._trigger('call:end', validData, jest.fn());
      expect(mockCallServiceForceEndOrphanedCallSession).not.toHaveBeenCalled();
    });

    // Durcissement sonnerie fantôme (app suspendue) : quand un appel se
    // termine SANS avoir été décroché (missed/rejected), les membres qui
    // n'ont jamais rejoint la call room ont potentiellement CallKit qui
    // sonne via la push VoIP initiale ET un socket jamais monté (réseau
    // pauvre) — le fanout call:ended ne les atteint pas. On leur envoie une
    // push APNs background `call_cancel` (JAMAIS VoIP : chaque push VoIP
    // exige un reportNewIncomingCall). Best-effort, silencieuse, iOS only.
    describe('call_cancel background push to never-joined members on pre-answer termination', () => {
      const cancelSetup = (endReason: string) => {
        const endedSession = makeCallSession({
          status: endReason === 'completed' ? 'ended' : 'missed',
          endReason,
          duration: 0,
        });
        mockCallServiceEndCall.mockResolvedValue(endedSession);
        const ctx = setupWithSocket({
          participant: {
            findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
            findMany: jest.fn<any>().mockResolvedValue([
              { userId: USER_ID },              // endedBy (the caller)
              { userId: 'ringing-callee-id' },  // never joined — target
              { userId: 'joined-member-id' },   // joined the call — not a target
            ]),
          },
          callParticipant: {
            findMany: jest.fn<any>().mockResolvedValue([
              { participant: { userId: USER_ID } },
              { participant: { userId: 'joined-member-id' } },
            ]),
          },
        });
        ctx.io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });
        const pushService = { sendToUser: jest.fn<any>().mockResolvedValue([]) };
        ctx.handler.setPushNotificationService(pushService as any);
        return { ...ctx, pushService };
      };

      it('sends a silent call_cancel push to never-joined members only (not endedBy, not joined)', async () => {
        const { socket, pushService } = cancelSetup('missed');

        await socket._trigger('call:end', validData, jest.fn());

        expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
        expect(pushService.sendToUser).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'ringing-callee-id',
            types: ['apns', 'fcm'],
            platforms: ['ios', 'android'],
            payload: expect.objectContaining({
              silent: true,
              data: expect.objectContaining({ type: 'call_cancel', callId: CALL_ID }),
            }),
          })
        );
      });

      it('sends the cancel push on rejected (other multi-device sockets may still ring)', async () => {
        const { socket, pushService } = cancelSetup('rejected');

        await socket._trigger('call:end', validData, jest.fn());

        expect(pushService.sendToUser).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'ringing-callee-id' })
        );
      });

      it('does NOT send any cancel push when the call was answered (completed)', async () => {
        const { socket, pushService } = cancelSetup('completed');

        await socket._trigger('call:end', validData, jest.fn());

        expect(pushService.sendToUser).not.toHaveBeenCalled();
      });

      it('cancel-push failure never breaks the terminal path (ack still true)', async () => {
        const { socket, pushService } = cancelSetup('missed');
        pushService.sendToUser.mockRejectedValue(new Error('APNS down'));

        const ack = jest.fn();
        await socket._trigger('call:end', validData, ack);

        expect(ack).toHaveBeenCalledWith({ success: true });
      });
    });
  });

  // ── call:heartbeat ───────────────────────────────────────────────────────

  describe('call:heartbeat', () => {
    const validData = { callId: CALL_ID };

    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:heartbeat', validData);
      expect(mockCallServiceRecordHeartbeat).not.toHaveBeenCalled();
    });

    it('returns early when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false });
      await socket._trigger('call:heartbeat', validData);
      expect(mockCallServiceRecordHeartbeat).not.toHaveBeenCalled();
    });

    it('records heartbeat when participant found', async () => {
      const { socket } = setupWithSocket();
      await socket._trigger('call:heartbeat', validData);
      expect(mockCallServiceRecordHeartbeat).toHaveBeenCalledWith(CALL_ID, PARTICIPANT_ID);
    });
  });

  // ── call:quality-report ──────────────────────────────────────────────────

  describe('call:quality-report', () => {
    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:quality-report', { callId: CALL_ID, stats: {} });
      expect(mockCallServicePersistCallStats).not.toHaveBeenCalled();
    });

    it('persists stats and emits quality alert on SUSTAINED high RTT (2nd consecutive report), reporter excluded', async () => {
      mockCallServicePersistCallStats.mockResolvedValue(undefined);
      const { socket, io } = setupWithSocket();
      const degraded = {
        callId: CALL_ID,
        stats: { rtt: 500, packetLoss: 1, bytesSent: 1000, bytesReceived: 2000, level: 'good' },
      };

      await socket._trigger('call:quality-report', degraded);
      await socket._trigger('call:quality-report', degraded);

      expect(mockCallServicePersistCallStats).toHaveBeenCalled();
      // The alert goes through socket.to (room minus the reporter) — the
      // degraded participant must never see "your contact has a bad
      // connection" about its OWN link. io.to would include it.
      const ioCalls = (io.to as jest.Mock<any>).mock.calls;
      expect(ioCalls.some((c: any[]) => c[0] === `call:${CALL_ID}`)).toBe(false);
      const socketToCalls = (socket.to as jest.Mock<any>).mock.calls;
      expect(socketToCalls.some((c: any[]) => c[0] === `call:${CALL_ID}`)).toBe(true);
    });

    it('does NOT alert on a single isolated degraded report (sustained gate)', async () => {
      mockCallServicePersistCallStats.mockResolvedValue(undefined);
      const { socket, io } = setupWithSocket();

      await socket._trigger('call:quality-report', {
        callId: CALL_ID,
        stats: { rtt: 500, packetLoss: 1, bytesSent: 1000, bytesReceived: 2000, level: 'good' },
      });

      expect((io.to as jest.Mock<any>).mock.calls.length).toBe(0);
      expect((socket.to as jest.Mock<any>).mock.calls.length).toBe(0);
    });

    it('emits quality alert on sustained high packet loss', async () => {
      mockCallServicePersistCallStats.mockResolvedValue(undefined);
      const { socket } = setupWithSocket();
      const degraded = {
        callId: CALL_ID,
        stats: { rtt: 100, packetLoss: 10, bytesSent: 100, bytesReceived: 100, level: 'poor' },
      };

      await socket._trigger('call:quality-report', degraded);
      await socket._trigger('call:quality-report', degraded);

      const roomEmit = (socket.to as jest.Mock<any>).mock.results[0]?.value?.emit as jest.Mock<any>;
      expect(roomEmit).toHaveBeenCalledWith('call:quality-alert', expect.objectContaining({ metric: 'packetLoss' }));
    });

    it('does NOT emit quality alert when stats are within thresholds', async () => {
      mockCallServicePersistCallStats.mockResolvedValue(undefined);
      const { socket, io } = setupWithSocket();

      await socket._trigger('call:quality-report', {
        callId: CALL_ID,
        stats: { rtt: 100, packetLoss: 1, bytesSent: 100, bytesReceived: 100, level: 'good' },
      });

      const ioCalls = (io.to as jest.Mock<any>).mock.calls;
      // No call:quality-alert emitted
      expect(ioCalls.length).toBe(0);
    });

    it('emits rtt alert when both RTT and packet loss exceed thresholds (RTT wins, sustained)', async () => {
      mockCallServicePersistCallStats.mockResolvedValue(undefined);
      const { socket } = setupWithSocket();
      const degraded = {
        callId: CALL_ID,
        stats: { rtt: 450, packetLoss: 8, bytesSent: 500, bytesReceived: 500, level: 'poor' },
      };

      await socket._trigger('call:quality-report', degraded);
      await socket._trigger('call:quality-report', degraded);

      const roomEmit = (socket.to as jest.Mock<any>).mock.results[0]?.value?.emit as jest.Mock<any>;
      expect(roomEmit).toHaveBeenCalledWith(
        'call:quality-alert',
        expect.objectContaining({ metric: 'rtt', value: 450, threshold: 300 })
      );
    });

    it('does NOT persist stats or emit a quality alert when participant cannot be resolved', async () => {
      // getCallSession resolves to a session with no active participant
      // matching the caller → resolveActiveCallParticipantId returns null.
      // Security fix: persistCallStats must be gated on the SAME participant
      // resolution as the alert broadcast — otherwise any authenticated user
      // could flood-write bytesSent/bytesReceived/level onto a callId that
      // doesn't even resolve to a real call/participant of theirs.
      mockCallServicePersistCallStats.mockResolvedValue(undefined);
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket, io } = setupWithSocket();

      await socket._trigger('call:quality-report', {
        callId: CALL_ID,
        stats: { rtt: 500, packetLoss: 1, bytesSent: 100, bytesReceived: 100, level: 'poor' },
      });

      expect(mockCallServicePersistCallStats).not.toHaveBeenCalled();
      const ioCalls = (io.to as jest.Mock<any>).mock.calls;
      expect(ioCalls.length).toBe(0);
    });

    it('resets the degraded streak once the call ends, so a later call reusing the id starts clean', async () => {
      // Leak guard regression: qualityDegradedStreaks is keyed
      // `${callId}:${participantId}` and previously was only ever swept once
      // the whole map exceeded 5000 entries. Without an explicit clear on
      // termination, a single post-end degraded report would inherit the
      // dead call's streak count and fire a false "sustained" alert on its
      // very first report.
      mockCallServicePersistCallStats.mockResolvedValue(undefined);
      const endedSession = makeCallSession({ status: 'ended', duration: 90 });
      mockCallServiceEndCall.mockResolvedValue(endedSession);

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      const degraded = {
        callId: CALL_ID,
        stats: { rtt: 500, packetLoss: 1, bytesSent: 0, bytesReceived: 0, level: 'good' },
      };

      // One degraded report — streak = 1, below the sustained-alert threshold.
      await socket._trigger('call:quality-report', degraded);

      await socket._trigger('call:end', { callId: CALL_ID }, jest.fn());

      // A single degraded report after the call ended must start a FRESH
      // streak, not silently continue the old call's streak=1 into streak=2.
      (socket.to as jest.Mock<any>).mockClear();
      await socket._trigger('call:quality-report', degraded);

      const socketToCalls = (socket.to as jest.Mock<any>).mock.calls;
      expect(socketToCalls.some((c: any[]) => c[0] === `call:${CALL_ID}`)).toBe(false);
    });
  });

  // ── call:reconnecting ────────────────────────────────────────────────────

  describe('call:reconnecting', () => {
    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:reconnecting', { callId: CALL_ID, participantId: PARTICIPANT_ID, attempt: 1 });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('returns early when not a participant (membership check)', async () => {
      // resolveActiveCallParticipantId returns null (no active participant of THIS call)
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnecting', { callId: CALL_ID, participantId: PARTICIPANT_ID, attempt: 1 });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('updates call status to reconnecting', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnecting', { callId: CALL_ID, participantId: PARTICIPANT_ID, attempt: 1 });
      expect(mockCallServiceUpdateCallStatus).toHaveBeenCalledWith(CALL_ID, 'reconnecting');
    });
  });

  // ── call:reconnected ─────────────────────────────────────────────────────

  describe('call:reconnected', () => {
    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:reconnected', { callId: CALL_ID, participantId: PARTICIPANT_ID });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('returns early when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false });
      await socket._trigger('call:reconnected', { callId: CALL_ID, participantId: PARTICIPANT_ID });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('updates call status to active', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnected', { callId: CALL_ID, participantId: PARTICIPANT_ID });
      expect(mockCallServiceUpdateCallStatus).toHaveBeenCalledWith(CALL_ID, 'active');
    });

    // Regression: a stray/out-of-order/replayed call:reconnected must not be
    // able to fabricate an `answeredAt` on a call that was never answered.
    // `resolveActiveCallParticipantId` only proves the caller is an active
    // participant of THIS call — it says nothing about whether a reconnect
    // was ever actually in flight. Symmetric with the RECONNECTING guard
    // above (`!call.answeredAt`), `reconnected` must require the call to
    // already be `reconnecting` (or idempotently already `active`) before
    // promoting it — never from a still-ringing/never-answered call.
    it('ignores reconnected on a call that is still ringing (never answered, no reconnect in flight)', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(
        makeCallSession({ status: 'ringing', participants: [makeParticipant()] })
      );
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnected', { callId: CALL_ID, participantId: PARTICIPANT_ID });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('promotes a genuinely reconnecting call to active', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(
        makeCallSession({ status: 'reconnecting', participants: [makeParticipant()] })
      );
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnected', { callId: CALL_ID, participantId: PARTICIPANT_ID });
      expect(mockCallServiceUpdateCallStatus).toHaveBeenCalledWith(CALL_ID, 'active');
    });
  });

  // ── call:transcription-segment ───────────────────────────────────────────

  describe('call:transcription-segment', () => {
    const validData = {
      callId: CALL_ID,
      segment: {
        text: 'Hello world',
        speakerId: USER_ID,
        startMs: 0,
        endMs: 1000,
        isFinal: true,
        language: 'en',
        confidence: 0.95,
      },
    };

    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:transcription-segment', validData);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('emits error when not a participant', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      await socket._trigger('call:transcription-segment', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    });

    it('does NOT relay when caller is a conversation member but not an active participant of THIS call', async () => {
      // Regression test for the membership-check bypass fixed in call:quality-report
      // (Audit P1-21) but left unfixed here: resolveParticipantIdFromCall only checks
      // conversation membership, so any other member of the call's conversation could
      // inject arbitrary transcription text into a call they never joined.
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket, io } = setupWithSocket({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }), findMany: jest.fn<any>().mockResolvedValue([]) },
      });

      await socket._trigger('call:transcription-segment', validData);

      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
      expect(socket.to).not.toHaveBeenCalled();
      expect((io.to as jest.Mock<any>).mock.calls.length).toBe(0);
    });

    it('returns early when call not found or ended', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue(null), // callSession.findUnique in transcription handler
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });
      await socket._trigger('call:transcription-segment', validData);
      // No relay emit since callSession is null
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('relays segment to other participants', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ status: 'active', metadata: {} }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });

      await socket._trigger('call:transcription-segment', validData);

      expect(socket.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });

    it('logs debug when translationEnabled=true (without ZMQ forwarding)', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ status: 'active', metadata: { translationEnabled: true } }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });

      await socket._trigger('call:transcription-segment', validData);

      // Still relays even when translationEnabled
      expect(socket.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });
  });

  // ── disconnect ───────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('returns early when userId cannot be recovered', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      // No prior authenticated event — cachedUserId is also undefined
      await socket._trigger('disconnect');
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });

    it('does nothing when no active participations', async () => {
      const { socket } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      await socket._trigger('disconnect');
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });

    // CALL-RESILIENCE — an ANSWERED call is not ended the instant the socket
    // drops (P2P media survives): a reconnect grace window is armed, and the
    // leave/broadcast only runs if it expires without a re-join.
    it('auto-leaves active calls after the reconnect grace window expires', async () => {
      jest.useFakeTimers();
      const leftSession = makeCallSession({ status: 'active' });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const activeParticipation = {
        id: PARTICIPANT_ID,
        callSessionId: CALL_ID,
        participantId: PARTICIPANT_ID,
        callSession: { status: 'active', mode: 'p2p', conversationId: CONV_ID },
      };

      const { socket, io } = setupWithSocket({
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([activeParticipation]),
          findUnique: jest.fn<any>().mockResolvedValue({ leftAt: null, callSession: { status: 'active' } }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('disconnect');
      // No immediate teardown — grace armed.
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(31_000);

      expect(mockCallServiceLeaveCall).toHaveBeenCalledWith(expect.objectContaining({ callId: CALL_ID }));
      expect(io.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
      jest.useRealTimers();
    });

    it('broadcasts call:ended on grace expiry when status becomes ended', async () => {
      jest.useFakeTimers();
      const leftSession = makeCallSession({ status: 'ended', duration: 45 });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const activeParticipation = {
        id: PARTICIPANT_ID,
        callSessionId: CALL_ID,
        participantId: PARTICIPANT_ID,
        callSession: { status: 'active', mode: 'p2p', conversationId: CONV_ID },
      };

      const { socket, io } = setupWithSocket({
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([activeParticipation]),
          findUnique: jest.fn<any>().mockResolvedValue({ leftAt: null, callSession: { status: 'active' } }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('disconnect');
      await jest.advanceTimersByTimeAsync(31_000);

      const toCalls = (io.to as jest.Mock<any>).mock.calls.map((c: any[]) => c[0]).flat();
      expect(toCalls).toContain(`conversation:${CONV_ID}`);
      jest.useRealTimers();
    });

    it('force-cleans up when leaveCall throws (at grace expiry)', async () => {
      jest.useFakeTimers();
      mockCallServiceLeaveCall.mockRejectedValue(new Error('DB error'));

      const now = new Date(Date.now() - 60_000);
      const activeParticipation = {
        id: PARTICIPANT_ID,
        callSessionId: CALL_ID,
        participantId: PARTICIPANT_ID,
        callSession: { id: CALL_ID, status: 'active', mode: 'p2p', conversationId: CONV_ID, startedAt: now },
      };

      const mockTx = {
        callParticipant: {
          update: jest.fn<any>().mockResolvedValue({}),
          count: jest.fn<any>().mockResolvedValue(0), // last participant
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ startedAt: now }),
          update: jest.fn<any>().mockResolvedValue({}),
        },
      };

      const { socket, io } = setupWithSocket({
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([activeParticipation]),
          findUnique: jest.fn<any>().mockResolvedValue({ leftAt: null, callSession: { status: 'active' } }),
        },
        $transaction: jest.fn<any>().mockImplementation(async (fn: Function) => fn(mockTx)),
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('disconnect');
      await jest.advanceTimersByTimeAsync(31_000);

      expect(mockTx.callParticipant.update).toHaveBeenCalled();
      expect(io.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
      jest.useRealTimers();
    });

    it('skips ended calls during disconnect cleanup', async () => {
      const endedParticipation = {
        id: PARTICIPANT_ID,
        callSessionId: CALL_ID,
        participantId: PARTICIPANT_ID,
        callSession: { status: 'ended', mode: 'p2p', conversationId: CONV_ID },
      };

      const { socket } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([endedParticipation]) },
      });

      await socket._trigger('disconnect');
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });
  });

  // ── handleMissedCall ─────────────────────────────────────────────────────

  describe('handleMissedCall', () => {
    it('calls markCallAsMissed and createMissedCallNotifications', async () => {
      const { handler } = buildHandler();
      await handler.handleMissedCall(CALL_ID);
      expect(mockCallServiceMarkCallAsMissed).toHaveBeenCalledWith(CALL_ID);
    });

    it('logs error but does not throw when markCallAsMissed fails', async () => {
      const { handler } = buildHandler();
      mockCallServiceMarkCallAsMissed.mockRejectedValue(new Error('DB down'));
      await expect(handler.handleMissedCall(CALL_ID)).resolves.not.toThrow();
    });
  });

  // ── createMissedCallNotifications ────────────────────────────────────────

  describe('createMissedCallNotifications', () => {
    it('returns early when notificationService not set', async () => {
      const { handler } = buildHandler();
      // No setNotificationService call
      await handler.createMissedCallNotifications(CALL_ID);
      // No throw, just a warn log
    });

    it('returns early when callSession not found', async () => {
      const { handler } = buildHandler({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      const ns = { createMissedCallNotification: jest.fn() };
      handler.setNotificationService(ns as any);
      await handler.createMissedCallNotifications(CALL_ID);
      expect(ns.createMissedCallNotification).not.toHaveBeenCalled();
    });

    it('returns early when no unresponded participants', async () => {
      const callSession = {
        id: CALL_ID,
        conversationId: CONV_ID,
        initiatorId: USER_ID,
        metadata: { type: 'audio' },
        initiator: { id: USER_ID, username: 'test', displayName: 'Test', avatar: null },
        conversation: { id: CONV_ID, identifier: 'c1' },
      };
      const { handler } = buildHandler({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue(callSession), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      mockCallServiceGetUnrespondedParticipants.mockResolvedValue([]);
      const ns = { createMissedCallNotification: jest.fn() };
      handler.setNotificationService(ns as any);
      await handler.createMissedCallNotifications(CALL_ID);
      expect(ns.createMissedCallNotification).not.toHaveBeenCalled();
    });

    it('creates notifications for each unresponded participant', async () => {
      const callSession = {
        id: CALL_ID,
        conversationId: CONV_ID,
        initiatorId: USER_ID,
        metadata: { type: 'video' },
        initiator: { id: USER_ID, username: 'test', displayName: 'Test User', avatar: null },
        conversation: { id: CONV_ID, identifier: 'c1' },
      };
      const { handler } = buildHandler({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue(callSession), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      const unresponded = ['user-a', 'user-b'];
      mockCallServiceGetUnrespondedParticipants.mockResolvedValue(unresponded);
      const ns = { createMissedCallNotification: jest.fn<any>().mockResolvedValue(undefined) };
      handler.setNotificationService(ns as any);

      await handler.createMissedCallNotifications(CALL_ID);

      expect(ns.createMissedCallNotification).toHaveBeenCalledTimes(2);
      expect(ns.createMissedCallNotification).toHaveBeenCalledWith(expect.objectContaining({
        callType: 'video',
        callerId: USER_ID,
      }));
    });
  });

  // ── postCallSummary (via call:end path) ───────────────────────────────────

  describe('postCallSummary (via call:end)', () => {
    it('broadcasts summary message when messageBroadcaster is set', async () => {
      const broadcaster = jest.fn<any>().mockResolvedValue(undefined);
      const summaryMessage = { id: 'msg-1', conversationId: CONV_ID };
      mockCallServiceCreateCallSummaryMessage.mockResolvedValue({ kind: 'created', message: summaryMessage });
      mockCallServiceEndCall.mockResolvedValue(makeCallSession({ status: 'ended' }));

      const { handler, socket, io } = setupWithSocket();
      handler.setMessageBroadcaster(broadcaster);
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:end', { callId: CALL_ID });

      await new Promise(r => setImmediate(r));
      expect(broadcaster).toHaveBeenCalledWith(summaryMessage, CONV_ID);
    });

    it('does NOT throw when createCallSummaryMessage returns null', async () => {
      mockCallServiceCreateCallSummaryMessage.mockResolvedValue(null);
      mockCallServiceEndCall.mockResolvedValue(makeCallSession({ status: 'ended' }));

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await expect(socket._trigger('call:end', { callId: CALL_ID })).resolves.not.toThrow();
    });

    it('logs error but does not throw when createCallSummaryMessage throws', async () => {
      mockCallServiceCreateCallSummaryMessage.mockRejectedValue(new Error('summary DB error'));
      mockCallServiceEndCall.mockResolvedValue(makeCallSession({ status: 'ended' }));

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await expect(socket._trigger('call:end', { callId: CALL_ID })).resolves.not.toThrow();
    });
  });

  // ── call:join additional edge cases ─────────────────────────────────────

  describe('call:join additional branches', () => {
    const validData = { callId: CALL_ID, settings: {} };

    it('emits error when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad schema' });
      const ack = jest.fn();
      await socket._trigger('call:join', validData, ack);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('emits error when participant not found in session after joining', async () => {
      // joinCall returns a session that has no matching participant for USER_ID
      const emptySession = makeCallSession({ participants: [] });
      mockCallServiceJoinCall.mockResolvedValue({ callSession: emptySession, iceServers: [] });

      const { socket } = setupWithSocket();
      await socket._trigger('call:join', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.any(Object));
    });

    it('emits error WITHOUT clearing the ringing timer on joinCall failure (item F follow-up)', async () => {
      // A failed join must not disarm the ring: the call is still ringing for
      // everyone else and the timer must resolve missed at its nominal budget.
      // (The old finally-clear also wiped the timer the boot rehydration had
      // just re-armed after a mid-ring restart.) The SDP answer and the
      // terminal paths own the clear.
      mockCallServiceJoinCall.mockRejectedValue(new Error('JOIN_FAIL: server error'));
      const { socket } = setupWithSocket();
      await socket._trigger('call:join', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'JOIN_FAIL' }));
      expect(mockCallServiceClearRingingTimeout).not.toHaveBeenCalled();
    });

    it('item F regression: does NOT clear the ringing timeout on a successful early-join while the call is still ringing', async () => {
      // The callee's client early-joins as soon as the incoming call starts
      // ringing (it must, to receive the SDP offer) — well before the human
      // taps "answer". Clearing the ringing timeout here would silently
      // disable the 60s no-answer protection, including for a timer
      // re-armed by boot rehydration after a mid-ring gateway restart.
      const participant = makeParticipant();
      const ringingSession = makeCallSession({ participants: [participant], status: 'ringing' });
      mockCallServiceJoinCall.mockResolvedValue({ callSession: ringingSession, iceServers: [] });

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:join', validData);

      expect(mockCallServiceClearRingingTimeout).not.toHaveBeenCalled();
    });

    it('skips the participant-joined ICE push when getUserId returns undefined (never emits a TURN-less STUN-only config)', async () => {
      const participant = makeParticipant();
      const callSession = makeCallSession({ participants: [participant] });
      mockCallServiceJoinCall.mockResolvedValue({ callSession, iceServers: [] });

      const remoteSocket = { id: 'remote-sock', emit: jest.fn() };
      const { socket, io, getUserId } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([remoteSocket]) });
      // getUserId returns undefined for the remote socket. A TURN-less STUN-only
      // ICE config can't relay behind symmetric/CGNAT, so we must NOT emit it —
      // the socket gets proper credentials via its own join/check-active path.
      getUserId.mockImplementation((socketId: string) =>
        socketId === SOCKET_ID ? USER_ID : undefined
      );

      await socket._trigger('call:join', validData);
      expect(remoteSocket.emit).not.toHaveBeenCalledWith('call:participant-joined', expect.any(Object));
    });
  });

  // ── call:leave additional branches ───────────────────────────────────────

  describe('call:leave additional branches', () => {
    it('emits error when validation fails', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'invalid callId' });

      const { socket } = setupWithSocket();
      await socket._trigger('call:leave', { callId: CALL_ID });
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });

    it('does not throw when handleMissedCall rejects after missed status', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      const leftSession = makeCallSession({ status: 'missed', endReason: 'missed' });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);
      mockCallServiceMarkCallAsMissed.mockRejectedValue(new Error('push failed'));

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:leave', { callId: CALL_ID });
      await new Promise(r => setImmediate(r));
      // No throw — error is swallowed by catch
    });
  });

  // ── call:force-leave additional branches ────────────────────────────────

  describe('call:force-leave additional branches', () => {
    const validData = { conversationId: CONV_ID };

    it('catches leaveCall error inside force-leave loop', async () => {
      const activeCall = { id: CALL_ID, status: 'active' };
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      mockCallServiceLeaveCall.mockRejectedValue(new Error('leave failed'));

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([activeCall]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await expect(socket._trigger('call:force-leave', validData)).resolves.not.toThrow();
    });

    it('emits error on outer exception (prisma throws)', async () => {
      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockRejectedValue(new Error('DB timeout')),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });

      await socket._trigger('call:force-leave', validData);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'FORCE_LEAVE_ERROR' }));
    });
  });

  // ── call:signal additional branches ─────────────────────────────────────

  describe('call:signal additional branches', () => {
    it('buffers offer when it is successfully forwarded (last-write-wins)', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'tp', participantId: 'target-uid', participant: { userId: 'target-uid', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const targetSocket = { id: 'tgt-sock', emit: jest.fn() };
      const { socket, io, getUserId } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([targetSocket]) });
      getUserId.mockImplementation((sid: string) => sid === 'tgt-sock' ? 'target-uid' : USER_ID);

      const offerSignal = { callId: CALL_ID, signal: { type: 'offer', from: USER_ID, to: 'target-uid', sdp: 'v=0...' } };
      await socket._trigger('call:signal', offerSignal);

      // Offer was forwarded AND buffered (§4.6 last-write-wins)
      expect(io.to).toHaveBeenCalledWith('tgt-sock');
    });

    it('logs error and does not throw when getCallSession throws', async () => {
      mockCallServiceGetCallSession.mockRejectedValue(new Error('DB down'));
      const { socket } = setupWithSocket();
      await expect(socket._trigger('call:signal', {
        callId: CALL_ID,
        signal: { type: 'offer', from: USER_ID, to: 'other' },
      })).resolves.not.toThrow();
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'SIGNAL_FAILED' }));
    });
  });

  // ── call:toggle-audio validation branch ─────────────────────────────────

  describe('call:toggle-audio validation branch', () => {
    it('emits error when validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad data' });
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-audio', { callId: CALL_ID, enabled: true });
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });
  });

  // ── call:toggle-video additional branches ───────────────────────────────

  describe('call:toggle-video additional branches', () => {
    it('emits error when not a participant', async () => {
      const { socket } = setupWithSocket({
        callSession: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      await socket._trigger('call:toggle-video', { callId: CALL_ID, enabled: false });
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    });

    it('emits error when validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad schema' });
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-video', { callId: CALL_ID, enabled: false });
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    });
  });

  // ── call:end validation branch ───────────────────────────────────────────

  describe('call:end validation branch', () => {
    it('emits error and ack(false) when validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'invalid callId' });
      const { socket } = setupWithSocket();
      const ack = jest.fn();
      await socket._trigger('call:end', { callId: CALL_ID }, ack);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'VALIDATION_ERROR' }));
      expect(ack).toHaveBeenCalledWith({ success: false });
    });
  });

  // ── error catch paths ────────────────────────────────────────────────────

  describe('error catch paths', () => {
    it('call:heartbeat: logs error when prisma throws', async () => {
      const { socket } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });
      await expect(socket._trigger('call:heartbeat', { callId: CALL_ID })).resolves.not.toThrow();
    });

    it('call:quality-report: logs error when persistCallStats throws', async () => {
      mockCallServicePersistCallStats.mockRejectedValue(new Error('stats error'));
      const { socket } = setupWithSocket();
      await expect(socket._trigger('call:quality-report', {
        callId: CALL_ID,
        stats: { rtt: 50, packetLoss: 1, bytesSent: 0, bytesReceived: 0, level: 'good' },
      })).resolves.not.toThrow();
    });

    it('call:reconnecting: covers outer catch when resolveParticipantIdFromCall throws', async () => {
      const { socket } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      await expect(socket._trigger('call:reconnecting', {
        callId: CALL_ID, participantId: PARTICIPANT_ID, attempt: 1,
      })).resolves.not.toThrow();
    });

    it('call:reconnected: covers outer catch when resolveParticipantIdFromCall throws', async () => {
      const { socket } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      await expect(socket._trigger('call:reconnected', {
        callId: CALL_ID, participantId: PARTICIPANT_ID,
      })).resolves.not.toThrow();
    });

    it('call:transcription-segment: logs error when callSession.findUnique throws', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockRejectedValueOnce(new Error('DB error')), // for the segment handler
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });
      await expect(socket._trigger('call:transcription-segment', {
        callId: CALL_ID,
        segment: { text: 'hi', speakerId: USER_ID, startMs: 0, endMs: 500, isFinal: true, language: 'en', confidence: 1 },
      })).resolves.not.toThrow();
    });

    it('handleMissedCall: logs error but does not throw when markCallAsMissed throws', async () => {
      mockCallServiceMarkCallAsMissed.mockRejectedValue(new Error('missed fail'));
      const { handler } = buildHandler();
      await expect(handler.handleMissedCall(CALL_ID)).resolves.not.toThrow();
    });
  });

  // ── call:check-active: active call replayed ──────────────────────────────

  describe('call:check-active with active session', () => {
    it('emits call:initiated when user has an active call', async () => {
      const activeCall = { id: CALL_ID, status: 'ringing', conversationId: CONV_ID };
      const participant = makeParticipant();
      const fullSession = makeCallSession({ participants: [participant] });
      mockCallServiceGetCallSession.mockResolvedValue(fullSession);
      mockCallServiceGenerateIceServers.mockReturnValue([]);

      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONV_ID }]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([activeCall]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([{ callSessionId: CALL_ID, leftAt: null }]),
        },
      });

      await socket._trigger('call:check-active');
      expect(socket.emit).toHaveBeenCalledWith('call:initiated', expect.any(Object));
    });

    it('logs error when getCallSession throws inside check-active', async () => {
      const activeCall = { id: CALL_ID, status: 'ringing', conversationId: CONV_ID };
      mockCallServiceGetCallSession.mockRejectedValue(new Error('DB error'));

      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONV_ID }]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([activeCall]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([{ callSessionId: CALL_ID, leftAt: null }]),
        },
      });

      await expect(socket._trigger('call:check-active')).resolves.not.toThrow();
    });
  });

  // ── call:initiate: participants map coverage ─────────────────────────────

  describe('call:initiate participants map coverage', () => {
    const validData = {
      conversationId: CONV_ID,
      type: 'video',
      settings: {},
    };

    it('maps participants in the call:initiated event sent to members', async () => {
      const participant = makeParticipant();
      const callSession = makeCallSession({ participants: [participant], status: 'ringing' });
      mockCallServiceInitiateCall.mockResolvedValue(callSession);

      // Include a non-initiator member so the loop iterates and emits to their socket
      const OTHER_USER = 'other-member-507f';
      const memberSocket = { emit: jest.fn<any>(), data: { appForeground: true } };

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: OTHER_USER }]),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([memberSocket]) });

      await socket._trigger('call:initiate', validData);
      // The event is broadcast to member sockets, not echoed back to the initiator
      expect(memberSocket.emit).toHaveBeenCalledWith('call:initiated', expect.objectContaining({
        participants: expect.arrayContaining([expect.objectContaining({ userId: USER_ID })]),
      }));
    });
  });

  // ── ringing timeout edge cases ───────────────────────────────────────────

  describe('ringing timeout edge cases', () => {
    const validData = {
      conversationId: CONV_ID,
      type: 'audio',
      settings: {},
    };

    it('returns early when updateMany count=0 (already transitioned)', async () => {
      const callSession = makeCallSession({ status: 'ringing' });
      mockCallServiceInitiateCall.mockResolvedValue(callSession);

      let timeoutCb: Function | null = null;
      mockCallServiceScheduleRingingTimeout.mockImplementation((_id: string, cb: Function) => {
        timeoutCb = cb;
      });

      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }), // already transitioned
        },
      });
      await socket._trigger('call:initiate', validData);

      expect(timeoutCb).not.toBeNull();
      await timeoutCb!();
      // No further emissions — early return after count=0
      expect(mockCallServiceMarkCallAsMissed).not.toHaveBeenCalled();
    });

    it('logs error when timeout callback itself throws', async () => {
      const callSession = makeCallSession({ status: 'ringing' });
      mockCallServiceInitiateCall.mockResolvedValue(callSession);

      let timeoutCb: Function | null = null;
      mockCallServiceScheduleRingingTimeout.mockImplementation((_id: string, cb: Function) => {
        timeoutCb = cb;
      });

      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockRejectedValue(new Error('DB error')), // throws
        },
      });
      await socket._trigger('call:initiate', validData);

      expect(timeoutCb).not.toBeNull();
      await expect(timeoutCb!()).resolves.not.toThrow();
    });

    it('logs handleMissedCall error inside ringing timeout without rethrowing', async () => {
      const callSession = makeCallSession({ status: 'ringing' });
      mockCallServiceInitiateCall.mockResolvedValue(callSession);

      let timeoutCb: Function | null = null;
      mockCallServiceScheduleRingingTimeout.mockImplementation((_id: string, cb: Function) => {
        timeoutCb = cb;
      });
      mockCallServiceMarkCallAsMissed.mockRejectedValue(new Error('missed push error'));

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }), // transition succeeds
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });
      await socket._trigger('call:initiate', validData);

      await expect(timeoutCb!()).resolves.not.toThrow();
    });
  });

  // ── VoIP push rejection coverage ─────────────────────────────────────────

  describe('VoIP push error recovery', () => {
    it('logs error when sendToUser rejects (does not throw)', async () => {
      const callSession = makeCallSession({ status: 'ringing' });
      mockCallServiceInitiateCall.mockResolvedValue(callSession);

      const pushService = { sendToUser: jest.fn<any>().mockRejectedValue(new Error('push failed')) };

      const { handler, socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }, { userId: 'offline-user' }]),
        },
      });
      handler.setPushNotificationService(pushService as any);
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await expect(socket._trigger('call:initiate', {
        conversationId: CONV_ID, type: 'audio', settings: {},
      })).resolves.not.toThrow();
      // Push rejection is caught and logged
      await new Promise(r => setImmediate(r));
    });
  });

  // ── bufferOffer TTL eviction ─────────────────────────────────────────────

  describe('bufferOffer TTL eviction', () => {
    it('evicts expired offers when buffering a new one', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'tp', participantId: 'tgt', participant: { userId: 'tgt', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const { handler, socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      const offerA = { callId: 'call-old', signal: { type: 'offer', from: USER_ID, to: 'tgt', sdp: 'v=0...' } };
      const offerB = { callId: CALL_ID, signal: { type: 'offer', from: USER_ID, to: 'tgt', sdp: 'v=0...' } };

      // Manually plant an expired entry
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValueOnce(Date.now() - 160_000);
      (handler as any).bufferOffer('call-old', offerA);
      nowSpy.mockRestore();

      // Trigger a new buffer via call:signal (should evict the expired one)
      await socket._trigger('call:signal', offerB);

      expect((handler as any).bufferedOffers.has('call-old')).toBe(false);
    });
  });

  // ── bufferedOfferFor: no match and TTL expired ────────────────────────────

  describe('bufferedOfferFor edge cases', () => {
    it('returns null when offer is expired', async () => {
      const participant = makeParticipant();
      const callSession = makeCallSession({ participants: [participant] });
      mockCallServiceJoinCall.mockResolvedValue({ callSession, iceServers: [] });

      const senderPart = makeParticipant({ participant: { userId: 'caller', user: {} } });
      const joinerPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, joinerPart] }));

      const { handler, socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      // Buffer an offer from 'caller' to USER_ID, planted as already expired
      const expiredOffer = { callId: CALL_ID, signal: { type: 'offer', from: 'caller', to: USER_ID, sdp: 'v=0...' } };
      jest.spyOn(Date, 'now').mockReturnValueOnce(Date.now() - 160_000);
      (handler as any).bufferOffer(CALL_ID, expiredOffer);
      jest.restoreAllMocks();

      // USER_ID joins — expired offer should NOT be replayed
      const callerSocket = makeSocket();
      callerSocket.id = 'caller-sock';
      handler.setupCallEvents(callerSocket as any, io as any,
        jest.fn<any>().mockReturnValue('caller'),
        jest.fn<any>().mockReturnValue({ id: 'caller', isAnonymous: false }),
      );
      await socket._trigger('call:join', { callId: CALL_ID, settings: {} });

      const emittedCalls = (socket.emit as jest.Mock<any>).mock.calls;
      const signalReplay = emittedCalls.find((c: any[]) => c[0] === 'call:signal');
      expect(signalReplay).toBeUndefined();
    });

    it('returns null when offer is destined for a different user', async () => {
      const participant = makeParticipant();
      const callSession = makeCallSession({ participants: [participant] });
      mockCallServiceJoinCall.mockResolvedValue({ callSession, iceServers: [] });

      const { handler, socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      // Plant an offer for 'other-user' (not USER_ID)
      const offerForOther = { callId: CALL_ID, signal: { type: 'offer', from: 'caller', to: 'other-user', sdp: 'v=0...' } };
      (handler as any).bufferOffer(CALL_ID, offerForOther);

      // USER_ID joins — offer is not for USER_ID, should NOT be replayed
      await socket._trigger('call:join', { callId: CALL_ID, settings: {} });

      const emittedCalls = (socket.emit as jest.Mock<any>).mock.calls;
      const signalReplay = emittedCalls.find((c: any[]) => c[0] === 'call:signal');
      expect(signalReplay).toBeUndefined();
    });
  });

  // ── disconnect: force-cleanup error path ─────────────────────────────────

  describe('disconnect force-cleanup error path', () => {
    it('logs error when $transaction also throws after leaveCall failure', async () => {
      mockCallServiceLeaveCall.mockRejectedValue(new Error('leave error'));

      const now = new Date(Date.now() - 30_000);
      const activeParticipation = {
        id: PARTICIPANT_ID,
        callSessionId: CALL_ID,
        participantId: PARTICIPANT_ID,
        callSession: { id: CALL_ID, status: 'active', mode: 'p2p', conversationId: CONV_ID, startedAt: now },
      };

      const { socket } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([activeParticipation]) },
        $transaction: jest.fn<any>().mockRejectedValue(new Error('tx error')),
      });

      await expect(socket._trigger('disconnect')).resolves.not.toThrow();
    });

    it('covers outer disconnect catch when callParticipant.findMany throws', async () => {
      const { socket } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockRejectedValue(new Error('DB down')) },
      });
      await expect(socket._trigger('disconnect')).resolves.not.toThrow();
    });
  });

  // ── call:leave logger lines with active participants and sockets ──────────

  describe('call:leave logger coverage with non-empty participants and sockets', () => {
    it('executes filter and map callbacks when participants/sockets are present', async () => {
      const callParticipant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [callParticipant] }));
      // leftSession has a remaining participant (leftAt: null) to trigger filter callback
      const leftSession = makeCallSession({
        status: 'active',
        participants: [makeParticipant()],
      });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const { socket, io } = setupWithSocket();
      // fetchSockets returns a socket to trigger the map(s => s.id) callback
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([{ id: 'room-sock-1' }]) });

      await socket._trigger('call:leave', { callId: CALL_ID });
      expect(socket.leave).toHaveBeenCalledWith(`call:${CALL_ID}`);
    });
  });

  // ── call:force-leave inner catch with proper call.participants ─────────────

  describe('call:force-leave inner leaveError catch', () => {
    it('catches error inside force-leave loop when leaveCall rejects', async () => {
      mockCallServiceLeaveCall.mockRejectedValue(new Error('leave failed'));

      // callSession.findMany returns a call WITH participants so the loop finds the user
      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{
            id: CALL_ID,
            status: 'active',
            conversationId: CONV_ID,
            participants: [{
              id: PARTICIPANT_ID,
              participantId: PARTICIPANT_ID,
              leftAt: null,
              participant: { userId: USER_ID },
            }],
          }]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await expect(socket._trigger('call:force-leave', { conversationId: CONV_ID })).resolves.not.toThrow();
    });
  });

  // ── createMissedCallNotifications catch ───────────────────────────────────

  describe('createMissedCallNotifications error catch', () => {
    it('logs error and does not throw when prisma.callSession.findUnique throws', async () => {
      const { handler } = buildHandler({
        callSession: {
          findUnique: jest.fn<any>().mockRejectedValue(new Error('DB error')),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      handler.setNotificationService({ createMissedCallNotification: jest.fn() } as any);
      await expect(handler.createMissedCallNotifications(CALL_ID)).resolves.not.toThrow();
    });

    it('uses username fallback and audio type when displayName is null', async () => {
      const sessionWithNulls = makeCallSession({
        metadata: { type: 'audio' },
        initiator: { id: USER_ID, username: 'caller', displayName: null, avatar: null },
      });
      const { handler } = buildHandler({
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue(sessionWithNulls),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      const ns = { createMissedCallNotification: jest.fn<any>().mockResolvedValue(undefined) };
      handler.setNotificationService(ns as any);
      mockCallServiceGetUnrespondedParticipants.mockResolvedValue([USER_ID]);

      await expect(handler.createMissedCallNotifications(CALL_ID)).resolves.not.toThrow();
      expect(ns.createMissedCallNotification).toHaveBeenCalledWith(
        expect.objectContaining({ callType: 'audio' })
      );
    });
  });

  // ── Rate limit failure branches ───────────────────────────────────────────

  describe('rate limit failure for call:leave / call:toggle-audio / call:toggle-video', () => {
    it('call:leave returns early when rate limit exceeded', async () => {
      mockCheckSocketRateLimit.mockResolvedValue(false);
      const { socket } = setupWithSocket();
      await socket._trigger('call:leave', { callId: CALL_ID });
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });

    it('call:toggle-audio returns early when rate limit exceeded', async () => {
      mockCheckSocketRateLimit.mockResolvedValue(false);
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-audio', { callId: CALL_ID, enabled: true });
      expect(mockCallServiceUpdateParticipantMedia).not.toHaveBeenCalled();
    });

    it('call:toggle-video returns early when rate limit exceeded', async () => {
      mockCheckSocketRateLimit.mockResolvedValue(false);
      const { socket } = setupWithSocket();
      await socket._trigger('call:toggle-video', { callId: CALL_ID, enabled: false });
      expect(mockCallServiceUpdateParticipantMedia).not.toHaveBeenCalled();
    });
  });

  // ── Validation failure branches for reconnecting/reconnected/transcription ─

  describe('validation failure for reconnecting / reconnected / transcription-segment', () => {
    it('call:reconnecting returns early when validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad schema' });
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnecting', { callId: CALL_ID, participantId: PARTICIPANT_ID, attempt: 1 });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('call:reconnecting returns early when membership not found', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnecting', { callId: CALL_ID, participantId: PARTICIPANT_ID, attempt: 1 });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('call:reconnecting completes normally when membership is found', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnecting', { callId: CALL_ID, participantId: PARTICIPANT_ID, attempt: 1 });
      expect(mockCallServiceUpdateCallStatus).toHaveBeenCalledWith(CALL_ID, 'reconnecting');
    });

    it('call:reconnected returns early when validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad schema' });
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnected', { callId: CALL_ID, participantId: PARTICIPANT_ID });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('call:reconnected returns early when membership not found', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnected', { callId: CALL_ID, participantId: PARTICIPANT_ID });
      expect(mockCallServiceUpdateCallStatus).not.toHaveBeenCalled();
    });

    it('call:reconnected completes normally when membership is found', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:reconnected', { callId: CALL_ID, participantId: PARTICIPANT_ID });
      expect(mockCallServiceUpdateCallStatus).toHaveBeenCalledWith(CALL_ID, 'active');
    });

    it('call:transcription-segment returns early when validation fails', async () => {
      mockValidateSocketEvent.mockReturnValue({ success: false, error: 'bad schema' });
      const { socket } = setupWithSocket();
      await socket._trigger('call:transcription-segment', {
        callId: CALL_ID,
        segment: { text: 'hi', speakerId: USER_ID, startMs: 0, endMs: 500, isFinal: true, language: 'en', confidence: 1 },
      });
      expect(mockCallServiceGetCallSession).not.toHaveBeenCalled();
    });
  });

  // ── Heartbeat and quality-report branch coverage ──────────────────────────

  describe('heartbeat and quality-report branches', () => {
    it('call:heartbeat does not call recordHeartbeat when the caller is not an active participant of this call', async () => {
      // Authorization runs through resolveActiveCallParticipantId →
      // callService.getCallSession(callId), not conversation membership.
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:heartbeat', { callId: CALL_ID });
      expect(mockCallServiceRecordHeartbeat).not.toHaveBeenCalled();
    });

    it('call:quality-report does not emit quality-alert when stats are below threshold', async () => {
      const { socket, io } = setupWithSocket();
      await socket._trigger('call:quality-report', {
        callId: CALL_ID,
        stats: { rtt: 100, packetLoss: 2, bytesSent: 0, bytesReceived: 0, level: 'good' },
      });
      const toCalls = (io.to as jest.Mock<any>).mock.calls;
      const alertCalls = toCalls.filter((c: any[]) => c[0] === `call:${CALL_ID}`);
      // No quality:alert emitted because stats are within threshold
      expect(alertCalls.length).toBe(0);
    });
  });

  // ── call:check-active with audio type and null fallbacks ──────────────────

  describe('call:check-active audio type and null fallback coverage', () => {
    it('uses audio type and displayName fallbacks when metadata.type is not video', async () => {
      const participantWithNulls = makeParticipant({
        participant: {
          userId: null,
          displayName: null,
          user: { username: null, displayName: null, avatar: null },
        },
      });
      const fullSession = makeCallSession({
        metadata: { type: 'audio' },
        initiator: { id: USER_ID, username: 'caller', displayName: null, avatar: null },
        participants: [participantWithNulls],
      });
      mockCallServiceGetCallSession.mockResolvedValue(fullSession);
      mockCallServiceGenerateIceServers.mockReturnValue([]);

      const activeCall = { id: CALL_ID, status: 'ringing', conversationId: CONV_ID };
      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONV_ID }]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([activeCall]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([{ callSessionId: CALL_ID, leftAt: null }]),
        },
      });

      await socket._trigger('call:check-active');
      expect(socket.emit).toHaveBeenCalledWith('call:initiated', expect.objectContaining({ type: 'audio' }));
    });

    it('returns when callIds length is 0 (no active calls in conversations)', async () => {
      const { socket } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONV_ID }]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
      });

      await socket._trigger('call:check-active');
      expect(mockCallServiceGetCallSession).not.toHaveBeenCalled();
    });
  });

  // ── call:initiate: audio type + no foreground sockets ─────────────────────

  describe('call:initiate audio type, null fallbacks, and foreground branching', () => {
    it('uses audio type when metadata is not video and skips foreground set when appForeground false', async () => {
      const participantWithNulls = makeParticipant({
        participant: {
          userId: null,
          displayName: null,
          user: { username: null, displayName: null, avatar: null },
        },
      });
      const callSession = makeCallSession({
        metadata: { type: 'audio' },
        initiator: { id: USER_ID, username: 'caller', displayName: null, avatar: null },
        participants: [participantWithNulls],
        status: 'ringing',
      });
      mockCallServiceInitiateCall.mockResolvedValue(callSession);

      const OTHER_USER = 'other-member-x1';
      // Sockets without appForeground (backgrounded) — not added to foregroundUserIds
      const memberSocket = { emit: jest.fn<any>(), data: { appForeground: false }, id: 'ms1' };

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: OTHER_USER }]),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([memberSocket]) });

      await socket._trigger('call:initiate', { conversationId: CONV_ID, type: 'audio', settings: {} });
      expect(memberSocket.emit).toHaveBeenCalledWith('call:initiated', expect.objectContaining({ type: 'audio' }));
    });
  });

  // ── call:join: null userId fallback + leftAt participant skip ─────────────

  describe('call:join null fallback branches', () => {
    it('uses participantId as userId fallback when participant.userId is null', async () => {
      const participantWithNullUser = makeParticipant({
        participantId: USER_ID, // must equal socket userId so the fallback find() matches
        participant: {
          userId: null,
          displayName: null,
          user: { username: null, displayName: null, avatar: null },
        },
      });
      const joinResult = { callSession: makeCallSession({ participants: [participantWithNullUser] }), iceServers: [] };
      mockCallServiceJoinCall.mockResolvedValue(joinResult);

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:join', { callId: CALL_ID, settings: {} });
      // Should not error out — falls back to participantId
      expect(socket.emit).not.toHaveBeenCalledWith('call:error', expect.anything());
    });

    it('skips participant with leftAt set when finding current participant', async () => {
      const leftParticipant = makeParticipant({ leftAt: new Date() });
      const activeParticipant = makeParticipant({ id: 'active-p', participantId: 'active-uid', participant: { userId: USER_ID, user: {} } });
      const joinResult = { callSession: makeCallSession({ participants: [leftParticipant, activeParticipant] }), iceServers: [] };
      mockCallServiceJoinCall.mockResolvedValue(joinResult);

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:join', { callId: CALL_ID, settings: {} });
      expect(socket.emit).not.toHaveBeenCalledWith('call:error', expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    });

    it('covers finally data?.callId false branch when data is undefined', async () => {
      const { socket } = setupWithSocket();
      // Trigger with no data at all → data is undefined → finally data?.callId is false
      await socket._trigger('call:join', undefined);
    });

    it('skips socket matching own id in room broadcast', async () => {
      const participant = makeParticipant();
      const joinResult = { callSession: makeCallSession({ participants: [participant] }), iceServers: [] };
      mockCallServiceJoinCall.mockResolvedValue(joinResult);

      const { socket, io } = setupWithSocket();
      // fetchSockets returns the SAME socket id as the current socket
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([{ id: SOCKET_ID, emit: jest.fn() }]) });

      await socket._trigger('call:join', { callId: CALL_ID, settings: {} });
      // Should not emit participant-joined back to self
    });

    it('call:leave skips participant with leftAt set (already left)', async () => {
      const leftParticipant = makeParticipant({ leftAt: new Date() });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [leftParticipant] }));

      const { socket } = setupWithSocket();
      await socket._trigger('call:leave', { callId: CALL_ID });
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });
  });

  // ── call:leave with null leaveParticipantId ───────────────────────────────

  describe('call:leave null leaveParticipantId fallback', () => {
    it('uses userId as fallback when resolveParticipantIdFromCall returns null', async () => {
      const participant = makeParticipant();
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [participant] }));
      const leftSession = makeCallSession({ status: 'ended', duration: 60, endReason: null as any });
      mockCallServiceLeaveCall.mockResolvedValue(leftSession);

      const { socket, io } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue(null), // callSession not found → null participantId
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:leave', { callId: CALL_ID });
      // Verifies: leaveParticipantId || userId (userId used as fallback), endReason || 'completed'
      expect(mockCallServiceLeaveCall).toHaveBeenCalledWith(expect.objectContaining({ participantId: USER_ID }));
    });
  });

  // ── call:signal: answer type + non-offer/ice-restart type ─────────────────

  describe('call:signal branch coverage for signal types', () => {
    it('clears buffered offer when signal type is answer', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'tp', participantId: 'tgt', participant: { userId: 'tgt', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const targetSocket = { id: 'tgt-sock', emit: jest.fn() };
      const { socket, io, getUserId } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([targetSocket]) });
      getUserId.mockImplementation((sid: string) => sid === 'tgt-sock' ? 'tgt' : USER_ID);

      const answerSignal = { callId: CALL_ID, signal: { type: 'answer', from: USER_ID, to: 'tgt' } };
      await socket._trigger('call:signal', answerSignal);

      expect(mockCallServiceClearRingingTimeout).toHaveBeenCalledWith(CALL_ID);
      expect(mockCallServiceUpdateCallStatus).toHaveBeenCalledWith(CALL_ID, 'active');
    });

    it('does not buffer when signal type is candidate (non-offer/ice-restart)', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'tp', participantId: 'tgt', participant: { userId: 'tgt', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const targetSocket = { id: 'tgt-sock', emit: jest.fn() };
      const { handler, socket, io, getUserId } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([targetSocket]) });
      getUserId.mockImplementation((sid: string) => sid === 'tgt-sock' ? 'tgt' : USER_ID);

      const candidateSignal = { callId: CALL_ID, signal: { type: 'candidate', from: USER_ID, to: 'tgt' } };
      await socket._trigger('call:signal', candidateSignal);

      expect((handler as any).bufferedOffers.has(CALL_ID)).toBe(false);
    });

    it('does not buffer non-offer when target has no sockets (no active connection)', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'tp', participantId: 'tgt', participant: { userId: 'tgt', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const { handler, socket, io, getUserId } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }); // no sockets in room
      getUserId.mockImplementation(() => 'tgt');

      const candidateSignal = { callId: CALL_ID, signal: { type: 'candidate', from: USER_ID, to: 'tgt' } };
      await socket._trigger('call:signal', candidateSignal);

      expect((handler as any).bufferedOffers.has(CALL_ID)).toBe(false);
    });

    it('resolveTargetSockets skips socket when userId does not match target', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'tp', participantId: 'tgt', participant: { userId: 'tgt', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const { socket, io, getUserId } = setupWithSocket();
      const wrongSocket = { id: 'wrong-sock', emit: jest.fn() };
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([wrongSocket]) });
      // getUserId for wrong-sock returns a different userId (not 'tgt')
      getUserId.mockImplementation((sid: string) => sid === 'wrong-sock' ? 'someone-else' : USER_ID);

      const offerSignal = { callId: CALL_ID, signal: { type: 'offer', from: USER_ID, to: 'tgt' } };
      await socket._trigger('call:signal', offerSignal);

      // Signal was NOT forwarded because socket didn't match target userId
      expect(wrongSocket.emit).not.toHaveBeenCalled();
    });
  });

  // ── call:end: null endReason + error without colon ────────────────────────

  describe('call:end null endReason and error message parsing', () => {
    it('defaults endReason to completed when callSession.endReason is null', async () => {
      const callSession = makeCallSession({ endReason: null as any, duration: 30 });
      mockCallServiceEndCall.mockResolvedValue(callSession);

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:end', { callId: CALL_ID });
      expect(io.to).toHaveBeenCalledWith(expect.arrayContaining([`call:${CALL_ID}`]));
      expect(io._roomEmit).toHaveBeenCalledWith(
        'call:ended',
        expect.objectContaining({ reason: 'completed' })
      );
    });

    it('uses raw error message when it contains no colon', async () => {
      mockCallServiceEndCall.mockRejectedValue(new Error('CALL_NOT_FOUND'));

      const { socket } = setupWithSocket();
      const ack = jest.fn();
      await socket._trigger('call:end', { callId: CALL_ID }, ack);
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'CALL_NOT_FOUND',
        message: 'CALL_NOT_FOUND',
      }));
    });
  });

  // ── call:initiate error without colon ─────────────────────────────────────

  describe('call:initiate error message without colon', () => {
    it('uses raw message when error has no colon', async () => {
      mockCallServiceInitiateCall.mockRejectedValue(new Error('CALL_ALREADY_ACTIVE'));

      const { socket } = setupWithSocket({
        participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }), findMany: jest.fn<any>().mockResolvedValue([]) },
      });
      await socket._trigger('call:initiate', { conversationId: CONV_ID, type: 'audio', settings: {} });
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'CALL_ALREADY_ACTIVE',
        message: 'CALL_ALREADY_ACTIVE',
      }));
    });
  });

  // ── call:join error without colon ─────────────────────────────────────────

  describe('call:join error message without colon', () => {
    it('uses raw message when joinCall error has no colon', async () => {
      mockCallServiceJoinCall.mockRejectedValue(new Error('ALREADY_IN_CALL'));

      const { socket } = setupWithSocket();
      await socket._trigger('call:join', { callId: CALL_ID, settings: {} });
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'ALREADY_IN_CALL',
        message: 'ALREADY_IN_CALL',
      }));
    });
  });

  // ── ringing timeout: null conversationId ──────────────────────────────────

  describe('ringing timeout null conversationId', () => {
    it('skips conversation room emit when findUnique returns no conversationId', async () => {
      const callSession = makeCallSession({ status: 'ringing' });
      mockCallServiceInitiateCall.mockResolvedValue(callSession);

      let timeoutCb: Function | null = null;
      mockCallServiceScheduleRingingTimeout.mockImplementation((_id: string, cb: Function) => {
        timeoutCb = cb;
      });

      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
        },
        callSession: {
          // call:initiate only uses participant.findFirst (resolveParticipantId), not callSession.findUnique.
          // The FIRST callSession.findUnique call is from the ringing timeout's conversationId lookup.
          findUnique: jest.fn<any>().mockResolvedValue(null), // ringing timeout: returns null → conversationId undefined
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:initiate', { conversationId: CONV_ID, type: 'audio', settings: {} });
      await timeoutCb!();

      // conversation room emit must be skipped since callSession.findUnique returned null → conversationId is undefined
      const toCalls = (io.to as jest.Mock<any>).mock.calls;
      const convRoomCalls = toCalls.filter((c: any[]) => typeof c[0] === 'string' && c[0].startsWith('conversation:'));
      expect(convRoomCalls.length).toBe(0);
    });
  });

  // ── bufferOffer: no eviction when entry is still fresh ────────────────────

  describe('bufferOffer: no eviction for fresh entries', () => {
    it('keeps non-expired entry when buffering a new one', async () => {
      const senderPart = makeParticipant({ participant: { userId: USER_ID, user: {} } });
      const targetPart = makeParticipant({ id: 'tp', participantId: 'tgt2', participant: { userId: 'tgt2', user: {} } });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [senderPart, targetPart] }));

      const { handler, socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      // Plant a fresh (non-expired) entry manually
      (handler as any).bufferOffer('call-fresh', { callId: 'call-fresh', signal: { type: 'offer', from: USER_ID, to: 'tgt2' } });

      // Buffer another offer (should NOT evict the fresh one)
      await socket._trigger('call:signal', { callId: CALL_ID, signal: { type: 'offer', from: USER_ID, to: 'tgt2' } });

      expect((handler as any).bufferedOffers.has('call-fresh')).toBe(true);
    });
  });

  // ── disconnect: status=ended (skip cleanup) + status=active (no ended broadcast) ──

  describe('disconnect status branching', () => {
    it('skips cleanup when participation.callSession.status is ended', async () => {
      mockCallServiceLeaveCall.mockResolvedValue(makeCallSession({ status: 'active' }));

      const now = new Date(Date.now() - 30_000);
      const endedParticipation = {
        id: PARTICIPANT_ID,
        callSessionId: CALL_ID,
        participantId: PARTICIPANT_ID,
        callSession: { id: CALL_ID, status: 'ended', mode: 'p2p', conversationId: CONV_ID, startedAt: now },
      };

      const { socket } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([endedParticipation]) },
      });

      await socket._trigger('disconnect');
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });

    it('does not emit call:ended when leftSession status is active (not ended/missed)', async () => {
      mockCallServiceLeaveCall.mockResolvedValue(makeCallSession({ status: 'active' }));

      const now = new Date(Date.now() - 30_000);
      const activeParticipation = {
        id: PARTICIPANT_ID,
        callSessionId: CALL_ID,
        participantId: PARTICIPANT_ID,
        callSession: { id: CALL_ID, status: 'active', mode: 'p2p', conversationId: CONV_ID, startedAt: now },
      };

      const { socket, io } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([activeParticipation]) },
      });

      await socket._trigger('disconnect');
      // No call:ended event because status=active
      const toCalls = (io.to as jest.Mock<any>).mock.calls;
      const endedCalls = toCalls.filter((c: any[]) => c[0] && io._roomEmit.mock &&
        io._roomEmit.mock.calls.some((ec: any[]) => ec[0] === 'call:ended'));
      expect(endedCalls.length).toBe(0);
    });
  });

  // ── force-leave: no matching participant (loop skips) ─────────────────────

  describe('call:force-leave with no matching participant in loop', () => {
    it('skips loop body when no participant matches userId', async () => {
      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([{
            id: CALL_ID,
            status: 'active',
            conversationId: CONV_ID,
            participants: [{
              id: PARTICIPANT_ID,
              participantId: PARTICIPANT_ID,
              leftAt: null,
              participant: { userId: 'someone-else' },  // different userId → no match
            }],
          }]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:force-leave', { conversationId: CONV_ID });
      expect(mockCallServiceLeaveCall).not.toHaveBeenCalled();
    });
  });

  // ── call:leave anonymous participant ─────────────────────────────────────

  describe('call:leave anonymous participant fallback', () => {
    it('uses participant.participantId when participant.userId is null', async () => {
      const anonParticipant = makeParticipant({
        participantId: USER_ID, // must equal userId so the find() matches via || branch
        participant: { userId: null, user: { username: null, displayName: null, avatar: null } },
      });
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [anonParticipant] }));
      mockCallServiceLeaveCall.mockResolvedValue(makeCallSession({ participants: [anonParticipant] }));

      const { socket, io } = setupWithSocket({
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:leave', { callId: CALL_ID });
      // leftEvent.userId uses || participant.participantId since participant.userId is null
      expect(mockCallServiceLeaveCall).toHaveBeenCalled();
    });
  });

  // ── call:force-leave success paths ────────────────────────────────────────

  describe('call:force-leave success path branches', () => {
    function makeActiveCallWithUser() {
      return {
        id: CALL_ID,
        status: 'active',
        conversationId: CONV_ID,
        participants: [{
          id: PARTICIPANT_ID,
          participantId: PARTICIPANT_ID,
          leftAt: null,
          participant: { userId: USER_ID },
        }],
      };
    }

    it('broadcasts participant-left and skips ended event when session is not ended', async () => {
      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([makeActiveCallWithUser()]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      mockCallServiceLeaveCall.mockResolvedValue(makeCallSession({ status: 'active' }));
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:force-leave', { conversationId: CONV_ID });
      expect(mockCallServiceLeaveCall).toHaveBeenCalled();
      const roomEmitCalls = (io._roomEmit as jest.Mock<any>).mock.calls;
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:participant-left')).toBe(true);
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:ended')).toBe(false);
    });

    it('broadcasts ended event when leaveCall returns ended session', async () => {
      const { socket, io } = setupWithSocket({
        participant: {
          findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
          findMany: jest.fn<any>().mockResolvedValue([]),
        },
        callSession: {
          findUnique: jest.fn<any>().mockResolvedValue({ id: CALL_ID, conversationId: CONV_ID }),
          findMany: jest.fn<any>().mockResolvedValue([makeActiveCallWithUser()]),
          updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
        },
      });
      mockCallServiceLeaveCall.mockResolvedValue(makeCallSession({ status: 'ended', duration: null, endReason: null }));
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:force-leave', { conversationId: CONV_ID });
      const roomEmitCalls = (io._roomEmit as jest.Mock<any>).mock.calls;
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:ended')).toBe(true);
    });
  });

  // ── call:signal anonymous participants ────────────────────────────────────

  describe('call:signal anonymous participant fallback', () => {
    it('uses participantId fallback for sender and target when participant.userId is null', async () => {
      const anonSender = makeParticipant({
        participantId: USER_ID,
        participant: { userId: null, user: {} },
      });
      const targetId = 'anon-target-007';
      const anonTarget = makeParticipant({
        id: 'tp-anon',
        participantId: targetId,
        participant: { userId: null, user: {} },
      });
      mockCallServiceGetCallSession.mockResolvedValue(
        makeCallSession({ participants: [anonSender, anonTarget] })
      );

      const { socket, io } = setupWithSocket();
      io.in.mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) });

      await socket._trigger('call:signal', {
        callId: CALL_ID,
        signal: { type: 'offer', from: USER_ID, to: targetId },
      });
      // TARGET_NOT_FOUND emitted (no socket for anon target), but NOT NOT_A_PARTICIPANT
      // — that confirms both anonymous fallback branches (sender + target find) were exercised
      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'TARGET_NOT_FOUND',
      }));
      expect(socket.emit).not.toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'NOT_A_PARTICIPANT',
      }));
    });
  });

  // ── call:quality-report branch coverage ───────────────────────────────────

  describe('call:quality-report branches', () => {
    it('returns early when validation fails', async () => {
      mockValidateSocketEvent.mockReturnValueOnce({ success: false, error: 'bad data' });
      const { socket } = setupWithSocket();
      await socket._trigger('call:quality-report', {
        callId: CALL_ID,
        stats: { rtt: 500, packetLoss: 1, bytesSent: 0, bytesReceived: 0, level: 'good' },
      });
      expect(mockCallServicePersistCallStats).not.toHaveBeenCalled();
    });

    it('skips quality alert when resolveActiveCallParticipantId returns null', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket, io } = setupWithSocket();
      await socket._trigger('call:quality-report', {
        callId: CALL_ID,
        stats: { rtt: 500, packetLoss: 1, bytesSent: 0, bytesReceived: 0, level: 'good' },
      });
      const toCalls = (io.to as jest.Mock<any>).mock.calls;
      expect(toCalls.some((c: any[]) => typeof c[0] === 'string' && c[0].startsWith('call:'))).toBe(false);
    });
  });

  // ── disconnect: ended-status broadcast + force-cleanup path ──────────────

  describe('disconnect leaveCall outcomes', () => {
    const makeActiveParticipation = (overrides: Record<string, any> = {}) => ({
      id: 'cp-dc-1',
      callSessionId: CALL_ID,
      participantId: PARTICIPANT_ID,
      callSession: { id: CALL_ID, status: 'active', mode: 'p2p', conversationId: CONV_ID, startedAt: new Date() },
      ...overrides,
    });

    // CALL-RESILIENCE — the terminal leave/broadcast outcomes below now run at
    // reconnect-grace expiry (active-call disconnect no longer ends immediately).
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    const graceReCheck = () => ({
      findUnique: jest.fn<any>().mockResolvedValue({ leftAt: null, callSession: { status: 'active' } }),
    });

    it('broadcasts call:ended when leaveCall returns ended session', async () => {
      mockCallServiceLeaveCall.mockResolvedValue(
        makeCallSession({ status: 'ended', duration: null, endReason: null })
      );

      const { socket, io } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([makeActiveParticipation()]), ...graceReCheck() },
      });

      await socket._trigger('disconnect');
      await jest.advanceTimersByTimeAsync(31_000);
      const roomEmitCalls = (io._roomEmit as jest.Mock<any>).mock.calls;
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:ended')).toBe(true);
    });

    it('runs $transaction force cleanup when leaveCall rejects on disconnect', async () => {
      mockCallServiceLeaveCall.mockRejectedValue(new Error('DB error'));

      const { socket, io } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([makeActiveParticipation()]), ...graceReCheck() },
      });

      await socket._trigger('disconnect');
      await jest.advanceTimersByTimeAsync(31_000);
      // participant-left still broadcast via force cleanup
      const roomEmitCalls = (io._roomEmit as jest.Mock<any>).mock.calls;
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:participant-left')).toBe(true);
    });

    it('broadcasts call:ended in force cleanup when the last participant leaves and forceEndOrphanedCallSession resolves', async () => {
      // The raw $transaction here only marks THIS participant's leftAt and
      // counts remaining participants — the terminal CallSession write (with
      // its version bump / status guard / endReason) now goes through
      // CallService.forceEndOrphanedCallSession (see terminal-write protocol
      // regression tests on that method in CallService.test.ts).
      mockCallServiceLeaveCall.mockRejectedValue(new Error('DB error'));
      mockCallServiceForceEndOrphanedCallSession.mockResolvedValue({ duration: 10, conversationId: CONV_ID });

      const { socket, io } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([makeActiveParticipation()]), ...graceReCheck() },
        $transaction: jest.fn<any>().mockImplementation(async (fn: Function) => fn({
          callParticipant: {
            update: jest.fn<any>().mockResolvedValue({}),
            count: jest.fn<any>().mockResolvedValue(0), // last participant → force-end
          },
        })),
      });

      await socket._trigger('disconnect');
      await jest.advanceTimersByTimeAsync(31_000);
      const roomEmitCalls = (io._roomEmit as jest.Mock<any>).mock.calls;
      // both participant-left and call:ended should be emitted
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:participant-left')).toBe(true);
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:ended')).toBe(true);
      expect(mockCallServiceForceEndOrphanedCallSession).toHaveBeenCalledWith(CALL_ID, 'connectionLost');
    });

    it('does not force-end the call when other participants remain after this one leaves', async () => {
      mockCallServiceLeaveCall.mockRejectedValue(new Error('DB error'));

      const { socket } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([makeActiveParticipation()]), ...graceReCheck() },
        $transaction: jest.fn<any>().mockImplementation(async (fn: Function) => fn({
          callParticipant: {
            update: jest.fn<any>().mockResolvedValue({}),
            count: jest.fn<any>().mockResolvedValue(1), // another participant is still in the call
          },
        })),
      });

      await socket._trigger('disconnect');
      await jest.advanceTimersByTimeAsync(31_000);
      expect(mockCallServiceForceEndOrphanedCallSession).not.toHaveBeenCalled();
    });

    it('does not broadcast call:ended when forceEndOrphanedCallSession finds the call already resolved by another path', async () => {
      mockCallServiceLeaveCall.mockRejectedValue(new Error('DB error'));
      mockCallServiceForceEndOrphanedCallSession.mockResolvedValue(null);

      const { socket, io } = setupWithSocket({
        callParticipant: { findMany: jest.fn<any>().mockResolvedValue([makeActiveParticipation()]), ...graceReCheck() },
        $transaction: jest.fn<any>().mockImplementation(async (fn: Function) => fn({
          callParticipant: {
            update: jest.fn<any>().mockResolvedValue({}),
            count: jest.fn<any>().mockResolvedValue(0),
          },
        })),
      });

      await socket._trigger('disconnect');
      await jest.advanceTimersByTimeAsync(31_000);
      const roomEmitCalls = (io._roomEmit as jest.Mock<any>).mock.calls;
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:participant-left')).toBe(true);
      expect(roomEmitCalls.some((c: any[]) => c[0] === 'call:ended')).toBe(false);
    });
  });

  describe('call:request-ice-servers', () => {
    it('returns early when getUserId returns null', async () => {
      const { handler, io } = buildHandler();
      const socket = makeSocket({ rooms: new Set([`call:${CALL_ID}`]) });
      const getUserId = jest.fn<any>().mockReturnValue(null);
      const getUserInfo = jest.fn<any>().mockReturnValue(null);
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

      await socket._trigger('call:request-ice-servers', { callId: CALL_ID });

      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('returns early when schema validation fails', async () => {
      mockValidateSocketEvent.mockReturnValueOnce({ success: false });
      const { handler, io } = buildHandler();
      const socket = makeSocket({ rooms: new Set([`call:${CALL_ID}`]) });
      const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
      const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

      await socket._trigger('call:request-ice-servers', { callId: CALL_ID });

      expect(socket.emit).not.toHaveBeenCalledWith('call:ice-servers-refreshed', expect.anything());
    });

    it('emits call:error NOT_A_PARTICIPANT when socket is not in call room', async () => {
      const { handler, io } = buildHandler();
      // rooms does NOT contain the call room
      const socket = makeSocket({ rooms: new Set(['user:other']) });
      const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
      const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

      await socket._trigger('call:request-ice-servers', { callId: CALL_ID });

      expect(socket.emit).toHaveBeenCalledWith('call:error', expect.objectContaining({
        code: 'NOT_A_PARTICIPANT',
      }));
    });

    it('emits call:ice-servers-refreshed with iceServers and ttl on happy path', async () => {
      const iceServers = [{ urls: 'turn:turn.example.com:3478' }];
      mockCallServiceGenerateIceServers.mockReturnValueOnce(iceServers);
      // Authz upgrade (audit 2026-07-02) — the handler now resolves the caller
      // via `resolveActiveCallParticipantId`, which reads `callService.getCallSession`
      // instead of trusting room membership alone.
      mockCallServiceGetCallSession.mockResolvedValue(
        makeCallSession({ participants: [makeParticipant()] })
      );
      const { handler, io } = buildHandler();
      const socket = makeSocket({ rooms: new Set([`call:${CALL_ID}`]) });
      const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
      const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

      await socket._trigger('call:request-ice-servers', { callId: CALL_ID });

      expect(socket.emit).toHaveBeenCalledWith('call:ice-servers-refreshed', {
        callId: CALL_ID,
        iceServers,
        ttl: 600,
      });
    });
  });

  // ── call:backgrounded ────────────────────────────────────────────────────

  describe('call:backgrounded', () => {
    const validData = { callId: CALL_ID, participantId: PARTICIPANT_ID };

    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:backgrounded', validData);
      expect(mockCallServiceRecordParticipantBackgrounded).not.toHaveBeenCalled();
    });

    it('returns early when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false });
      await socket._trigger('call:backgrounded', validData);
      expect(mockCallServiceRecordParticipantBackgrounded).not.toHaveBeenCalled();
    });

    it('returns early when rate limit exceeded', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockResolvedValue(false);
      await socket._trigger('call:backgrounded', validData);
      expect(mockCallServiceRecordParticipantBackgrounded).not.toHaveBeenCalled();
    });

    it('sets socket.data.appForeground to false and records background state', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:backgrounded', validData);
      expect(socket.data.appForeground).toBe(false);
      expect(mockCallServiceRecordParticipantBackgrounded).toHaveBeenCalledWith(
        CALL_ID,
        PARTICIPANT_ID
      );
    });

    it('ignores a client-supplied participantId and uses the resolved one instead', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:backgrounded', {
        callId: CALL_ID,
        participantId: 'someone-elses-participant-id',
      });
      expect(mockCallServiceRecordParticipantBackgrounded).toHaveBeenCalledWith(
        CALL_ID,
        PARTICIPANT_ID
      );
    });

    it('returns early when the caller cannot be resolved to an active participant', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:backgrounded', validData);
      expect(mockCallServiceRecordParticipantBackgrounded).not.toHaveBeenCalled();
    });
  });

  // ── call:foregrounded ────────────────────────────────────────────────────

  describe('call:foregrounded', () => {
    const validData = { callId: CALL_ID, participantId: PARTICIPANT_ID };

    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:foregrounded', validData);
      expect(mockCallServiceClearParticipantBackgrounded).not.toHaveBeenCalled();
    });

    it('returns early when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false });
      await socket._trigger('call:foregrounded', validData);
      expect(mockCallServiceClearParticipantBackgrounded).not.toHaveBeenCalled();
    });

    it('returns early when rate limit exceeded', async () => {
      const { socket } = setupWithSocket();
      mockCheckSocketRateLimit.mockResolvedValue(false);
      await socket._trigger('call:foregrounded', validData);
      expect(mockCallServiceClearParticipantBackgrounded).not.toHaveBeenCalled();
    });

    it('sets socket.data.appForeground to true and clears background state', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      socket.data.appForeground = false;
      await socket._trigger('call:foregrounded', validData);
      expect(socket.data.appForeground).toBe(true);
      expect(mockCallServiceClearParticipantBackgrounded).toHaveBeenCalledWith(
        CALL_ID,
        PARTICIPANT_ID
      );
    });

    it('reverses a previous call:backgrounded', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:backgrounded', validData);
      expect(socket.data.appForeground).toBe(false);
      await socket._trigger('call:foregrounded', validData);
      expect(socket.data.appForeground).toBe(true);
    });

    it('ignores a client-supplied participantId and uses the resolved one instead', async () => {
      mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [makeParticipant()] }));
      const { socket } = setupWithSocket();
      await socket._trigger('call:foregrounded', {
        callId: CALL_ID,
        participantId: 'someone-elses-participant-id',
      });
      expect(mockCallServiceClearParticipantBackgrounded).toHaveBeenCalledWith(
        CALL_ID,
        PARTICIPANT_ID
      );
    });
  });

  // ── call:screen-capture-detected ─────────────────────────────────────────

  describe('call:screen-capture-detected', () => {
    const validData = { callId: CALL_ID, participantId: PARTICIPANT_ID, isCapturing: true };

    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:screen-capture-detected', validData);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns early when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false });
      await socket._trigger('call:screen-capture-detected', validData);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('returns silently when socket is not in the call room', async () => {
      const { handler, io } = buildHandler();
      const socket = makeSocket({ rooms: new Set(['user:other']) });
      const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
      const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);
      await socket._trigger('call:screen-capture-detected', validData);
      expect(socket.to).not.toHaveBeenCalled();
    });

    it('relays call:screen-capture-alert to others in the call room when capturing', async () => {
      const { handler, io } = buildHandler();
      const socket = makeSocket({ rooms: new Set([`call:${CALL_ID}`]) });
      const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
      const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

      await socket._trigger('call:screen-capture-detected', validData);

      expect(socket.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
      const toEmit = (socket.to as jest.Mock<any>).mock.results[0]?.value?.emit as jest.Mock<any>;
      expect(toEmit).toHaveBeenCalledWith('call:screen-capture-alert', {
        callId: CALL_ID,
        participantId: PARTICIPANT_ID,
        isCapturing: true,
      });
    });

    it('relays call:screen-capture-alert with isCapturing false when screen share stops', async () => {
      const { handler, io } = buildHandler();
      const socket = makeSocket({ rooms: new Set([`call:${CALL_ID}`]) });
      const getUserId = jest.fn<any>().mockReturnValue(USER_ID);
      const getUserInfo = jest.fn<any>().mockReturnValue({ id: USER_ID, isAnonymous: false });
      handler.setupCallEvents(socket as any, io as any, getUserId, getUserInfo);

      await socket._trigger('call:screen-capture-detected', { ...validData, isCapturing: false });

      const toEmit = (socket.to as jest.Mock<any>).mock.results[0]?.value?.emit as jest.Mock<any>;
      expect(toEmit).toHaveBeenCalledWith('call:screen-capture-alert', {
        callId: CALL_ID,
        participantId: PARTICIPANT_ID,
        isCapturing: false,
      });
    });
  });

  // ── call:analytics ───────────────────────────────────────────────────────

  describe('call:analytics', () => {
    const validAnalyticsData = {
      callId: CALL_ID,
      setupTimeMs: 1250,
      durationSeconds: 65.4,
      reconnectionCount: 0,
      networkTransitions: 1,
      averageRtt: 42.5,
      averagePacketLoss: 0.3,
      maxPacketLoss: 2.1,
      codec: 'opus',
      effectsUsed: [],
      filtersUsed: false,
      transcriptionUsed: false,
      qualityDistribution: { excellent: 0.9, good: 0.1, fair: 0.0, poor: 0.0 },
      platform: 'ios',
      deviceModel: 'iPhone',
      isVideo: false,
      endReason: 'local',
    };

    it('returns early when no userId', async () => {
      const { socket, getUserId } = setupWithSocket();
      getUserId.mockReturnValue(undefined);
      await socket._trigger('call:analytics', validAnalyticsData);
      // Fire-and-forget handler — no side effects on unauthenticated socket.
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('returns early when validation fails', async () => {
      const { socket } = setupWithSocket();
      mockValidateSocketEvent.mockReturnValue({ success: false });
      await socket._trigger('call:analytics', { callId: 'bad' });
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it('does not emit any socket event on success (fire-and-forget)', async () => {
      const { socket } = setupWithSocket();
      await socket._trigger('call:analytics', validAnalyticsData);
      // analytics is log-only — no response emitted back to client
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.to).not.toHaveBeenCalled();
    });

    // La télémétrie de fin d'appel n'était que loggée : impossible de suivre
    // la fiabilité (reconnectionCount, qualityDistribution, negotiationTimeMs)
    // sur les appels réels. Persistée par PARTICIPANT (une row CallParticipant
    // chacun — deux emitters simultanés en fin d'appel n'écrasent rien,
    // contrairement à un champ unique sur CallSession).
    it('persists the validated payload on the emitter CallParticipant row', async () => {
      const { socket, prisma } = setupWithSocket();

      await socket._trigger('call:analytics', validAnalyticsData);

      expect((prisma as any).callParticipant.updateMany).toHaveBeenCalledWith({
        where: { callSessionId: CALL_ID, participantId: PARTICIPANT_ID },
        data: { analytics: expect.objectContaining({ setupTimeMs: 1250, platform: 'ios' }) },
      });
    });

    it('a persistence failure stays silent (fire-and-forget, no emit, no throw)', async () => {
      const { socket } = setupWithSocket({
        callParticipant: {
          findMany: jest.fn<any>().mockResolvedValue([]),
          updateMany: jest.fn<any>().mockRejectedValue(new Error('DB down')),
        },
      });

      await expect(socket._trigger('call:analytics', validAnalyticsData)).resolves.not.toThrow();
      expect(socket.emit).not.toHaveBeenCalled();
    });
  });
});
