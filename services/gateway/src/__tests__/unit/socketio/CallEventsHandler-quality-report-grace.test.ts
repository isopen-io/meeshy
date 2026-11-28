/**
 * CallEventsHandler — call:quality-report reçu juste après la fin de l'appel (#20459)
 *
 * Le client envoie son dernier relevé APRÈS `call:end` : `endCall` a déjà posé
 * `leftAt` sur chaque participant. Ce relevé se persiste s'il arrive dans la
 * fenêtre de grâce, sans jamais déclencher d'alerte de qualité.
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
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../../../services/CallService';

const CALL_ID = '507f1f77bcf86cd799439011';
const USER_ID = 'user-quality-grace';

type Listener = (payload: unknown) => Promise<void>;
type Row = { participantId: string; userId: string; leftAt: Date | null };

const degradedReport = {
  callId: CALL_ID,
  stats: { bytesSent: 900, bytesReceived: 1800, level: 'poor', rtt: 400, packetLoss: 0 },
};

function sessionOf(rows: ReadonlyArray<Row>) {
  return {
    participants: rows.map((row, index) => ({
      id: `cp-${index}`,
      participantId: row.participantId,
      leftAt: row.leftAt,
      participant: { userId: row.userId },
    })),
  };
}

function activeRow(): Row {
  return { participantId: 'participant-1', userId: USER_ID, leftAt: null };
}

function departedRow(msAgo: number): Row {
  return { participantId: 'participant-1', userId: USER_ID, leftAt: new Date(Date.now() - msAgo) };
}

function setup(sessions: ReadonlyArray<ReadonlyArray<Row>>) {
  const getCallSession = jest.fn<(callId: string) => Promise<unknown>>();
  sessions.forEach((rows) => getCallSession.mockResolvedValueOnce(sessionOf(rows)));
  const persistCallStats = jest.fn<(callId: string, stats: unknown) => Promise<void>>().mockResolvedValue(undefined);
  const callService = { getCallSession, persistCallStats, recordHeartbeat: jest.fn() } as unknown as CallService;
  const listeners = new Map<string, Listener>();
  const roomEmit = jest.fn();
  const socket = {
    id: 'socket-grace-1',
    data: {},
    on: jest.fn((event: string, listener: Listener) => listeners.set(event, listener)),
    emit: jest.fn(),
    to: jest.fn((_room: string) => ({ emit: roomEmit })),
  };
  const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
  const handler = new CallEventsHandler({} as PrismaClient, callService);
  handler.setupCallEvents(socket as never, io as never, () => USER_ID);
  const report = (payload: unknown) => {
    const listener = listeners.get(CALL_EVENTS.QUALITY_REPORT);
    if (!listener) throw new Error('quality-report listener missing');
    return listener(payload);
  };
  const streaks = () => (handler as unknown as { qualityDegradedStreaks: Map<string, unknown> }).qualityDegradedStreaks;
  return { report, persistCallStats, socket, io, roomEmit, streaks };
}

describe('CallEventsHandler — call:quality-report après la fin de l\'appel (#20459)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persiste le dernier relevé d\'un participant parti il y a 5 secondes', async () => {
    const { report, persistCallStats } = setup([[departedRow(5_000)]]);

    await report(degradedReport);

    expect(persistCallStats).toHaveBeenCalledWith(CALL_ID, { bytesSent: 900, bytesReceived: 1800, level: 'poor' });
  });

  it('rejette le relevé d\'un participant parti il y a plus de 30 secondes', async () => {
    const { report, persistCallStats } = setup([[departedRow(31_000)]]);

    await report(degradedReport);

    expect(persistCallStats).not.toHaveBeenCalled();
  });

  it('rejette le relevé de quelqu\'un qui n\'a jamais participé à l\'appel', async () => {
    const { report, persistCallStats } = setup([[{ participantId: 'other', userId: 'someone-else', leftAt: null }]]);

    await report(degradedReport);

    expect(persistCallStats).not.toHaveBeenCalled();
  });

  it('n\'émet aucune alerte de qualité pour des relevés dégradés reçus après le départ', async () => {
    const { report, socket, io, persistCallStats } = setup([[departedRow(2_000)], [departedRow(3_000)], [departedRow(4_000)]]);

    await report(degradedReport);
    await report(degradedReport);
    await report(degradedReport);

    expect(persistCallStats).toHaveBeenCalledTimes(3);
    expect(socket.to).not.toHaveBeenCalled();
    expect(io.to).not.toHaveBeenCalled();
  });

  it('libère la série dégradée entamée pendant l\'appel au lieu de la prolonger', async () => {
    const { report, socket, streaks } = setup([[activeRow()], [departedRow(1_000)]]);

    await report(degradedReport);
    expect(streaks().size).toBe(1);

    await report(degradedReport);

    expect(socket.to).not.toHaveBeenCalled();
    expect(streaks().size).toBe(0);
  });

  it('garde l\'alerte du chemin actif : deux relevés dégradés en cours d\'appel alertent le pair', async () => {
    const { report, socket, roomEmit } = setup([[activeRow()], [activeRow()]]);

    await report(degradedReport);
    await report(degradedReport);

    expect(socket.to).toHaveBeenCalledWith(`call:${CALL_ID}`);
    expect(roomEmit).toHaveBeenCalledWith(
      CALL_EVENTS.QUALITY_ALERT,
      expect.objectContaining({ callId: CALL_ID, participantId: 'participant-1', userId: USER_ID, metric: 'rtt' })
    );
  });
});
