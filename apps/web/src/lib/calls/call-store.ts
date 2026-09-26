import { createStore, type StoreApi } from 'zustand/vanilla';

/**
 * **L'ÉTAT D'UN APPEL** (#6382) — le magasin que lisent l'écran d'appel, la
 * pastille, l'en-tête du fil et le journal, et qu'écrit SEUL le moteur
 * (`calls/engine.ts`). Il ne connaît ni WebRTC ni le socket : c'est ce qui
 * permet à la coquille, au fil et au journal de l'importer sans payer le
 * moteur.
 *
 * Miroir de la machine d'`CallManager.swift` (`idle`, `ringing(isOutgoing)`,
 * `connecting`, `connected`, `reconnecting`, `ended(reason)`) et de ses
 * raisons de fin (`CallEndReason`, `WebRTCTypes.swift`).
 */

export type CallMedia = 'audio' | 'video';

export type CallEndReason = 'local' | 'remote' | 'rejected' | 'missed' | 'connectionLost' | 'failed' | 'busy' | 'permission';

export type CallPhase =
  | { readonly kind: 'outgoing' }
  | { readonly kind: 'incoming' }
  | { readonly kind: 'connecting' }
  | { readonly kind: 'connected' }
  | { readonly kind: 'reconnecting' }
  | { readonly kind: 'ended'; readonly reason: CallEndReason; readonly detail: string | null };

export type CallMember = {
  readonly userId: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly micMuted: boolean;
  readonly cameraOn: boolean;
  readonly link: 'waiting' | 'connecting' | 'connected' | 'reconnecting';
};

export type CallCaption = {
  readonly id: string;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly text: string;
  readonly original: string;
  readonly isFinal: boolean;
  readonly at: number;
};

/** `full` : l'écran d'appel ; `pill` : la pastille du haut ; `bubble` : la bulle déplaçable (`CallBubbleView.swift`). */
export type CallDisplay = 'full' | 'pill' | 'bubble';

export type ActiveCall = {
  readonly callId: string | null;
  readonly conversationId: string;
  readonly media: CallMedia;
  readonly direction: 'outgoing' | 'incoming';
  readonly isGroup: boolean;
  /** Le nom de ce qu'on appelle : le pair en direct, le groupe sinon. */
  readonly title: string;
  readonly avatar: string | null;
  /** Qui appelle, pour l'écran entrant d'un groupe (« Alice appelle… »). */
  readonly callerName: string | null;
  readonly phase: CallPhase;
  readonly connectedAt: number | null;
  readonly endedDurationSec: number | null;
  readonly micMuted: boolean;
  readonly cameraOn: boolean;
  readonly facing: 'user' | 'environment';
  readonly members: Readonly<Record<string, CallMember>>;
  readonly display: CallDisplay;
  readonly localStream: MediaStream | null;
  readonly remoteStreams: Readonly<Record<string, MediaStream>>;
  readonly captions: readonly CallCaption[];
  readonly captionsOn: boolean;
  readonly quality: 'good' | 'fair' | 'poor' | null;
};

export type WaitingCall = {
  readonly callId: string;
  readonly conversationId: string;
  readonly media: CallMedia;
  readonly callerName: string;
  readonly callerAvatar: string | null;
  readonly isGroup: boolean;
  readonly title: string;
};

export type CallStoreState = {
  readonly call: ActiveCall | null;
  readonly waiting: WaitingCall | null;
  /** Un refus qui n'ouvre aucun écran (« un appel est déjà en cours »). */
  readonly notice: 'already-in-call' | null;
};

export type CallStoreApi = StoreApi<CallStoreState>;

export function createCallStore(): CallStoreApi {
  return createStore<CallStoreState>(() => ({ call: null, waiting: null, notice: null }));
}

export const callStore = createCallStore();

export function isCallLive(call: ActiveCall | null): boolean {
  return call !== null && call.phase.kind !== 'ended';
}

/** L'appel en cours DANS cette conversation — ce qui change le bouton du fil en « Revenir à l'appel ». */
export function liveCallIn(state: CallStoreState, conversationId: string): ActiveCall | null {
  return isCallLive(state.call) && state.call?.conversationId === conversationId ? state.call : null;
}

/** `formattedDuration` d'iOS : `M:SS`, `H:MM:SS` passé une heure. */
export function formatCallClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

export function elapsedSeconds(call: Pick<ActiveCall, 'connectedAt'>, now: number): number {
  return call.connectedAt === null ? 0 : Math.max(0, Math.floor((now - call.connectedAt) / 1000));
}

export function withMember(call: ActiveCall, member: CallMember): ActiveCall {
  return { ...call, members: { ...call.members, [member.userId]: member } };
}

export function withoutMember(call: ActiveCall, userId: string): ActiveCall {
  const { [userId]: _gone, ...members } = call.members;
  const { [userId]: _stream, ...remoteStreams } = call.remoteStreams;
  return { ...call, members, remoteStreams };
}

export function patchMember(call: ActiveCall, userId: string, patch: Partial<Omit<CallMember, 'userId'>>): ActiveCall {
  const current = call.members[userId];
  return current === undefined ? call : withMember(call, { ...current, ...patch });
}

/** La phase d'ensemble d'un maillage : le meilleur lien l'emporte (connecté > reconnexion > connexion). */
export function meshPhase(members: Readonly<Record<string, CallMember>>): 'connected' | 'reconnecting' | 'connecting' | null {
  const links = Object.values(members).map((member) => member.link);
  if (links.includes('connected')) return 'connected';
  if (links.includes('reconnecting')) return 'reconnecting';
  if (links.includes('connecting')) return 'connecting';
  return null;
}

export const CAPTIONS_KEPT = 3;

export function withCaption(captions: readonly CallCaption[], next: CallCaption): readonly CallCaption[] {
  const others = captions.filter((caption) => caption.id !== next.id);
  return [...others, next].slice(-CAPTIONS_KEPT);
}
