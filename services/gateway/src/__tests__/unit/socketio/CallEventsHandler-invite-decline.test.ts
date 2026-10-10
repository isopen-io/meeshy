/**
 * `call:end` `reason: 'rejected'` d'une personne INVITÉE dans un appel en cours
 * (#8470) : elle n'a aucune participation, donc le chemin ordinaire la
 * refusait (`NOT_A_PARTICIPANT`) et l'inviteur ne savait rien. Son refus se
 * dit désormais à l'appel (`call:invite-declined`), qui continue.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockEndCall = jest.fn<any>();
const mockGetCallSession = jest.fn<any>();

jest.mock('../../../services/CallService', () => ({
  ...(jest.requireActual('../../../services/CallService') as object),
  CallService: jest.fn().mockImplementation(() => ({
    endCall: mockEndCall,
    getCallSession: mockGetCallSession,
    clearRingingTimeout: jest.fn(),
    createCallSummaryMessage: jest.fn<any>().mockResolvedValue(null),
    createLiveCallMessage: jest.fn<any>().mockResolvedValue(null),
    resolveEndReason: jest.fn((reason?: string) => reason ?? 'completed'),
  })),
}));

jest.mock('../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));
jest.mock('../../../services/PushNotificationService', () => ({ PushNotificationService: jest.fn() }));
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: jest.fn<any>().mockResolvedValue(true), destroy: jest.fn() })),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn<any>().mockResolvedValue(true), destroy: jest.fn() }),
  checkSocketRateLimit: jest.fn().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: { CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' } },
}));
jest.mock('../../../utils/logger', () => ({ logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS, CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const LEA = 'user-lea';

const harness = (invitedUserIds: readonly string[]) => {
  const prisma = {
    callSession: {
      findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID, status: 'active', invitedUserIds, participants: [] }),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  } as unknown as PrismaClient;
  const handlers: Record<string, (...args: any[]) => any> = {};
  const directEmit = jest.fn<any>();
  const socket = {
    id: 'socket-lea',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => { handlers[event] = fn; }),
    emit: directEmit,
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    leave: jest.fn<any>(),
    rooms: new Set<string>(['socket-lea']),
    data: {},
  };
  const emitted: { room: unknown; event: string; payload: unknown }[] = [];
  const io = {
    to: jest.fn((room: unknown) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) })),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
  };
  const handler = new CallEventsHandler(prisma);
  handler.setupCallEvents(socket as any, io as any, () => LEA);
  const decline = async () => {
    const ack = jest.fn<any>();
    await handlers[CALL_EVENTS.END]({ callId: CALL_ID, reason: 'rejected' }, ack);
    return ack;
  };
  return { decline, emitted, directEmit };
};

describe('call:end — une personne invitée refuse l’appel en cours (#8470)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallSession.mockResolvedValue({
      answeredAt: new Date(),
      participants: [{ participantId: 'p-alice', leftAt: null, participant: { userId: 'alice' } }],
    });
  });

  it('dit le refus à l’appel, qui continue, et accuse le refus', async () => {
    const h = harness([LEA]);

    const ack = await h.decline();

    expect(ack).toHaveBeenCalledWith({ success: true });
    expect(mockEndCall).not.toHaveBeenCalled();
    expect(h.emitted).toContainEqual({
      room: `call:${CALL_ID}`,
      event: SERVER_EVENTS.CALL_INVITE_DECLINED,
      payload: { callId: CALL_ID, userId: LEA },
    });
    expect(h.directEmit).not.toHaveBeenCalledWith(CALL_EVENTS.ERROR, expect.anything());
  });

  it('quelqu’un qui n’est pas invité reste refusé comme avant', async () => {
    const h = harness([]);

    const ack = await h.decline();

    expect(ack).toHaveBeenCalledWith({ success: false });
    expect(h.directEmit).toHaveBeenCalledWith(CALL_EVENTS.ERROR, expect.objectContaining({ code: CALL_ERROR_CODES.NOT_A_PARTICIPANT }));
    expect(h.emitted).toEqual([]);
  });
});
