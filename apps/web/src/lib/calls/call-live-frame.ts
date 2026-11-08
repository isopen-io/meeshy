import { CALL_LIVE_FRAME_ID_MAX, CALL_LIVE_FRAME_ID_PATTERN, CALL_LIVE_FRAME_REPLIES, CALL_LIVE_FRAME_TEXT_MAX, type CallLiveFrameReply } from '@meeshy/shared/types/call-live-frame-bounds';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { decodeControlAck } from './call-decode';
import { NO_LIVE_FRAME, type CallLiveFrameState, type CallLiveFrameStoreApi } from './call-live-frame-store';
import type { ActiveCall, CallStoreApi } from './call-store';
import type { CallTransport } from './call-transport';
import { callLayout } from './call-view';

/**
 * **LE CADRE EN DIRECT D'UN APPEL À DEUX, CÔTÉ WEB** (#16943, loi 16 de
 * `docs/product/appels-vue-finale.md`, vues C1 à C3) — la session, miroir de
 * `CallLiveFrameSession.swift`, sur le MÊME protocole (#9214, #9287) :
 * `call:frame-select` part, `call:frame-selected` revient
 * (`packages/shared/types/call-live-frame.ts`, relayé par
 * `services/gateway/src/socketio/call-live-frame-events.ts`).
 *
 * Chacun reste libre de son cadre : le mien s'applique tout de suite CHEZ MOI
 * et part à l'autre comme une PROPOSITION, avec le prénom que je partage. Une
 * proposition reçue ne touche jamais à mon cadre — je l'applique ou je la
 * refuse, et l'autre l'apprend. Le cadre tombe localement quand l'appel n'est
 * plus à deux. Ce client n'annonce pas `call-live-frame-group` : le groupe est #12313.
 */

const ACK_TIMEOUT_MS = 8_000;

export function isLiveFrameId(value: string): boolean {
  return value.length > 0 && value.length <= CALL_LIVE_FRAME_ID_MAX && CALL_LIVE_FRAME_ID_PATTERN.test(value);
}

/** L'interrupteur « Cadre » du Montage : toucher le cadre déjà gardé le retire, un autre le garde à sa place. */
export function toggledHold(current: string | null, tapped: string): string | null {
  return current === tapped ? null : tapped;
}

const joined = (call: ActiveCall): boolean => call.phase.kind === 'connected' || call.phase.kind === 'reconnecting';

/** L'appel est à deux, moi compris : la session y vit. */
export function liveFramePair(call: ActiveCall | null): call is ActiveCall {
  return call !== null && call.callId !== null && joined(call) && Object.keys(call.members).length === 1;
}

/** À deux, en vidéo : le cadre se propose et se montre. */
export function liveFrameDuo(call: ActiveCall | null): boolean {
  return liveFramePair(call) && callLayout(call) === 'video-duo';
}

export type DecodedLiveFrame = {
  readonly callId: string;
  readonly userId: string;
  readonly frameId: string | null;
  readonly name: string | null;
  readonly reply: CallLiveFrameReply | null;
};

type Json = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

const isReply = (value: unknown): value is CallLiveFrameReply => (CALL_LIVE_FRAME_REPLIES as readonly unknown[]).includes(value);

const sharedName = (texts: unknown): string | null => {
  const name = isRecord(texts) && typeof texts.name === 'string' ? texts.name.trim() : '';
  return name === '' ? null : name.slice(0, CALL_LIVE_FRAME_TEXT_MAX);
};

/** `call:frame-selected` relu champ par champ ; une forme étrangère rend `null`. */
export function decodeLiveFrameSelected(value: unknown): DecodedLiveFrame | null {
  if (!isRecord(value) || typeof value.callId !== 'string' || typeof value.userId !== 'string') return null;
  const frameId = value.frameId;
  if (frameId !== null && (typeof frameId !== 'string' || !isLiveFrameId(frameId))) return null;
  if (value.reply !== undefined && !isReply(value.reply)) return null;
  return { callId: value.callId, userId: value.userId, frameId, name: sharedName(value.texts), reply: value.reply ?? null };
}

export type LiveFrameDeps = {
  readonly store: CallLiveFrameStoreApi;
  readonly calls: CallStoreApi;
  readonly transport: () => CallTransport | null;
  /** Le prénom que je partage avec l'autre. */
  readonly myName: () => string;
};

export function createCallLiveFrame(deps: LiveFrameDeps) {
  const state = (): CallLiveFrameState => deps.store.getState();
  const patch = (next: Partial<CallLiveFrameState>): void => deps.store.setState(next);
  const pairCallId = (): string | null => {
    const call = deps.calls.getState().call;
    return liveFramePair(call) ? call.callId : null;
  };
  let pendingReply: Promise<void> = Promise.resolve();

  const send = async (payload: Record<string, unknown>): Promise<boolean> => {
    const transport = deps.transport();
    if (transport === null) return false;
    const ack = await transport.request(CLIENT_EVENTS.CALL_FRAME_SELECT, payload, ACK_TIMEOUT_MS).catch(() => null);
    return decodeControlAck(ack).ok;
  };

  const texts = (): { readonly texts?: { readonly name: string } } => {
    const name = deps.myName().trim().slice(0, CALL_LIVE_FRAME_TEXT_MAX);
    return name === '' ? {} : { texts: { name } };
  };

  const sendReply = async (callId: string, frameId: string, reply: CallLiveFrameReply): Promise<void> => {
    await send({ callId, frameId, ...texts(), reply });
  };

  /** Un autre appel, ou plus d'appel à deux : tout s'efface, sans rien envoyer. */
  const follow = (callId: string | null): void => {
    if (callId === state().callId) return;
    deps.store.setState({ ...NO_LIVE_FRAME, callId }, true);
  };

  const apply = async (id: string | null): Promise<void> => {
    const callId = pairCallId();
    if (callId === null || (id !== null && !isLiveFrameId(id))) return;
    follow(callId);
    const { sentProposal, peerFrameId } = state();
    patch({ frameId: id, answer: null, notice: null });
    if (id === null) {
      if (sentProposal === null) return;
      patch({ sentProposal: null });
      await send({ callId, frameId: null });
      return;
    }
    if (id === peerFrameId) return;
    patch({ sentProposal: id });
    const proposed = await send({ callId, frameId: id, ...texts() });
    if (proposed || state().callId !== callId || state().sentProposal !== id) return;
    patch({ sentProposal: null, notice: 'not-proposed' });
  };

  const accept = async (): Promise<void> => {
    const { proposal, callId } = state();
    if (proposal === null || callId === null) return;
    patch({ proposal: null, frameId: proposal.frameId, peerFrameId: proposal.frameId });
    await sendReply(callId, proposal.frameId, 'accepted');
  };

  const decline = async (): Promise<void> => {
    const { proposal, callId } = state();
    if (proposal === null || callId === null) return;
    patch({ proposal: null });
    await sendReply(callId, proposal.frameId, 'declined');
  };

  const receiveReply = (reply: CallLiveFrameReply, answered: string | null): void => {
    const { sentProposal, remoteSharedName } = state();
    if (answered === null || answered !== sentProposal) return;
    patch({ sentProposal: null, answer: { frameId: answered, reply, from: remoteSharedName }, ...(reply === 'accepted' ? { peerFrameId: answered } : {}) });
  };

  const receive = (event: string, payload: unknown): void => {
    if (event !== SERVER_EVENTS.CALL_FRAME_SELECTED) return;
    const decoded = decodeLiveFrameSelected(payload);
    const callId = pairCallId();
    if (decoded === null || callId === null || decoded.callId !== callId) return;
    follow(callId);
    if (decoded.name !== null) patch({ remoteSharedName: decoded.name });
    if (decoded.reply !== null) {
      receiveReply(decoded.reply, decoded.frameId);
      return;
    }
    const id = decoded.frameId;
    patch({ peerFrameId: id });
    if (id === null) {
      patch({ proposal: null });
      return;
    }
    if (id === state().frameId) {
      patch({ proposal: null });
      pendingReply = sendReply(callId, id, 'accepted');
      return;
    }
    patch({ proposal: { frameId: id, from: state().remoteSharedName } });
  };

  let unsubscribe: (() => void) | null = null;

  return {
    apply,
    accept,
    decline,
    receive,
    /** Attend la réponse que la session envoie d'elle-même. */
    settle: (): Promise<void> => pendingReply,
    dismissAnswer: (): void => patch({ answer: null }),
    dismissNotice: (): void => patch({ notice: null }),
    /** Suit l'appel : un autre appel, ou un appel qui n'est plus à deux, efface le cadre. */
    start: (): void => {
      unsubscribe ??= deps.calls.subscribe(() => follow(pairCallId()));
      follow(pairCallId());
    },
    stop: (): void => {
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

export type CallLiveFrame = ReturnType<typeof createCallLiveFrame>;
