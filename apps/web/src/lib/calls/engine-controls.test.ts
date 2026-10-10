import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { createCallNoticeStore, createCallReactionStore, REACTION_LIFETIME_MS, REACTION_MAX_PER_WINDOW, REACTION_MAX_SHOWN, REACTION_WINDOW_MS } from './call-control-state';
import { createCallStore, withMember, type ActiveCall, type CallMember } from './call-store';
import { baseCall } from './engine-session';
import { createEngineControls, INVITE_RING_MS } from './engine-controls';
import { CALL_RING_TIMEOUT_MS } from '@meeshy/shared/types/call-rules';

/**
 * LES CONTRÔLES D'UN APPEL EN COURS, CÔTÉ MOTEUR (#8433, #8438, #8439) —
 * inviter (retour immédiat, défait si l'accusé refuse), couper un micro, être
 * coupé, réagir. La passerelle et l'horloge sont des doublures : ces témoins
 * prouvent ce qui part, ce que l'écran lit, et ce qui revient en arrière.
 */

const ME = 'u-me';
const PEER = 'u-peer';
const CALL = 'call-1';

const member = (userId: string, patch: Partial<CallMember> = {}): CallMember => ({
  userId,
  name: userId === PEER ? 'Nadia' : userId,
  avatar: null,
  micMuted: false,
  cameraOn: false,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'connected',
  ...patch,
});

const connected = (): ActiveCall =>
  withMember(
    { ...baseCall({ conversationId: 'conv-1', media: 'audio', title: 'Nadia', avatar: null, isGroup: false }, 'outgoing', { kind: 'connected' }), callId: CALL, initiatorId: ME },
    member(PEER),
  );

function harness(options: { readonly acks?: Record<string, unknown>; readonly call?: ActiveCall | null } = {}) {
  const store = createCallStore();
  store.setState({ call: options.call === undefined ? connected() : options.call });
  const reactions = createCallReactionStore();
  const notices = createCallNoticeStore();
  const requested: Array<readonly [string, unknown]> = [];
  const timers = new Map<number, { fn: () => void; at: number }>();
  let clock = 10_000;
  let nextTimer = 1;
  let selfMutes = 0;
  const controls = createEngineControls({
    read: () => store.getState().call,
    update: (fn) => {
      const call = store.getState().call;
      if (call !== null) store.setState({ call: fn(call) });
    },
    request: async (event, payload) => {
      requested.push([event, payload]);
      return options.acks?.[event] ?? { success: true };
    },
    viewerId: () => ME,
    now: () => clock,
    schedule: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, at: clock + ms });
      return id;
    },
    cancel: (handle) => void timers.delete(handle as number),
    muteSelf: () => {
      selfMutes += 1;
      const call = store.getState().call;
      if (call !== null) store.setState({ call: { ...call, micMuted: true } });
    },
    reactions,
    notices,
  });
  const advance = (ms: number): void => {
    clock += ms;
    for (const [id, timer] of [...timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= clock) {
        timers.delete(id);
        timer.fn();
      }
    }
  };
  return { store, reactions, notices, requested, controls, advance, call: () => store.getState().call, selfMutes: () => selfMutes };
}

const BRUNO = { userId: 'u-bruno', name: 'Bruno', avatar: null };

describe('inviter une personne (#8433)', () => {
  test('l’invité sonne AUSSITÔT, l’appel devient de groupe, et l’invitation part', async () => {
    const h = harness();
    const sent = h.controls.invite(BRUNO);
    expect(h.call()?.members['u-bruno']?.link).toBe('ringing');
    expect(h.call()?.isGroup).toBe(true);
    await sent;
    expect(h.requested).toEqual([[CLIENT_EVENTS.CALL_INVITE_PARTICIPANT, { callId: CALL, userId: 'u-bruno' }]]);
    expect(h.call()?.members['u-bruno']?.link).toBe('ringing');
  });

  test('un refus défait la sonnerie, rend le duo, et dit pourquoi', async () => {
    const h = harness({ acks: { [CLIENT_EVENTS.CALL_INVITE_PARTICIPANT]: { success: false, code: 'NOT_A_CONTACT' } } });
    await h.controls.invite(BRUNO);
    expect(h.call()?.members['u-bruno']).toBeUndefined();
    expect(h.call()?.isGroup).toBe(false);
    expect(h.notices.getState().notice).toEqual({ kind: 'invite-failed', code: 'NOT_A_CONTACT', name: 'Bruno' });
  });

  test('personne déjà dans l’appel, ou appel pas connecté : rien ne part', async () => {
    const h = harness();
    await h.controls.invite({ userId: PEER, name: 'Nadia', avatar: null });
    expect(h.requested).toEqual([]);
    const ringing = harness({ call: { ...connected(), phase: { kind: 'outgoing' } } });
    await ringing.controls.invite(BRUNO);
    expect(ringing.requested).toEqual([]);
  });

  test('call:participant-invited fait sonner l’invité chez tous — même un duo devient groupe', () => {
    const h = harness();
    h.controls.receive(SERVER_EVENTS.CALL_PARTICIPANT_INVITED, { callId: CALL, invitedBy: PEER, invitee: { userId: 'u-chloe', username: 'chloe', displayName: 'Chloé' }, participantCount: 2, isGroup: true });
    expect(h.call()?.members['u-chloe']).toMatchObject({ name: 'Chloé', link: 'ringing' });
    expect(h.call()?.isGroup).toBe(true);
  });

  test('l’invitation d’un autre appel, ou de moi-même, est ignorée', () => {
    const h = harness();
    h.controls.receive(SERVER_EVENTS.CALL_PARTICIPANT_INVITED, { callId: 'other', invitee: { userId: 'u-chloe', username: 'chloe' } });
    h.controls.receive(SERVER_EVENTS.CALL_PARTICIPANT_INVITED, { callId: CALL, invitee: { userId: ME, username: 'me' } });
    expect(Object.keys(h.call()?.members ?? {})).toEqual([PEER]);
  });

  test('une invitation sans réponse cesse de sonner après INVITE_RING_MS et le dit ; un invité qui a décroché reste', async () => {
    const h = harness();
    await h.controls.invite(BRUNO);
    h.controls.receive(SERVER_EVENTS.CALL_PARTICIPANT_INVITED, { callId: CALL, invitee: { userId: 'u-chloe', username: 'chloe' } });
    h.store.setState({ call: withMember(h.call() as ActiveCall, member('u-chloe', { link: 'connecting' })) });
    h.advance(INVITE_RING_MS);
    expect(h.call()?.members['u-bruno']).toBeUndefined();
    expect(h.call()?.members['u-chloe']?.link).toBe('connecting');
    expect(h.notices.getState().notice).toEqual({ kind: 'invite-unanswered', name: 'Bruno' });
  });

  test('la passerelle tranche avant le filet local : sa sonnerie (45 s) finit avant INVITE_RING_MS', () => {
    expect(INVITE_RING_MS).toBeGreaterThan(CALL_RING_TIMEOUT_MS);
  });
});

describe('l’invitation se résout : refusée ou sans réponse (#8470)', () => {
  test('call:invite-declined retire la puce « Sonne… » et dit « Bruno a refusé »', async () => {
    const h = harness();
    await h.controls.invite(BRUNO);

    h.controls.receive(SERVER_EVENTS.CALL_INVITE_DECLINED, { callId: CALL, userId: 'u-bruno' });

    expect(h.call()?.members['u-bruno']).toBeUndefined();
    expect(h.notices.getState().notice).toEqual({ kind: 'invite-declined', name: 'Bruno' });
  });

  test('call:invite-expired retire la puce et dit « Bruno n’a pas répondu »', async () => {
    const h = harness();
    await h.controls.invite(BRUNO);

    h.controls.receive(SERVER_EVENTS.CALL_INVITE_EXPIRED, { callId: CALL, userId: 'u-bruno' });

    expect(h.call()?.members['u-bruno']).toBeUndefined();
    expect(h.notices.getState().notice).toEqual({ kind: 'invite-unanswered', name: 'Bruno' });
  });

  test('un participant déjà relié, un autre appel ou une charge malformée ne changent rien', async () => {
    const h = harness();
    await h.controls.invite(BRUNO);

    h.controls.receive(SERVER_EVENTS.CALL_INVITE_DECLINED, { callId: CALL, userId: PEER });
    h.controls.receive(SERVER_EVENTS.CALL_INVITE_EXPIRED, { callId: 'other', userId: 'u-bruno' });
    h.controls.receive(SERVER_EVENTS.CALL_INVITE_EXPIRED, { callId: CALL });

    expect(h.call()?.members[PEER]?.link).toBe('connected');
    expect(h.call()?.members['u-bruno']?.link).toBe('ringing');
    expect(h.notices.getState().notice).toBeNull();
  });
});

describe('couper le micro d’un participant (#8438)', () => {
  test('la tuile se coupe aussitôt et la demande part', async () => {
    const h = harness();
    const sent = h.controls.muteParticipant(PEER);
    expect(h.call()?.members[PEER]?.micMuted).toBe(true);
    await sent;
    expect(h.requested).toEqual([[CLIENT_EVENTS.CALL_MUTE_PARTICIPANT, { callId: CALL, targetUserId: PEER }]]);
  });

  test('un refus rend le micro et le dit', async () => {
    const h = harness({ acks: { [CLIENT_EVENTS.CALL_MUTE_PARTICIPANT]: { success: false, code: 'PERMISSION_DENIED' } } });
    await h.controls.muteParticipant(PEER);
    expect(h.call()?.members[PEER]?.micMuted).toBe(false);
    expect(h.notices.getState().notice).toEqual({ kind: 'mute-failed', code: 'PERMISSION_DENIED', name: 'Nadia' });
  });

  test('un micro déjà coupé, ou une personne qui sonne encore, ne demande rien', async () => {
    const h = harness({ call: withMember(connected(), member('u-ring', { link: 'ringing' })) });
    h.store.setState({ call: withMember(h.call() as ActiveCall, member(PEER, { micMuted: true })) });
    await h.controls.muteParticipant(PEER);
    await h.controls.muteParticipant('u-ring');
    expect(h.requested).toEqual([]);
  });
});

describe('être coupé par l’admin (#8438)', () => {
  test('mon micro se coupe par le chemin de mon propre geste, et je sais qui l’a fait', () => {
    const h = harness();
    h.controls.receive(SERVER_EVENTS.CALL_MUTED_BY_MODERATOR, { callId: CALL, byUserId: PEER });
    expect(h.selfMutes()).toBe(1);
    expect(h.call()?.micMuted).toBe(true);
    expect(h.notices.getState().notice).toEqual({ kind: 'muted-by', byUserId: PEER });
  });

  test('déjà coupé : il le reste, sans basculer', () => {
    const h = harness({ call: { ...connected(), micMuted: true } });
    h.controls.receive(SERVER_EVENTS.CALL_MUTED_BY_MODERATOR, { callId: CALL, byUserId: PEER });
    expect(h.selfMutes()).toBe(0);
    expect(h.call()?.micMuted).toBe(true);
  });

  test('un autre appel ne coupe rien', () => {
    const h = harness();
    h.controls.receive(SERVER_EVENTS.CALL_MUTED_BY_MODERATOR, { callId: 'other', byUserId: PEER });
    expect(h.selfMutes()).toBe(0);
    expect(h.notices.getState().notice).toBeNull();
  });
});

describe('réagir (#8439)', () => {
  test('ma réaction s’affiche AUSSITÔT, part, puis s’efface après sa durée', () => {
    const h = harness();
    expect(h.controls.react('🎉')).toBe(true);
    expect(h.reactions.getState().bursts).toMatchObject([{ emoji: '🎉', userId: null }]);
    expect(h.requested).toEqual([[CLIENT_EVENTS.CALL_REACTION, { callId: CALL, emoji: '🎉' }]]);
    h.advance(REACTION_LIFETIME_MS);
    expect(h.reactions.getState().bursts).toEqual([]);
  });

  test('au-delà du débit, rien ne part ni ne s’affiche ; la fenêtre passée, on repart', () => {
    const h = harness();
    const sent = Array.from({ length: REACTION_MAX_PER_WINDOW + 2 }, () => h.controls.react('👍'));
    expect(sent.filter(Boolean)).toHaveLength(REACTION_MAX_PER_WINDOW);
    expect(h.requested).toHaveLength(REACTION_MAX_PER_WINDOW);
    h.advance(REACTION_WINDOW_MS);
    expect(h.controls.react('👍')).toBe(true);
  });

  test('une réaction reçue s’affiche avec son auteur ; jamais plus de REACTION_MAX_SHOWN à la fois', () => {
    const h = harness();
    for (let index = 0; index < REACTION_MAX_SHOWN + 3; index += 1) h.controls.receive(SERVER_EVENTS.CALL_REACTION_RECEIVED, { callId: CALL, userId: PEER, emoji: '❤️', at: 'x' });
    expect(h.reactions.getState().bursts).toHaveLength(REACTION_MAX_SHOWN);
    expect(h.reactions.getState().bursts[0]).toMatchObject({ userId: PEER, emoji: '❤️' });
  });

  test('hors d’un appel connecté, on ne réagit pas', () => {
    const h = harness({ call: { ...connected(), phase: { kind: 'incoming' } } });
    expect(h.controls.react('👍')).toBe(false);
    expect(h.requested).toEqual([]);
  });

  test('la fin de l’appel efface tout', () => {
    const h = harness();
    h.controls.react('🔥');
    h.controls.reset();
    expect(h.reactions.getState().bursts).toEqual([]);
    h.advance(REACTION_LIFETIME_MS);
    expect(h.reactions.getState().bursts).toEqual([]);
  });
});
