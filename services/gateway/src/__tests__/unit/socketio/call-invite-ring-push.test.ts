/**
 * Une personne invitée dans un appel en cours, réveillée par push VoIP / FCM,
 * ne reçoit jamais `call:initiated` : le push doit lui dire seul que l'appel
 * est de groupe et qui l'invite (#19238). Sans cela, son client remet chaque
 * offre au pair principal, qui n'en tient qu'une.
 */

import { jest, describe, it, expect } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallInitiatedEvent } from '@meeshy/shared/types/video-call';
import { callInviteDependencies } from '../../../socketio/call-invite-events';
import type { CallInvitationLifecycle } from '../../../socketio/call-invite-lifecycle';

const INVITER = '507f1f77bcf86cd799439201';
const INVITEE = '507f1f77bcf86cd799439202';

const event = (overrides: Partial<CallInitiatedEvent> = {}): CallInitiatedEvent => ({
  callId: 'call-1',
  conversationId: 'conv-1',
  mode: 'p2p',
  type: 'video',
  initiator: { userId: '507f1f77bcf86cd799439200', username: 'host' },
  participants: [],
  conversationType: 'direct',
  conversationTitle: null,
  isGroup: true,
  ...overrides,
});

const harness = () => {
  const sendToUser = jest.fn<any>().mockResolvedValue(undefined);
  const prisma = {
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    pushToken: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as unknown as PrismaClient;
  const io = {
    in: jest.fn(() => ({ fetchSockets: jest.fn(async () => []) })),
  };
  const deps = callInviteDependencies({
    io: io as never,
    prisma,
    callService: {
      getCallSession: jest.fn<any>(),
      generateIceServers: jest.fn<any>().mockReturnValue([]),
      activeCallClaim: {} as never,
      createLiveCallMessage: jest.fn<any>(),
    },
    rateLimiter: { checkLimit: jest.fn<any>() },
    pushService: () => ({ sendToUser }) as never,
    invitations: { arm: jest.fn() } as unknown as CallInvitationLifecycle,
  });
  return { deps, sendToUser };
};

describe("call:invite-participant — le push d'appel entrant de l'invité", () => {
  it("porte isGroup, le type de la conversation et l'invitant, sur chaque famille d'appareils", async () => {
    const { deps, sendToUser } = harness();

    await deps.ring({
      callId: 'call-1',
      conversationId: 'conv-1',
      inviterUserId: INVITER,
      inviterName: 'Inviter',
      inviteeUserId: INVITEE,
      event: event(),
    });

    expect(sendToUser).toHaveBeenCalledTimes(2);
    for (const [push] of sendToUser.mock.calls as Array<[{ userId: string; payload: { data: Record<string, string> } }]>) {
      expect(push.userId).toBe(INVITEE);
      expect(push.payload.data).toMatchObject({
        callerUserId: INVITER,
        conversationType: 'direct',
        isGroup: 'true',
        invitedBy: INVITER,
      });
    }
  });
});
