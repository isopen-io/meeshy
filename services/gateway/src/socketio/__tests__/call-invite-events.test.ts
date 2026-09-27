import { describe, it, expect, jest } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck, CallControlErrorCode } from '@meeshy/shared/types/call-controls';
import { registerCallInviteEvents, type CallInviteRing } from '../call-invite-events';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const CONV = '64b7f0c2a1b2c3d4e5f60719';
const DAVE = '64b7f0c2a1b2c3d4e5f6071a';

const session = () => ({
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
});

const grant = () => ({
  ok: true as const,
  session: session() as never,
  inviter: { userId: 'alice', username: 'alice', displayName: 'Alice', avatar: null },
  invitee: { userId: DAVE, username: 'dave', displayName: 'Dave', avatar: 'https://cdn/dave.png' },
  activeCount: 2,
});

type Emission = { room: string; event: string; payload: unknown };

const harness = (options: { userId?: string; refusal?: CallControlErrorCode; ringFails?: boolean } = {}) => {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
  const emitted: Emission[] = [];
  const rings: CallInviteRing[] = [];
  const record = jest.fn(async (_session: unknown, _invitee: string) => undefined);
  const authorize = jest.fn(async (_input: unknown) =>
    options.refusal ? { ok: false as const, code: options.refusal } : grant()
  );
  registerCallInviteEvents(
    {
      io: { to: (room: string) => ({ emit: (event: string, payload: unknown) => emitted.push({ room, event, payload }) }) } as never,
      rateLimiter: { checkLimit: async () => true },
      authorize,
      record,
      ring: async (ring) => {
        rings.push(ring);
        if (options.ringFails) throw new Error('push down');
      },
    },
    { id: 'sock-1', on: (event: string, handler: never) => handlers.set(event, handler) } as never,
    () => ('userId' in options ? options.userId : 'alice')
  );
  const invite = async (raw: unknown) => {
    const acks: CallControlAck[] = [];
    await handlers.get(CLIENT_EVENTS.CALL_INVITE_PARTICIPANT)?.(raw, (r) => acks.push(r));
    return acks[0];
  };
  return { invite, emitted, rings, record, authorize };
};

describe('call:invite-participant — faire sonner un ami dans l’appel en cours (#8433)', () => {
  it('note l’invitation, annonce le passage en groupe aux participants et fait sonner l’invité', async () => {
    const h = harness();

    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: true });
    expect(h.authorize).toHaveBeenCalledWith({ callId: CALL, inviterUserId: 'alice', inviteeUserId: DAVE });
    expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ id: CALL }), DAVE);
    expect(h.emitted).toEqual([
      {
        room: `call:${CALL}`,
        event: SERVER_EVENTS.CALL_PARTICIPANT_INVITED,
        payload: {
          callId: CALL,
          invitedBy: 'alice',
          invitee: { userId: DAVE, username: 'dave', displayName: 'Dave', avatar: 'https://cdn/dave.png' },
          participantCount: 2,
          isGroup: true,
        },
      },
    ]);
    expect(h.rings).toHaveLength(1);
    expect(h.rings[0]).toMatchObject({
      callId: CALL,
      conversationId: CONV,
      inviterUserId: 'alice',
      inviterName: 'Alice',
      inviteeUserId: DAVE,
      event: {
        callId: CALL,
        type: 'video',
        isGroup: true,
        invitedBy: { userId: 'alice', username: 'alice', displayName: 'Alice' },
      },
    });
  });

  it('une invitation refusée ne note rien, n’annonce rien, ne fait sonner personne', async () => {
    const h = harness({ refusal: 'NOT_A_CONTACT' });

    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: false, code: 'NOT_A_CONTACT' });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.emitted).toEqual([]);
    expect(h.rings).toEqual([]);
  });

  it('une sonnerie en panne n’annule pas l’invitation déjà notée', async () => {
    const h = harness({ ringFails: true });

    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: true });
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('refuse un socket non authentifié et une charge malformée avant toute lecture', async () => {
    expect(await harness({ userId: undefined }).invite({ callId: CALL, userId: DAVE }))
      .toEqual({ success: false, code: 'NOT_AUTHENTICATED' });
    const h = harness();
    expect(await h.invite({ callId: CALL })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(await h.invite({ callId: CALL, userId: DAVE, extra: 1 })).toEqual({ success: false, code: 'VALIDATION_ERROR' });
    expect(h.authorize).not.toHaveBeenCalled();
  });
});
