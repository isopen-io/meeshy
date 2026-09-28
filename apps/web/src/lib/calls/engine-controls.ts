import type { CallReactionEmoji } from '@meeshy/shared/types/call-control-law';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { decodeControlAck, decodeMutedByModerator, decodeParticipantInvited, decodeReactionReceived, type DecodedPerson } from './call-decode';
import { laneOf, REACTION_LIFETIME_MS, reactionAllowed, recentSends, showNotice, withBurst, withoutBurst, type CallNoticeStoreApi, type CallReactionStoreApi } from './call-control-state';
import { patchMember, withMember, withoutMember, type ActiveCall, type CallMember } from './call-store';

/**
 * **LES CONTRÔLES D'UN APPEL EN COURS, DANS LE MOTEUR** (#8433, #8438, #8439)
 * — composés par `engine.ts`, qui reste seul à écrire l'appel : il leur prête
 * sa lecture, son écriture, sa demande avec accusé et le geste « couper mon
 * micro ». Sortis du moteur pour le garder sous son budget.
 *
 * - **Inviter** : l'invité paraît AUSSITÔT, en tuile qui sonne, et un duo
 *   devient un groupe ; un accusé refusé défait les deux et dit pourquoi.
 *   `call:participant-invited` fait sonner l'invité chez tous. Sans réponse
 *   après `INVITE_RING_MS` (la sonnerie sortante d'iOS), la tuile s'en va.
 * - **Couper un micro** : la tuile se coupe aussitôt ; un refus la rend.
 * - **Être coupé** : par le chemin de MON geste, donc la piste reste coupée et
 *   les autres l'apprennent ; je peux la rouvrir.
 * - **Réagir** : la mienne s'affiche aussitôt ; au-delà du débit, rien.
 */

export const INVITE_RING_MS = 45_000;

export type EngineControlsDeps = {
  readonly read: () => ActiveCall | null;
  readonly update: (fn: (call: ActiveCall) => ActiveCall) => void;
  readonly request: (event: string, payload: unknown) => Promise<unknown>;
  readonly viewerId: () => string;
  readonly now: () => number;
  readonly schedule: (fn: () => void, ms: number) => unknown;
  readonly cancel: (handle: unknown) => void;
  /** Couper MON micro, comme le bouton Micro le fait. */
  readonly muteSelf: () => void;
  readonly reactions: CallReactionStoreApi;
  readonly notices: CallNoticeStoreApi;
};

const joined = (call: ActiveCall | null): call is ActiveCall & { readonly callId: string } =>
  call !== null && call.callId !== null && (call.phase.kind === 'connected' || call.phase.kind === 'reconnecting');

const ringingMember = (person: DecodedPerson): CallMember => ({
  userId: person.userId,
  name: person.name,
  avatar: person.avatar,
  micMuted: false,
  cameraOn: false,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'ringing',
});

export function createEngineControls(deps: EngineControlsDeps) {
  const timers = new Set<unknown>();
  let sentAt: readonly number[] = [];
  let seq = 0;

  const later = (fn: () => void, ms: number): void => {
    const handle = deps.schedule(() => {
      timers.delete(handle);
      fn();
    }, ms);
    timers.add(handle);
  };

  const ring = (person: DecodedPerson): void => {
    deps.update((call) => ({ ...withMember(call, ringingMember(person)), isGroup: true }));
    later(() => deps.update((call) => (call.members[person.userId]?.link === 'ringing' ? withoutMember(call, person.userId) : call)), INVITE_RING_MS);
  };

  const invite = async (person: DecodedPerson): Promise<void> => {
    const call = deps.read();
    if (!joined(call) || person.userId === deps.viewerId() || call.members[person.userId] !== undefined) return;
    const { callId, isGroup } = call;
    ring(person);
    const ack = decodeControlAck(await deps.request(CLIENT_EVENTS.CALL_INVITE_PARTICIPANT, { callId, userId: person.userId }));
    if (ack.ok || deps.read()?.callId !== callId) return;
    deps.update((current) => {
      if (current.members[person.userId]?.link !== 'ringing') return current;
      const without = withoutMember(current, person.userId);
      return { ...without, isGroup: isGroup || Object.keys(without.members).length > 1 };
    });
    showNotice(deps.notices, { kind: 'invite-failed', code: ack.code, name: person.name });
  };

  const muteParticipant = async (userId: string): Promise<void> => {
    const call = deps.read();
    const target = call?.members[userId];
    if (!joined(call) || target === undefined || target.micMuted || target.link === 'ringing') return;
    const { callId } = call;
    deps.update((current) => patchMember(current, userId, { micMuted: true }));
    const ack = decodeControlAck(await deps.request(CLIENT_EVENTS.CALL_MUTE_PARTICIPANT, { callId, targetUserId: userId }));
    if (ack.ok || deps.read()?.callId !== callId) return;
    deps.update((current) => patchMember(current, userId, { micMuted: false }));
    showNotice(deps.notices, { kind: 'mute-failed', code: ack.code, name: target.name });
  };

  const burst = (emoji: CallReactionEmoji, userId: string | null): void => {
    seq += 1;
    const id = seq;
    deps.reactions.setState({ bursts: withBurst(deps.reactions.getState().bursts, { id, emoji, userId, lane: laneOf(id) }) });
    later(() => deps.reactions.setState({ bursts: withoutBurst(deps.reactions.getState().bursts, id) }), REACTION_LIFETIME_MS);
  };

  const react = (emoji: CallReactionEmoji): boolean => {
    const call = deps.read();
    const now = deps.now();
    if (!joined(call) || !reactionAllowed(sentAt, now)) return false;
    sentAt = [...recentSends(sentAt, now), now];
    burst(emoji, null);
    void deps.request(CLIENT_EVENTS.CALL_REACTION, { callId: call.callId, emoji });
    return true;
  };

  const receive = (event: string, payload: unknown): void => {
    const call = deps.read();
    if (!joined(call)) return;
    if (event === SERVER_EVENTS.CALL_PARTICIPANT_INVITED) {
      const invited = decodeParticipantInvited(payload);
      if (invited === null || invited.callId !== call.callId || invited.invitee.userId === deps.viewerId() || call.members[invited.invitee.userId] !== undefined) return;
      ring(invited.invitee);
      return;
    }
    if (event === SERVER_EVENTS.CALL_MUTED_BY_MODERATOR) {
      const muted = decodeMutedByModerator(payload);
      if (muted === null || muted.callId !== call.callId) return;
      if (!call.micMuted) deps.muteSelf();
      showNotice(deps.notices, { kind: 'muted-by', byUserId: muted.byUserId });
      return;
    }
    if (event === SERVER_EVENTS.CALL_REACTION_RECEIVED) {
      const reaction = decodeReactionReceived(payload);
      if (reaction !== null && reaction.callId === call.callId && reaction.userId !== deps.viewerId()) burst(reaction.emoji, reaction.userId);
    }
  };

  const reset = (): void => {
    for (const handle of timers) deps.cancel(handle);
    timers.clear();
    sentAt = [];
    deps.reactions.setState({ bursts: [] });
  };

  return { invite, muteParticipant, react, receive, reset };
}

export type EngineControls = ReturnType<typeof createEngineControls>;
