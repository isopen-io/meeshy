/**
 * CallEventsHandler — call:initiate conveys conversation context (group calls)
 *
 * Group-calls gap analysis (tasks/2026-08-13-group-calls-gap-analysis.md, W6)
 * flagged `CallNotification` as mono-caller: the ringing callee sees only the
 * initiator's avatar/name, never which conversation is calling. For a group
 * call this is misleading — "Alice is calling you" reads as a 1:1 call even
 * when Alice actually rang the whole "Design Team" group.
 *
 * `CallInitiatedEvent` had no `conversationType`/`conversationTitle` at all,
 * and the gateway never looked the conversation up beyond the membership
 * check already run in `CallService.initiateCall` (which discards it after
 * validation). `getCallSession`'s existing `callSessionInclude` already
 * selects `conversation.{id,identifier,type}` — only `title` was missing —
 * so the fix is additive on both the Prisma select and the wire event, no
 * new query.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockInitiateCall = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    initiateCall: mockInitiateCall,
    generateIceServers: mockGenerateIceServers,
    getIceServerTtl: jest.fn<any>().mockReturnValue(300),
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    scheduleRingingTimeout: jest.fn<any>(),
    getCallSession: jest.fn<any>(),
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
  isValidationFailure: jest.fn((r: any) => !r.success),
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
    CALL_INITIATE: { maxRequests: 5, windowMs: 60000, keyPrefix: 'socket:call:initiate' },
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

const CALLER_ID = 'user-caller-abc';
const MEMBER_ID = 'user-member-def';
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

function makeCallSession(conversation?: { type: string; title: string | null }) {
  return {
    id: CALL_ID,
    conversationId: CONV_ID,
    mode: 'p2p',
    metadata: { type: 'audio' },
    initiator: { id: CALLER_ID, username: 'alice', displayName: 'Alice Smith', avatar: null },
    participants: [],
    conversation,
  };
}

function makePrisma() {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }),
      findMany: jest.fn<any>().mockResolvedValue([{ userId: MEMBER_ID }]),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-caller-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn<any>(),
    join: jest.fn<any>().mockResolvedValue(undefined),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    data: {},
  };
  return { socket, handlers };
}

function makeIo() {
  const memberEmit = jest.fn<any>();
  // `appForeground: true` (fresh) keeps this member out of the VoIP-push
  // fallback branch, which this test doesn't exercise or mock.
  const memberSocket = { id: 'socket-member-1', emit: memberEmit, data: { appForeground: true } };
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([memberSocket]) }),
  };
  return { io, memberEmit };
}

async function initiateAndCaptureMemberEmit(callSession: ReturnType<typeof makeCallSession>) {
  mockInitiateCall.mockResolvedValue(callSession);

  const prisma = makePrisma();
  const { socket, handlers } = makeSocket();
  const { io, memberEmit } = makeIo();

  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(socket as any, io as any, () => CALLER_ID);

  await handlers[CALL_EVENTS.INITIATE](INITIATE_DATA, jest.fn<any>());

  return memberEmit;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:initiate conveys conversation context', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (validateSocketEvent as jest.MockedFunction<any>).mockReturnValue({ success: true });
    mockGenerateIceServers.mockReturnValue([]);
  });

  it('conveys conversationType + conversationTitle for a titled group call', async () => {
    const memberEmit = await initiateAndCaptureMemberEmit(
      makeCallSession({ type: 'group', title: 'Design Team' })
    );

    expect(memberEmit).toHaveBeenCalledWith(
      CALL_EVENTS.INITIATED,
      expect.objectContaining({ conversationType: 'group', conversationTitle: 'Design Team' })
    );
  });

  it('conveys conversationTitle: null for an untitled group call, never dropping the group type', async () => {
    const memberEmit = await initiateAndCaptureMemberEmit(
      makeCallSession({ type: 'group', title: null })
    );

    expect(memberEmit).toHaveBeenCalledWith(
      CALL_EVENTS.INITIATED,
      expect.objectContaining({ conversationType: 'group', conversationTitle: null })
    );
  });

  it('conveys conversationType: direct for a 1:1 call', async () => {
    const memberEmit = await initiateAndCaptureMemberEmit(
      makeCallSession({ type: 'direct', title: null })
    );

    expect(memberEmit).toHaveBeenCalledWith(
      CALL_EVENTS.INITIATED,
      expect.objectContaining({ conversationType: 'direct', conversationTitle: null })
    );
  });

  it('falls back to direct/null (never throws) when conversation is absent from the resolved call session', async () => {
    const memberEmit = await initiateAndCaptureMemberEmit(makeCallSession(undefined));

    expect(memberEmit).toHaveBeenCalledWith(
      CALL_EVENTS.INITIATED,
      expect.objectContaining({ conversationType: 'direct', conversationTitle: null })
    );
  });
});
