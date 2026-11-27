/**
 * CallEventsHandler — un relevé de qualité tardif rafraîchit la bulle de résumé (#20709)
 *
 * Le dernier `call:quality-report` arrive après `call:end` (#20459), quand le
 * résumé « Appel … » est déjà posté. S'il a changé une mesure persistée, la
 * bulle est éditée en place et rediffusée par le diffuseur `message:edited`
 * déjà branché ; un relevé d'appel en cours ne touche jamais au résumé.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn(),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(() => ({ success: true })),
  isValidationFailure: jest.fn(() => false),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: jest.fn(), destroy: jest.fn() })),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn(), destroy: jest.fn() }),
  checkSocketRateLimit: jest.fn(async () => true),
  SOCKET_RATE_LIMITS: {
    CALL_HEARTBEAT: { maxRequests: 12, windowMs: 60000, keyPrefix: 'socket:call:heartbeat' },
    CALL_QUALITY_REPORT: { maxRequests: 30, windowMs: 60000, keyPrefix: 'socket:call:quality' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { buildCallSummaryMetadata } from '@meeshy/shared/utils/call-summary';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../../../services/CallService';

const CALL_ID = '507f1f77bcf86cd799439022';
const CONVERSATION_ID = '507f1f77bcf86cd799439033';
const USER_ID = '507f1f77bcf86cd799439044';

type Listener = (payload: unknown) => Promise<void>;

const lateReport = {
  callId: CALL_ID,
  stats: { bytesSent: 4_000, bytesReceived: 8_000, level: 'poor', rtt: 80, packetLoss: 0 },
};

const callRow = {
  id: CALL_ID,
  conversationId: CONVERSATION_ID,
  initiatorId: USER_ID,
  status: 'ended',
  endReason: 'completed',
  duration: 60,
  answeredAt: new Date('2026-11-27T09:00:00Z'),
  metadata: { type: 'audio' },
  bytesSent: 4_000,
  bytesReceived: 8_000,
  bytesSentTotal: 4_000,
  bytesReceivedTotal: 8_000,
  networkQuality: 'poor',
};

const postedMetadata = buildCallSummaryMetadata({
  status: 'ended',
  endReason: 'completed',
  callType: 'audio',
  durationSeconds: 60,
  callId: CALL_ID,
  initiatorId: USER_ID,
  bytesSent: 1_000,
  bytesReceived: 2_000,
  networkQuality: 'good',
});

function setup(options: { departed: boolean; statsChanged: boolean }) {
  const leftAt = options.departed ? new Date(Date.now() - 3_000) : null;
  const getCallSession = jest.fn(async () => ({
    participants: [{ id: 'cp-1', participantId: 'participant-1', leftAt, participant: { userId: USER_ID } }],
  }));
  const persistCallStats = jest.fn(async () => options.statsChanged);
  const callService = { getCallSession, persistCallStats, recordHeartbeat: jest.fn() } as unknown as CallService;
  const state = { metadata: postedMetadata as unknown };
  const message = () => ({
    id: 'message-summary-1',
    conversationId: CONVERSATION_ID,
    content: 'Appel audio · 01:00',
    metadata: state.metadata,
    updatedAt: new Date('2026-11-27T09:01:00Z'),
    sender: null,
    attachments: [],
  });
  const prisma = {
    callSession: { findUnique: jest.fn(async () => callRow) },
    message: {
      findFirst: jest.fn(async () => message()),
      updateMany: jest.fn(async (args: { data: { metadata: unknown } }) => {
        state.metadata = args.data.metadata;
        return { count: 1 };
      }),
      findUnique: jest.fn(async () => message()),
    },
    participant: { findMany: jest.fn(async () => []) },
  };
  const listeners = new Map<string, Listener>();
  const socket = {
    id: 'socket-late-1',
    data: {},
    on: jest.fn((event: string, listener: Listener) => listeners.set(event, listener)),
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  };
  const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
  const handler = new CallEventsHandler(prisma as unknown as PrismaClient, callService);
  const edited = jest.fn(async (_message: unknown, _conversationId: string) => undefined);
  const created = jest.fn(async (_message: unknown, _conversationId: string) => undefined);
  handler.setMessageUpdateBroadcaster(edited);
  handler.setMessageBroadcaster(created);
  handler.setupCallEvents(socket as never, io as never, () => USER_ID);
  const report = (payload: unknown) => {
    const listener = listeners.get(CALL_EVENTS.QUALITY_REPORT);
    if (!listener) throw new Error('quality-report listener missing');
    return listener(payload);
  };
  return { report, edited, created, prisma };
}

describe('CallEventsHandler — un relevé tardif rafraîchit la bulle de résumé (#20709)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('édite le résumé et le rediffuse en message:edited quand le relevé tardif a changé une mesure', async () => {
    const { report, edited, created } = setup({ departed: true, statsChanged: true });

    await report(lateReport);

    expect(edited).toHaveBeenCalledTimes(1);
    const [served, conversationId] = edited.mock.calls[0];
    expect(conversationId).toBe(CONVERSATION_ID);
    expect((served as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      kind: 'call',
      bytesTotal: 12_000,
      networkQuality: 'poor',
    });
    expect(created).not.toHaveBeenCalled();
  });

  it('ne touche pas au résumé quand le relevé tardif n’a rien changé', async () => {
    const { report, edited, prisma } = setup({ departed: true, statsChanged: false });

    await report(lateReport);

    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(edited).not.toHaveBeenCalled();
  });

  it('un relevé d’appel en cours ne relit jamais le résumé', async () => {
    const { report, edited, prisma } = setup({ departed: false, statsChanged: true });

    await report(lateReport);

    expect(prisma.message.findFirst).not.toHaveBeenCalled();
    expect(edited).not.toHaveBeenCalled();
  });
});
