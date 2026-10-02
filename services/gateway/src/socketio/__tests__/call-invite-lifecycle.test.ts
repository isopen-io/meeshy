import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { CALL_RING_TIMEOUT_MS } from '@meeshy/shared/types/call-rules';
import { createCallInvitationLifecycle, type PendingCallInvitation } from '../call-invite-lifecycle';

const CALL = '64b7f0c2a1b2c3d4e5f60718';
const CONV = '64b7f0c2a1b2c3d4e5f60719';
const LEA = '64b7f0c2a1b2c3d4e5f6071a';

type Emission = { readonly room: string; readonly event: string; readonly payload: unknown };

const invitation = (): PendingCallInvitation => ({
  callId: CALL,
  conversationId: CONV,
  inviterUserId: 'alice',
  inviteeUserId: LEA,
  callType: 'video',
});

const DIRECT = '64b7f0c2a1b2c3d4e5f6071b';

const harness = (options: { status?: string; joined?: readonly string[]; invited?: readonly string[]; member?: boolean; direct?: string | null } = {}) => {
  const state = { status: options.status ?? 'active', joined: [...(options.joined ?? [])] };
  const emitted: Emission[] = [];
  const pushes: unknown[] = [];
  const missed: unknown[] = [];
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const conversationReads: unknown[] = [];
  const lifecycle = createCallInvitationLifecycle({
    prisma: {
      callSession: {
        findUnique: async () => ({
          status: state.status,
          invitedUserIds: [...(options.invited ?? [LEA])],
          participants: state.joined.map((userId) => ({ participant: { userId } })),
        }),
      },
      participant: { findFirst: async () => (options.member ? { id: 'p-lea' } : null) },
      conversation: {
        findFirst: async (args: { where: unknown }) => {
          conversationReads.push(args.where);
          const direct = options.direct === undefined ? DIRECT : options.direct;
          return direct ? { id: direct } : null;
        },
      },
    } as never,
    pushService: () => ({ sendToUser: async (push: unknown) => void pushes.push(push) }) as never,
    notificationService: () => ({ createMissedCallNotification: async (params: unknown) => { missed.push(params); return null; } }) as never,
    schedule: (fn, ms) => {
      const timer = { fn, ms, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel: (handle) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
  });
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => void emitted.push({ room, event, payload }) }) } as never;
  const fire = async () => {
    const live = timers.filter((t) => !t.cancelled);
    live.forEach((t) => t.fn());
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { lifecycle, io, state, emitted, pushes, missed, timers, fire, conversationReads };
};

const cancelPushTo = (userId: string) =>
  expect.objectContaining({ userId, payload: expect.objectContaining({ data: { type: 'call_cancel', callId: CALL } }) });

describe('une invitation d’appel se résout toujours : décroché, refusé ou sans réponse (#8470, #8467)', () => {
  it('arme UN minuteur à la durée de la sonnerie d’un appel', () => {
    const h = harness();

    h.lifecycle.arm(h.io, invitation());

    expect(h.timers.map((t) => t.ms)).toEqual([CALL_RING_TIMEOUT_MS]);
  });

  it('sans réponse : l’appel apprend call:invite-expired, la sonnerie de l’invitée s’arrête et elle trouve un appel manqué', async () => {
    const h = harness();
    h.lifecycle.arm(h.io, invitation());

    await h.fire();

    expect(h.emitted).toEqual([
      { room: `call:${CALL}`, event: SERVER_EVENTS.CALL_INVITE_EXPIRED, payload: { callId: CALL, userId: LEA } },
      { room: `user:${LEA}`, event: 'call:ended', payload: { callId: CALL, duration: 0, reason: 'missed' } },
    ]);
    expect(h.pushes).toEqual([cancelPushTo(LEA)]);
    expect(h.missed).toEqual([
      { recipientUserId: LEA, callerId: 'alice', conversationId: DIRECT, callSessionId: CALL, callType: 'video' },
    ]);
  });

  it('une invitée qui a décroché n’a ni expiration, ni annulation, ni appel manqué', async () => {
    const h = harness({ joined: [LEA] });
    h.lifecycle.arm(h.io, invitation());

    await h.fire();

    expect(h.emitted).toEqual([]);
    expect(h.pushes).toEqual([]);
    expect(h.missed).toEqual([]);
  });

  it('refuser : l’appel apprend call:invite-declined, ses autres appareils se taisent, aucun appel manqué', async () => {
    const h = harness();
    h.lifecycle.arm(h.io, invitation());

    expect(await h.lifecycle.decline(h.io, { callId: CALL, userId: LEA })).toBe(true);
    await h.fire();

    expect(h.emitted).toEqual([
      { room: `call:${CALL}`, event: SERVER_EVENTS.CALL_INVITE_DECLINED, payload: { callId: CALL, userId: LEA } },
      { room: `user:${LEA}`, event: 'call:ended', payload: { callId: CALL, duration: 0, reason: 'rejected' } },
    ]);
    expect(h.pushes).toEqual([cancelPushTo(LEA)]);
    expect(h.missed).toEqual([]);
    expect(h.timers.every((t) => t.cancelled)).toBe(true);
  });

  it('un refus de quelqu’un qui n’est pas invité laisse call:end trancher', async () => {
    const h = harness({ invited: [] });

    expect(await h.lifecycle.decline(h.io, { callId: CALL, userId: LEA })).toBe(false);
    expect(h.emitted).toEqual([]);
  });

  it('un refus sur un appel terminé laisse call:end trancher', async () => {
    const h = harness({ status: 'ended' });

    expect(await h.lifecycle.decline(h.io, { callId: CALL, userId: LEA })).toBe(false);
  });

  it('l’appel qui finit avant l’échéance solde l’invitation aussitôt : annulation et appel manqué, sans attendre', async () => {
    const h = harness({ status: 'ended' });
    h.lifecycle.arm(h.io, invitation());

    await h.lifecycle.callEnded(h.io, CALL);

    expect(h.timers.every((t) => t.cancelled)).toBe(true);
    expect(h.emitted).toEqual([]);
    expect(h.pushes).toEqual([cancelPushTo(LEA)]);
    expect(h.missed).toHaveLength(1);
  });

  it('un membre invité dans un appel jamais décroché a déjà son appel manqué par le chemin des membres', async () => {
    const h = harness({ status: 'missed', member: true });
    h.lifecycle.arm(h.io, invitation());

    await h.lifecycle.callEnded(h.io, CALL);

    expect(h.pushes).toEqual([]);
    expect(h.missed).toEqual([]);
  });

  describe('l’appel manqué d’une invitée mène à un lieu qu’elle peut lire (#9115)', () => {
    it('une invitée NON membre est menée à sa conversation directe avec l’inviteur, jamais à la conversation de l’appel', async () => {
      const h = harness();
      h.lifecycle.arm(h.io, invitation());

      await h.fire();

      expect(h.missed).toEqual([expect.objectContaining({ conversationId: DIRECT, callerId: 'alice' })]);
      expect(JSON.stringify(h.conversationReads)).toContain(LEA);
      expect(JSON.stringify(h.conversationReads)).toContain('alice');
    });

    it('sans conversation directe avec l’inviteur, l’appel manqué ne nomme AUCUNE conversation', async () => {
      const h = harness({ direct: null });
      h.lifecycle.arm(h.io, invitation());

      await h.fire();

      expect(h.missed).toEqual([expect.objectContaining({ conversationId: null })]);
    });

    it('une invitée MEMBRE de la conversation y est menée, comme tout membre', async () => {
      const h = harness({ member: true });
      h.lifecycle.arm(h.io, invitation());

      await h.fire();

      expect(h.missed).toEqual([expect.objectContaining({ conversationId: CONV })]);
      expect(h.conversationReads).toEqual([]);
    });
  });

  it('ré-inviter la même personne réarme le minuteur au lieu d’en empiler deux', () => {
    const h = harness();

    h.lifecycle.arm(h.io, invitation());
    h.lifecycle.arm(h.io, invitation());

    expect(h.timers.filter((t) => !t.cancelled)).toHaveLength(1);
  });
});
