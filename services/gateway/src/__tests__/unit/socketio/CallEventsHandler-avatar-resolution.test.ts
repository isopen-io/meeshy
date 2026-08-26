/**
 * CallEventsHandler — participant avatar resolution on the replayed
 * `call:initiated` event (SSOT alignment).
 *
 * The `call:check-active` reconnect path re-emits `call:initiated` so a client
 * that dropped mid-call gets its incoming banner / in-call roster back. Each
 * participant's avatar MUST resolve through the shared source of truth
 * `resolveParticipantAvatar`, whose canonical order is **local participant
 * avatar first, then the linked account avatar**, with blank/whitespace strings
 * treated as absent.
 *
 * Before this was wired to the SSOT the handler used
 * `p.participant?.user?.avatar || p.participant?.avatar` — the exact "ordre
 * inversé" divergence the helper exists to prevent: it returned the *account*
 * avatar even when a per-conversation local avatar was set, and leaked a blank
 * `''` verbatim (which the browser resolves to `<img src="">`, reloading the
 * current page). The sibling `displayName` field in the same object literal was
 * already local-first, so a participant could show the right name beside the
 * wrong avatar.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module-level mocks — must precede all imports
// ---------------------------------------------------------------------------

const mockGetCallSession = jest.fn<any>();
const mockGenerateIceServers = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  CallService: jest.fn().mockImplementation(() => ({
    getCallSession: mockGetCallSession,
    generateIceServers: mockGenerateIceServers,
    getIceServerTtl: jest.fn<any>().mockReturnValue(86400),
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
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

jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({
    checkLimit: jest.fn<any>().mockResolvedValue(true),
    destroy: jest.fn(),
  })),
  getSocketRateLimiter: jest.fn().mockReturnValue({
    checkLimit: jest.fn<any>().mockResolvedValue(true),
    destroy: jest.fn(),
  }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {},
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-abc';
const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';

const LOCAL_AVATAR = 'https://cdn.meeshy.test/local/bob.png';
const ACCOUNT_AVATAR_BOB = 'https://cdn.meeshy.test/account/bob.png';
const ACCOUNT_AVATAR_CAROL = 'https://cdn.meeshy.test/account/carol.png';

function makeParticipant(overrides: {
  id: string;
  localAvatar: string | null;
  accountAvatar: string | null;
  displayName: string;
}) {
  return {
    id: overrides.id,
    callSessionId: CALL_ID,
    participantId: `pp-${overrides.id}`,
    role: 'member',
    joinedAt: new Date('2026-07-18T00:00:00.000Z'),
    leftAt: null,
    isAudioEnabled: true,
    isVideoEnabled: false,
    connectionQuality: null,
    participant: {
      userId: `u-${overrides.id}`,
      displayName: overrides.displayName,
      avatar: overrides.localAvatar,
      user: {
        username: overrides.displayName.toLowerCase(),
        displayName: `${overrides.displayName} Account`,
        avatar: overrides.accountAvatar,
      },
    },
  };
}

function makePrisma(): PrismaClient {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([{ conversationId: CONV_ID }]),
    },
    callSession: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: CALL_ID }]),
    },
    callParticipant: {
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  } as unknown as PrismaClient;
}

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-avatar-1',
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
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
  };
  return { io };
}

function initiatedPayloadFrom(directEmit: jest.MockedFunction<any>): any {
  const call = directEmit.mock.calls.find((c: any[]) => c[0] === CALL_EVENTS.INITIATED);
  return call?.[1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CallEventsHandler — call:check-active replayed avatar resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateIceServers.mockReturnValue([]);
    mockGetCallSession.mockResolvedValue({
      id: CALL_ID,
      conversationId: CONV_ID,
      mode: 'p2p',
      metadata: { type: 'audio' },
      initiator: { id: 'initiator', username: 'alice', displayName: 'Alice', avatar: null },
      participants: [
        makeParticipant({ id: 'a', localAvatar: LOCAL_AVATAR, accountAvatar: ACCOUNT_AVATAR_BOB, displayName: 'Bob' }),
        makeParticipant({ id: 'b', localAvatar: '   ', accountAvatar: ACCOUNT_AVATAR_CAROL, displayName: 'Carol' }),
      ],
    });
  });

  it('prefers the local participant avatar over the account avatar (SSOT order)', async () => {
    const prisma = makePrisma();
    const { socket, handlers, directEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers[CLIENT_EVENTS.CALL_CHECK_ACTIVE]();

    const payload = initiatedPayloadFrom(directEmit);
    expect(payload).toBeDefined();
    expect(payload.participants[0].avatar).toBe(LOCAL_AVATAR);
    expect(payload.participants[0].avatar).not.toBe(ACCOUNT_AVATAR_BOB);
  });

  it('treats a blank local avatar as absent and falls back to the account avatar', async () => {
    const prisma = makePrisma();
    const { socket, handlers, directEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers[CLIENT_EVENTS.CALL_CHECK_ACTIVE]();

    const payload = initiatedPayloadFrom(directEmit);
    expect(payload.participants[1].avatar).toBe(ACCOUNT_AVATAR_CAROL);
  });

  it('never leaks a blank string as the resolved avatar', async () => {
    mockGetCallSession.mockResolvedValue({
      id: CALL_ID,
      conversationId: CONV_ID,
      mode: 'p2p',
      metadata: { type: 'audio' },
      initiator: { id: 'initiator', username: 'alice', displayName: 'Alice', avatar: null },
      participants: [
        makeParticipant({ id: 'c', localAvatar: '', accountAvatar: '  ', displayName: 'Dave' }),
      ],
    });

    const prisma = makePrisma();
    const { socket, handlers, directEmit } = makeSocket();
    const { io } = makeIo();

    const handler = new CallEventsHandler(prisma);
    handler.setupCallEvents(socket as any, io, () => USER_ID);
    await handlers[CLIENT_EVENTS.CALL_CHECK_ACTIVE]();

    const payload = initiatedPayloadFrom(directEmit);
    expect(payload.participants[0].avatar).toBeNull();
  });
});
