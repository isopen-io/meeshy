/**
 * call:quality-feedback (#8072) — la note d'après-appel. L'événement était
 * déclaré dans le contrat (`CLIENT_EVENTS.CALL_QUALITY_FEEDBACK`) sans aucun
 * gestionnaire : une note émise se perdait. Elle s'écrit désormais sur la
 * ligne `CallParticipant` de CELUI qui note (la plus récente pour cet appel),
 * comme la télémétrie de fin : deux notes d'un même appel ne s'écrasent pas.
 * L'expéditeur a déjà raccroché quand il note — la garde exige une ligne pour
 * CET appel, quel que soit `leftAt`.
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

const mockCheckSocketRateLimit = jest.fn<any>().mockResolvedValue(true);
jest.mock('../../../utils/socket-rate-limiter', () => ({
  ...(jest.requireActual('../../../utils/socket-rate-limiter') as object),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn(), destroy: jest.fn() }),
  checkSocketRateLimit: (...args: any[]) => mockCheckSocketRateLimit(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = '507f1f77bcf86cd799439011';
const USER_ID = 'user-rater';

function makePrisma() {
  const update = jest.fn<any>().mockResolvedValue({});
  const findFirst = jest.fn<any>().mockResolvedValue({ id: 'cp-latest' });
  const prisma = {
    callSession: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: 'conv' }) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: 'participant-1' }) },
    callParticipant: { findFirst, update },
  } as unknown as PrismaClient;
  return { prisma, update, findFirst };
}

function callServiceWith(participants: readonly { participantId: string; userId: string; leftAt: Date | null }[]) {
  return {
    getCallSession: jest.fn<any>().mockResolvedValue({
      participants: participants.map((p) => ({ participantId: p.participantId, participant: { userId: p.userId }, leftAt: p.leftAt })),
    }),
  } as any;
}

function mount(prisma: PrismaClient, callService: unknown) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const socket = {
    id: 'socket-1',
    on: jest.fn((event: string, fn: (...args: any[]) => any) => {
      handlers[event] = fn;
    }),
    emit: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    rooms: new Set<string>(),
    data: {},
  };
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  new CallEventsHandler(prisma, callService as any).setupCallEvents(socket as any, io as any, () => USER_ID);
  return { handlers, socket };
}

const departed = callServiceWith([{ participantId: 'participant-1', userId: USER_ID, leftAt: new Date() }]);

describe('call:quality-feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckSocketRateLimit.mockResolvedValue(true);
  });

  it('écrit la note sur la ligne CallParticipant la plus récente de celui qui note, même après son départ', async () => {
    const { prisma, update, findFirst } = makePrisma();
    const { handlers } = mount(prisma, departed);

    await handlers[CLIENT_EVENTS.CALL_QUALITY_FEEDBACK]({ callId: CALL_ID, rating: 2, issues: ['echo', 'dropped'] });

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { callSessionId: CALL_ID, participantId: 'participant-1' }, orderBy: { joinedAt: 'desc' } }),
    );
    expect(update).toHaveBeenCalledWith({
      where: { id: 'cp-latest' },
      data: { feedback: { rating: 2, issues: ['echo', 'dropped'], ratedAt: expect.any(String) } },
    });
  });

  it('passe par sa propre limite de débit', async () => {
    const { prisma } = makePrisma();
    const { handlers, socket } = mount(prisma, departed);

    await handlers[CLIENT_EVENTS.CALL_QUALITY_FEEDBACK]({ callId: CALL_ID, rating: 5 });

    expect(mockCheckSocketRateLimit).toHaveBeenCalledWith(
      socket,
      USER_ID,
      expect.objectContaining({ keyPrefix: 'socket:call:quality-feedback' }),
      expect.anything(),
      CALL_EVENTS.ERROR,
    );
  });

  it('ignore la note de quelqu’un qui n’a jamais été dans CET appel', async () => {
    const { prisma, update } = makePrisma();
    const { handlers } = mount(prisma, callServiceWith([{ participantId: 'participant-x', userId: 'someone-else', leftAt: null }]));

    await handlers[CLIENT_EVENTS.CALL_QUALITY_FEEDBACK]({ callId: CALL_ID, rating: 1 });

    expect(update).not.toHaveBeenCalled();
  });

  it('refuse une note hors de 1 à 5 ou un motif inconnu, sans rien écrire', async () => {
    const { prisma, update } = makePrisma();
    const { handlers, socket } = mount(prisma, departed);

    await handlers[CLIENT_EVENTS.CALL_QUALITY_FEEDBACK]({ callId: CALL_ID, rating: 6 });
    await handlers[CLIENT_EVENTS.CALL_QUALITY_FEEDBACK]({ callId: CALL_ID, rating: 3, issues: ['bad-vibes'] });

    expect(update).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith(CALL_EVENTS.ERROR, expect.objectContaining({ callId: CALL_ID }));
  });
});
