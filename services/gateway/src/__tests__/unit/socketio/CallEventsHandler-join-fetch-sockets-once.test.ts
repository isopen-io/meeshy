/**
 * CallEventsHandler — un `call:join` ne liste les sockets de la room d'appel qu'une fois (#9087)
 *
 * L'éviction C8 (sockets périmées du même utilisateur) et la diffusion de
 * `call:participant-joined` lisaient chacune `fetchSockets()` sur la même
 * room : sur l'adapter Redis, deux allers-retours inter-instances par join.
 * La diffusion réutilise désormais la liste de l'éviction, privée des sockets
 * évincées — l'audience reste exactement celle d'avant.
 */


import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockJoinCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>().mockReturnValue([]);
const mockClearRingingTimeout = jest.fn<any>();

jest.mock('../../../services/CallService', () => {
  class CallAlreadyEndedError extends Error {
    readonly endReason: string;
    constructor(endReason: string) {
      super('CALL_ENDED: This call has already ended');
      this.name = 'CallAlreadyEndedError';
      this.endReason = endReason;
    }
  }
  return {
    CallService: jest.fn().mockImplementation(() => ({
      joinCall: mockJoinCall,
      generateIceServers: mockGenerateIceServers,
      clearRingingTimeout: mockClearRingingTimeout,
    })),
    CallAlreadyEndedError,
  };
});

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
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
    CALL_JOIN: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:join' },
    CALL_SIGNAL: { maxRequests: 60, windowMs: 60000, keyPrefix: 'socket:call:signal' },
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

const JOINER_ID = 'user-joiner-abc';
const PEER_ID = 'user-peer-xyz';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const JOINER_SOCKET = 'socket-joiner-new';
const STALE_SOCKET = 'socket-joiner-stale';
const PEER_SOCKET = 'socket-peer';
const ORPHAN_SOCKET = 'socket-orphan';

const socketOwners: Record<string, string> = {
  [JOINER_SOCKET]: JOINER_ID,
  [STALE_SOCKET]: JOINER_ID,
  [PEER_SOCKET]: PEER_ID,
};

function makeParticipant(userId: string) {
  return {
    id: `row-${userId}`,
    callSessionId: CALL_ID,
    participantId: userId,
    participant: { userId, displayName: userId, user: { username: userId, avatar: null } },
    role: 'participant',
    joinedAt: new Date(),
    leftAt: null,
    isAudioEnabled: true,
    isVideoEnabled: false,
  };
}

function makeRoom(ids: ReadonlyArray<string>) {
  const members = new Set(ids);
  const sockets = ids.map((id) => ({
    id,
    leave: jest.fn<any>(() => { members.delete(id); }),
    emit: jest.fn<any>(),
  }));
  const current = () => sockets.filter((s) => members.has(s.id));
  return { sockets, current };
}

async function join(opts: { firstFetchFails?: boolean } = {}) {
  mockJoinCall.mockResolvedValue({
    callSession: { id: CALL_ID, conversationId: CONV_ID, mode: 'audio', participants: [makeParticipant(PEER_ID), makeParticipant(JOINER_ID)] },
    iceServers: [],
  });
  const room = makeRoom([JOINER_SOCKET, STALE_SOCKET, PEER_SOCKET, ORPHAN_SOCKET]);
  const [self, stale, peer, orphan] = room.sockets;
  const fetchSockets = jest.fn<any>(async () => room.current());
  if (opts.firstFetchFails) fetchSockets.mockRejectedValueOnce(new Error('adapter timeout'));
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets }),
  };
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: JOINER_SOCKET,
    on: jest.fn((event: string, fn: (...args: any[]) => any) => { handlers[event] = fn; }),
    join: jest.fn<any>(),
    emit: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }),
    data: {},
  };
  const prisma = {
    callSession: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: `row-${JOINER_ID}` }) },
  } as unknown as PrismaClient;
  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(socket as any, io as any, (socketId: string) => socketOwners[socketId]);
  const ack = jest.fn<any>();
  await handlers[CALL_EVENTS.JOIN]({ callId: CALL_ID }, ack);
  return { fetchSockets, self, stale, peer, orphan, ack };
}

function joinedEmits(remote: { emit: jest.Mock<any> }) {
  return remote.emit.mock.calls.filter(([event]) => event === CALL_EVENTS.PARTICIPANT_JOINED);
}

describe('CallEventsHandler — call:join lists the call room once (#9087)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
  });

  it('fetches the sockets of the call room a single time', async () => {
    const { fetchSockets, ack } = await join();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(fetchSockets).toHaveBeenCalledTimes(1);
  });

  it('evicts the stale same-user socket and never announces the join to it', async () => {
    const { stale } = await join();
    expect(stale.leave).toHaveBeenCalledWith(`call:${CALL_ID}`);
    expect(joinedEmits(stale)).toHaveLength(0);
  });

  it('announces the join to every other user socket, never to the joiner nor to an unresolved socket', async () => {
    const { self, peer, orphan } = await join();
    expect(joinedEmits(peer)).toHaveLength(1);
    expect(joinedEmits(self)).toHaveLength(0);
    expect(joinedEmits(orphan)).toHaveLength(0);
  });

  it('still announces the join, from a fresh listing, when the eviction listing fails', async () => {
    const { fetchSockets, peer, stale } = await join({ firstFetchFails: true });
    expect(fetchSockets).toHaveBeenCalledTimes(2);
    expect(joinedEmits(peer)).toHaveLength(1);
    expect(joinedEmits(stale)).toHaveLength(1);
  });
});
