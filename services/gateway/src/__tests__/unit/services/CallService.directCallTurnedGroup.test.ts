/**
 * Un appel né dans une conversation DIRECTE devient un appel de groupe dès
 * qu'une personne y est invitée (#19238, incident du 2026-11-17). Recette du
 * 2026-11-18 : talkieun appelle talkietrois, invite talkiequatre ; quand
 * talkietrois raccroche, la passerelle terminait l'appel pour les DEUX autres,
 * parce que endCall()/leaveCall() décidaient « direct » sur le seul type de la
 * conversation. Le duo se lit par `isDuoCall` : conversation directe ET
 * personne d'invité.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@meeshy/shared/types/video-call', () => ({
  CALL_EVENTS: { ENDED: 'call:ended' },
  CALL_ERROR_CODES: {
    CALL_NOT_FOUND: 'CALL_NOT_FOUND',
    NOT_A_PARTICIPANT: 'NOT_A_PARTICIPANT',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  },
  ACTIVE_STATUSES: ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'],
  TERMINAL_STATUSES: ['ended', 'missed', 'rejected', 'failed'],
  CALL_HISTORY_WINDOW_MS: 3 * 30 * 24 * 60 * 60 * 1000,
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  ROOMS: { call: (id: string) => `call:${id}`, conversation: (id: string) => `conversation:${id}` },
}));

import { CallService } from '../../../services/CallService';
import { CallStatus } from '@meeshy/shared/prisma/client';
import { loneSurvivorOf } from '../../../services/calls/loneSurvivorGrace';

type MockFn = jest.Mock<any>;

const row = (id: string, participantId: string) => ({ id, callSessionId: 'call-1', participantId, leftAt: null });

const callRow = (invitedUserIds: string[], participants = [row('cp-a', 'p-a'), row('cp-b', 'p-b'), row('cp-c', 'p-c')]) => ({
  id: 'call-1',
  conversationId: 'conv-direct',
  status: CallStatus.active,
  version: 3,
  startedAt: new Date(Date.now() - 120_000),
  answeredAt: new Date(Date.now() - 60_000),
  invitedUserIds,
  participants,
  metadata: null,
});

function harness(remainingActive: number) {
  const terminalWrites: unknown[] = [];
  const prisma = {
    callParticipant: { findFirst: jest.fn() as MockFn, update: jest.fn() as MockFn, updateMany: jest.fn() as MockFn, count: jest.fn() as MockFn },
    callSession: { findUnique: jest.fn() as MockFn, findFirst: jest.fn() as MockFn, update: jest.fn() as MockFn, updateMany: jest.fn() as MockFn },
    conversation: { findUnique: (jest.fn() as MockFn).mockResolvedValue({ type: 'direct' }) },
    $transaction: jest.fn() as MockFn,
  };
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      callParticipant: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockImplementation(async (args: unknown) => { terminalWrites.push(args); return { count: 1 }; }),
        count: jest.fn().mockResolvedValue(remainingActive),
      },
      callSession: {
        update: jest.fn().mockImplementation(async (args: unknown) => { terminalWrites.push(args); return { id: 'call-1' }; }),
        updateMany: jest.fn().mockImplementation(async (args: unknown) => { terminalWrites.push(args); return { count: 1 }; }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    })
  );
  const service = new CallService(prisma as never);
  return { prisma, service, terminalWrites };
}

describe('Un appel direct devenu groupe par invitation continue quand un membre part (#19238)', () => {
  let services: CallService[] = [];
  const track = <T extends { service: CallService }>(h: T): T => { services.push(h.service); return h; };

  beforeEach(() => { services = []; });
  afterEach(() => { services.forEach((s) => (s as unknown as { dispose?: () => void }).dispose?.()); });

  it('leaveCall : deux membres restent ⇒ l’appel ne se termine pas', async () => {
    const { prisma, service, terminalWrites } = track(harness(2));
    const call = callRow(['user-c']);
    prisma.callParticipant.findFirst.mockResolvedValue(call.participants[1]);
    prisma.callSession.findUnique.mockResolvedValue(call);

    await service.leaveCall({ callId: 'call-1', userId: 'user-b', participantId: 'p-b' });

    expect(terminalWrites).toEqual([]);
  });

  it('leaveCall : un vrai duo (personne d’invité) se termine toujours au premier départ', async () => {
    const { prisma, service, terminalWrites } = track(harness(1));
    const call = callRow([], [row('cp-a', 'p-a'), row('cp-b', 'p-b')]);
    prisma.callParticipant.findFirst.mockResolvedValue(call.participants[1]);
    prisma.callSession.findUnique.mockResolvedValue(call);

    await service.leaveCall({ callId: 'call-1', userId: 'user-b', participantId: 'p-b' });

    expect(terminalWrites.length).toBeGreaterThan(0);
  });

  it('endCall : raccrocher alors que deux autres restent est un départ, pas une fin pour tous', async () => {
    const { prisma, service } = track(harness(2));
    const call = callRow(['user-c']);
    prisma.callSession.findUnique.mockResolvedValue(call);
    const leave = jest.spyOn(service, 'leaveCall').mockResolvedValue(call as never);

    await service.endCall('call-1', 'user-b', 'p-b');

    expect(leave).toHaveBeenCalledWith(expect.objectContaining({ callId: 'call-1', userId: 'user-b', participantId: 'p-b' }));
  });

  it('leaveCall idempotent : le partant n’a plus de ligne, deux restent ⇒ l’appel continue', async () => {
    const { prisma, service, terminalWrites } = track(harness(2));
    const call = callRow(['user-c'], [row('cp-a', 'p-a'), row('cp-c', 'p-c')]);
    prisma.callParticipant.findFirst.mockResolvedValue(null);
    prisma.callSession.findUnique.mockResolvedValue(call);

    await service.leaveCall({ callId: 'call-1', userId: 'user-b', participantId: 'p-b' });

    expect(terminalWrites).toEqual([]);
  });
});

describe('loneSurvivorOf — un appel direct devenu groupe a lui aussi un dernier survivant (#19238)', () => {
  it('rend le seul actif d’un appel direct où une personne a été invitée', () => {
    const answeredAt = new Date('2026-11-18T08:00:00Z');
    const call = {
      id: 'call-1',
      status: 'active',
      answeredAt,
      invitedUserIds: ['c'],
      conversation: { type: 'direct' },
      participants: [
        { id: 'r-a', participantId: 'p-a', leftAt: null, participant: { userId: 'a' } },
        { id: 'r-b', participantId: 'p-b', leftAt: new Date('2026-11-18T08:05:00Z'), participant: { userId: 'b' } },
      ],
    };
    expect(loneSurvivorOf(call)).toEqual({ callId: 'call-1', userId: 'a', participantId: 'p-a', lastLeaverUserId: 'b' });
  });
});
