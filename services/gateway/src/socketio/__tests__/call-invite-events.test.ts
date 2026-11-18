import { describe, it, expect, jest } from '@jest/globals';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallControlAck, CallControlErrorCode } from '@meeshy/shared/types/call-controls';
import { registerCallInviteEvents, type CallInviteRing } from '../call-invite-events';
import type { PendingCallInvitation } from '../call-invite-lifecycle';
import type { RebranchOutcome } from '../../services/calls/callConversationRebranch';

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

const GROUP = '64b7f0c2a1b2c3d4e5f6071b';

type Route = 'admit-member' | 'rebranch' | 'legacy-guest';

const grant = (route: Route = 'legacy-guest', inviteeIsMember = false) => ({
  ok: true as const,
  session: { ...session(), participants: [{ leftAt: null, participant: { userId: 'alice' } }, { leftAt: null, participant: { userId: 'bob' } }] } as never,
  inviter: { userId: 'alice', username: 'alice', displayName: 'Alice', avatar: null },
  invitee: { userId: DAVE, username: 'dave', displayName: 'Dave', avatar: 'https://cdn/dave.png' },
  activeCount: 2,
  route,
  conversation: { id: CONV, type: route === 'admit-member' ? 'group' : 'direct', encryptionMode: route === 'legacy-guest' ? 'e2ee' : 'server', isActive: true, closedAt: null, communityId: null },
  community: null,
  inviteeIsMember,
});

type Emission = { room: string; event: string; payload: unknown };

const harness = (options: {
  userId?: string;
  refusal?: CallControlErrorCode;
  ringFails?: boolean;
  route?: Route;
  inviteeIsMember?: boolean;
  rebranch?: RebranchOutcome;
  admitted?: string;
} = {}) => {
  const handlers = new Map<string, (raw: unknown, ack?: (r: CallControlAck) => void) => Promise<void>>();
  const emitted: Emission[] = [];
  const rings: CallInviteRing[] = [];
  const armed: PendingCallInvitation[] = [];
  const record = jest.fn(async (_session: unknown, _invitee: string) => undefined);
  const authorize = jest.fn(async (_input: unknown) =>
    options.refusal ? { ok: false as const, code: options.refusal } : grant(options.route, options.inviteeIsMember)
  );
  const order: string[] = [];
  const rebranch = jest.fn(async (_input: unknown): Promise<RebranchOutcome> => {
    order.push('rebranch');
    return options.rebranch ?? { kind: 'rebranched', conversationId: GROUP, title: null, created: true, memberUserIds: ['alice', 'bob', DAVE] };
  });
  const admit = jest.fn(async (_input: unknown) => {
    order.push('admit');
    return (options.admitted ?? 'new') as never;
  });
  registerCallInviteEvents(
    {
      io: { to: (room: string) => ({ emit: (event: string, payload: unknown) => { order.push(event); emitted.push({ room, event, payload }); } }) } as never,
      rateLimiter: { checkLimit: async () => true },
      authorize,
      record,
      rebranch,
      admit,
      credit: () => undefined,
      armExpiry: (invitation) => void armed.push(invitation),
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
  return { invite, emitted, rings, record, authorize, armed, rebranch, admit, order };
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
    expect(h.armed).toEqual([]);
  });

  it('une sonnerie en panne n’annule pas l’invitation déjà notée', async () => {
    const h = harness({ ringFails: true });

    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: true });
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.armed).toHaveLength(1);
  });

  it('arme l’échéance de l’invitation : sans réponse, l’inviteur l’apprendra (#8470, #8467)', async () => {
    const h = harness();

    await h.invite({ callId: CALL, userId: DAVE });

    expect(h.armed).toEqual([
      { callId: CALL, conversationId: CONV, inviterUserId: 'alice', inviteeUserId: DAVE, callType: 'video' },
    ]);
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

describe('call:invite-participant — inviter, c’est faire entrer dans la conversation de l’appel (#19650)', () => {
  it('appel de groupe : l’invité devient membre, PUIS il sonne dans ce groupe', async () => {
    const h = harness({ route: 'admit-member' });

    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: true });
    expect(h.admit).toHaveBeenCalledWith({ conversationId: CONV, inviterUserId: 'alice', inviteeUserId: DAVE, community: null });
    expect(h.order).toEqual(['admit', SERVER_EVENTS.CALL_PARTICIPANT_INVITED]);
    expect(h.rings[0]).toMatchObject({ conversationId: CONV });
    expect(h.rebranch).not.toHaveBeenCalled();
  });

  it('appel de groupe, invité déjà membre : il sonne seulement', async () => {
    const h = harness({ route: 'admit-member', inviteeIsMember: true });
    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: true });
    expect(h.admit).not.toHaveBeenCalled();
    expect(h.rings).toHaveLength(1);
  });

  it('une admission refusée n’invite personne', async () => {
    const h = harness({ route: 'admit-member', admitted: 'banned' });
    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: false, code: 'PERMISSION_DENIED' });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.rings).toEqual([]);
  });

  it('appel en tête-à-tête : il bascule vers le groupe, et la sonnerie porte le groupe', async () => {
    const h = harness({ route: 'rebranch' });

    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: true });
    expect(h.rebranch).toHaveBeenCalledWith({
      callId: CALL,
      fromConversationId: CONV,
      presentUserIds: ['alice', 'bob'],
      inviterUserId: 'alice',
      inviteeUserId: DAVE,
    });
    expect(h.order).toEqual(['rebranch', SERVER_EVENTS.CALL_PARTICIPANT_INVITED]);
    expect(h.rings[0]).toMatchObject({
      conversationId: GROUP,
      event: { conversationId: GROUP, conversationType: 'group', conversationTitle: null, isGroup: true },
    });
    expect(h.armed[0]).toMatchObject({ conversationId: GROUP });
    expect(h.admit).not.toHaveBeenCalled();
  });

  it('course perdue : l’invité entre dans le groupe gagnant, et y sonne', async () => {
    const h = harness({ route: 'rebranch', rebranch: { kind: 'lost', conversationId: GROUP } });

    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: true });
    expect(h.admit).toHaveBeenCalledWith({ conversationId: GROUP, inviterUserId: 'alice', inviteeUserId: DAVE });
    expect(h.rings[0]).toMatchObject({ conversationId: GROUP, event: { conversationType: 'group' } });
  });

  it('une bascule impossible rend INTERNAL_ERROR et n’invite personne', async () => {
    const h = harness({ route: 'rebranch', rebranch: { kind: 'failed' } });
    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: false, code: 'INTERNAL_ERROR' });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.rings).toEqual([]);
  });

  it('tête-à-tête chiffré : l’invité reste l’invité de CET appel, aucun groupe (D3)', async () => {
    const h = harness({ route: 'legacy-guest' });
    expect(await h.invite({ callId: CALL, userId: DAVE })).toEqual({ success: true });
    expect(h.rebranch).not.toHaveBeenCalled();
    expect(h.admit).not.toHaveBeenCalled();
    expect(h.rings[0]).toMatchObject({ conversationId: CONV });
  });
});
