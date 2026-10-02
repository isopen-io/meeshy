/**
 * `call:invite-participant` crédite `conversation.call_participant_added` à
 * l'INVITEUR (#8959) — sur une invitation nouvelle seulement, jamais sur un
 * refus ni sur une ré-invitation.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck } from '@meeshy/shared/types/call-controls';
import { registerCallInviteEvents } from '../call-invite-events';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const CONV = '64b7f0c2a1b2c3d4e5f60719';
const DAVE = '64b7f0c2a1b2c3d4e5f6071a';

const grant = () => ({
  ok: true as const,
  session: {
    id: CALL,
    conversationId: CONV,
    mode: 'p2p',
    status: 'active',
    metadata: { type: 'video' },
    initiatorId: 'alice',
    invitedUserIds: [],
    initiator: { id: 'alice', username: 'alice', displayName: 'Alice', avatar: null },
    conversation: { type: 'direct', title: null },
    participants: [],
  } as never,
  inviter: { userId: 'alice', username: 'alice', displayName: 'Alice', avatar: null },
  invitee: { userId: DAVE, username: 'dave', displayName: 'Dave', avatar: null },
  activeCount: 2,
});

function harness(options: { refused?: boolean; alreadyInvited?: boolean } = {}) {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
  const credit = jest.fn();
  registerCallInviteEvents(
    {
      io: { to: () => ({ emit: () => undefined }) } as never,
      rateLimiter: { checkLimit: async () => true },
      authorize: async () => (options.refused ? { ok: false as const, code: 'NOT_A_CONTACT' as const } : grant()),
      record: async () => !options.alreadyInvited,
      credit,
      ring: async () => undefined,
    },
    { id: 'sock-1', on: (event: string, handler: never) => handlers.set(event, handler) } as never,
    () => 'alice'
  );
  const invite = async () => {
    const acks: CallControlAck[] = [];
    await handlers.get(CLIENT_EVENTS.CALL_INVITE_PARTICIPANT)?.({ callId: CALL, userId: DAVE }, (r) => acks.push(r));
    return acks[0];
  };
  return { invite, credit };
}

describe('call:invite-participant — conversation.call_participant_added', () => {
  it('crédite l\'inviteur sur une invitation nouvelle', async () => {
    const h = harness();
    expect(await h.invite()).toEqual({ success: true });
    expect(h.credit).toHaveBeenCalledWith({ inviterUserId: 'alice', callId: CALL, conversationId: CONV });
  });

  it('ne crédite pas une ré-invitation de la même personne', async () => {
    const h = harness({ alreadyInvited: true });
    expect(await h.invite()).toEqual({ success: true });
    expect(h.credit).not.toHaveBeenCalled();
  });

  it('ne crédite pas une invitation refusée', async () => {
    const h = harness({ refused: true });
    await h.invite();
    expect(h.credit).not.toHaveBeenCalled();
  });
});

describe('recordCallInvitation — dit si l\'invitation est nouvelle', () => {
  it('rend true à la première invitation, false à la ré-invitation', async () => {
    const { recordCallInvitation } = await import('../../services/calls/callInvitation');
    const prisma = { callSession: { update: jest.fn<any>().mockResolvedValue({}) } };

    await expect(recordCallInvitation(prisma as never, { id: CALL, invitedUserIds: [] }, DAVE)).resolves.toBe(true);
    await expect(recordCallInvitation(prisma as never, { id: CALL, invitedUserIds: [DAVE] }, DAVE)).resolves.toBe(false);
    expect(prisma.callSession.update).toHaveBeenCalledTimes(1);
  });
});
