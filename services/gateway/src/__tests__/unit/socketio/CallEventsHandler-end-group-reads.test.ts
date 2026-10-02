/**
 * call:end — un raccroché ne relit la session et la conversation qu'une fois (#9088)
 *
 * Le gestionnaire résout l'appelant par `getCallSession` (session + type de
 * conversation), puis `CallService.endCall` relisait la session ET la
 * conversation, et sa délégation à `leaveCall` les relisait une troisième
 * fois. Ce qui est déjà lu voyage désormais en paramètre ; la décision
 * « dernier participant » reste prise dans la transaction de `leaveCall`.
 *
 * Témoin de bout en bout : vrai `CallEventsHandler`, vrai `CallService`,
 * Prisma simulé qui compte ses lectures.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn(),
}));

jest.mock('../../../services/PushNotificationService', () => ({
  PushNotificationService: jest.fn(),
}));

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(() => ({ success: true })),
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: jest.fn(), destroy: jest.fn() })),
  getSocketRateLimiter: jest.fn().mockReturnValue({ checkLimit: jest.fn(), destroy: jest.fn() }),
  checkSocketRateLimit: jest.fn<any>().mockResolvedValue(true),
  SOCKET_RATE_LIMITS: {
    CALL_LEAVE: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:call:leave' },
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { CallEventsHandler } from '../../../socketio/CallEventsHandler';
import { CallService } from '../../../services/CallService';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CALL_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439012';
const INITIATOR = 'user-initiator';
const MEMBER = 'user-member';
const OTHER = 'user-other';

type Member = { readonly userId: string; readonly role: 'initiator' | 'participant' };

function participantRow(member: Member) {
  return {
    id: `cp-${member.userId}`,
    callSessionId: CALL_ID,
    participantId: `p-${member.userId}`,
    role: member.role,
    joinedAt: new Date(Date.now() - 60_000),
    leftAt: null,
    isAudioEnabled: true,
    isVideoEnabled: false,
    participant: { id: `p-${member.userId}`, userId: member.userId, displayName: member.userId, user: { id: member.userId, username: member.userId, displayName: member.userId, avatar: null } },
  };
}

function makeWorld(opts: { conversationType: 'direct' | 'group'; members: ReadonlyArray<Member> }) {
  const terminal = { status: null as string | null };
  const session = () => ({
    id: CALL_ID,
    conversationId: CONV_ID,
    initiatorId: INITIATOR,
    mode: 'audio',
    status: terminal.status ?? 'active',
    version: 3,
    answeredAt: new Date(Date.now() - 30_000),
    startedAt: new Date(Date.now() - 40_000),
    endedAt: terminal.status ? new Date() : null,
    endReason: terminal.status ? 'completed' : null,
    duration: terminal.status ? 30 : null,
    metadata: {},
    participants: opts.members.map(participantRow),
    conversation: { id: CONV_ID, identifier: 'conv', type: opts.conversationType, title: null },
  });
  const terminalWrite = jest.fn<any>(async ({ data }: { data: { status: string } }) => {
    terminal.status = data.status;
    return { count: 1 };
  });
  const tx = {
    callParticipant: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      count: jest.fn<any>().mockResolvedValue(opts.members.length - 1),
    },
    callSession: { updateMany: terminalWrite },
  };
  const prisma = {
    callSession: { findUnique: jest.fn<any>(async () => session()), update: jest.fn<any>().mockResolvedValue({}) },
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue({ type: opts.conversationType }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    callParticipant: { findFirst: jest.fn<any>(async ({ where }: { where: { participantId: string } }) => opts.members.map(participantRow).find((p) => p.participantId === where.participantId) ?? null) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
    $transaction: jest.fn<any>(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  return { prisma, terminalWrite };
}

async function hangUp(world: ReturnType<typeof makeWorld>, userId: string) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const roomEmit = jest.fn<any>();
  const socket = {
    id: `socket-${userId}`,
    on: jest.fn((event: string, fn: (...args: any[]) => any) => { handlers[event] = fn; }),
    emit: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: roomEmit }),
    leave: jest.fn<any>(),
    rooms: new Set<string>([`socket-${userId}`, `call:${CALL_ID}`]),
    data: {},
  };
  const io = {
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }),
    in: jest.fn<any>().mockReturnValue({ fetchSockets: jest.fn<any>().mockResolvedValue([]) }),
  };
  const prisma = world.prisma as unknown as PrismaClient;
  const handler = new CallEventsHandler(prisma, new CallService(prisma));
  handler.setupCallEvents(socket as any, io as any, () => userId, () => ({ id: userId, isAnonymous: false }));
  const ack = jest.fn<any>();
  await handlers[CALL_EVENTS.END]({ callId: CALL_ID }, ack);
  handler.destroy();
  const roomEvents = roomEmit.mock.calls.map(([event]) => event);
  return { ack, roomEvents };
}

function sessionLoads(world: ReturnType<typeof makeWorld>) {
  return world.prisma.callSession.findUnique.mock.calls.filter(([args]) => !('select' in (args as object))).length;
}

describe('call:end — session and conversation are read once per hang-up (#9088)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('group hang-up with others still on the call: one session load before the write, no conversation read', async () => {
    const world = makeWorld({ conversationType: 'group', members: [{ userId: INITIATOR, role: 'initiator' }, { userId: MEMBER, role: 'participant' }, { userId: OTHER, role: 'participant' }] });
    const { ack, roomEvents } = await hangUp(world, MEMBER);
    expect(ack).toHaveBeenCalledWith({ success: true });
    expect(roomEvents).toEqual([CALL_EVENTS.PARTICIPANT_LEFT]);
    expect(world.terminalWrite).not.toHaveBeenCalled();
    expect(world.prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(sessionLoads(world)).toBe(2);
  });

  it('group hang-up by the initiator: the call continues for the others', async () => {
    const world = makeWorld({ conversationType: 'group', members: [{ userId: INITIATOR, role: 'initiator' }, { userId: MEMBER, role: 'participant' }, { userId: OTHER, role: 'participant' }] });
    const { ack, roomEvents } = await hangUp(world, INITIATOR);
    expect(ack).toHaveBeenCalledWith({ success: true });
    expect(roomEvents).toEqual([CALL_EVENTS.PARTICIPANT_LEFT]);
    expect(world.terminalWrite).not.toHaveBeenCalled();
  });

  it('1:1 hang-up ends the call for both, without a conversation read', async () => {
    const world = makeWorld({ conversationType: 'direct', members: [{ userId: INITIATOR, role: 'initiator' }, { userId: MEMBER, role: 'participant' }] });
    const { ack, roomEvents } = await hangUp(world, MEMBER);
    expect(ack).toHaveBeenCalledWith({ success: true });
    expect(roomEvents).toEqual([CALL_EVENTS.ENDED]);
    expect(world.terminalWrite).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ended' }) }));
    expect(world.prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(sessionLoads(world)).toBe(2);
  });
});
