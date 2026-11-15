import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';

import { listenCallAnswerIntents } from './call-answer-intent';
import { pipAspect, pipSource, type PipAspect } from './call-pip';
import type { ActiveCall, CallPhase, CallStoreApi } from './call-store';

/**
 * **L'APPEL EST NATIF DANS LA COQUE ANDROID** (#8049) — la page pilote
 * `MeeshyCallPlugin.java` depuis le magasin d'appel, qu'elle LIT sans jamais
 * l'écrire (le moteur en reste le seul auteur) :
 *
 * - un appel vivant (numérotation, connexion, connecté, reconnexion) tient le
 *   service au premier plan — micro, caméra en vidéo — l'écran allumé, la
 *   sortie audio et le capteur de proximité : sans lui, Android coupe le micro
 *   de la WebView écran éteint ;
 * - chaque transition vibre brièvement (connecté, reconnexion, fin) ;
 * - « Répondre » touché sur la notification native (`callAnswer`) décroche
 *   l'appel quand il sonne dans l'app — la MÊME loi que l'intention du service
 *   worker web (`call-answer-intent.ts`) ;
 * - un appel qui quitte la sonnerie dans l'app retire la notification native ;
 * - le credential que « Refuser » utilise app tuée est posé par la coque elle-même, appels offerts ou non (`notifications/shell-credential.ts`, #10662) ;
 * - l'activité qui flotte en image dans l'image (#8144) le dit à la page, qui
 *   réduit son rendu à l'image (`pictureInPicture`) ; ses boutons micro et
 *   raccrocher reviennent à la page (`pictureInPictureAction`).
 *
 * Tout est injecté ; `shell-call-runtime.ts` branche les réels.
 */

export const PONT_APPEL = 'MeeshyCall';

export type ShellAudioRoute = 'earpiece' | 'speaker' | 'wired' | 'bluetooth';

export type ShellCallSnapshot = {
  readonly active: boolean;
  readonly video: boolean;
  readonly phase: CallPhase['kind'] | null;
  readonly micMuted: boolean;
  /** Une vidéo est à l'écran (`pipSource`) : la mienne, celle d'un pair ou son écran partagé — l'appel flotte comme sur le web (#11346). */
  readonly floats: boolean;
  readonly aspect: PipAspect | null;
};

export type ShellCallCommand =
  | { readonly method: 'startCallService'; readonly options: { readonly video: boolean } }
  | { readonly method: 'stopCallService'; readonly options: Record<string, never> }
  | { readonly method: 'haptic'; readonly options: { readonly kind: 'connected' | 'reconnecting' | 'ended' } }
  | {
      readonly method: 'setPictureInPictureControls';
      readonly options: { readonly micMuted: boolean; readonly floats: boolean; readonly aspectWidth?: number; readonly aspectHeight?: number };
    };

const LIVE_PHASES: ReadonlySet<CallPhase['kind']> = new Set(['outgoing', 'connecting', 'connected', 'reconnecting']);

export function shellCallSnapshot(call: ActiveCall | null): ShellCallSnapshot {
  if (call === null) return { active: false, video: false, phase: null, micMuted: false, floats: false, aspect: null };
  const active = LIVE_PHASES.has(call.phase.kind);
  const source = active ? pipSource(call) : null;
  return {
    active,
    video: call.media === 'video',
    phase: call.phase.kind,
    micMuted: call.micMuted,
    floats: source !== null,
    aspect: pipAspect(source),
  };
}

const hapticFor = (previous: ShellCallSnapshot, next: ShellCallSnapshot): ShellCallCommand | null => {
  if (next.phase === previous.phase) return null;
  if (next.phase === 'connected') return { method: 'haptic', options: { kind: 'connected' } };
  if (next.phase === 'reconnecting') return { method: 'haptic', options: { kind: 'reconnecting' } };
  if (next.phase === 'ended' && previous.active) return { method: 'haptic', options: { kind: 'ended' } };
  return null;
};

const serviceFor = (previous: ShellCallSnapshot, next: ShellCallSnapshot): ShellCallCommand | null => {
  if (next.active && (!previous.active || previous.video !== next.video)) {
    return { method: 'startCallService', options: { video: next.video } };
  }
  if (previous.active && !next.active) return { method: 'stopCallService', options: {} };
  return null;
};

const sameAspect = (a: PipAspect | null, b: PipAspect | null): boolean => a?.width === b?.width && a?.height === b?.height;

/* La coque oublie le micro et le format à la fin de l'appel : un appel neuf part « micro ouvert, format système » de son côté. */
const pipControlsFor = (previous: ShellCallSnapshot, next: ShellCallSnapshot): ShellCallCommand | null => {
  if (!next.active) return null;
  const knownMuted = previous.active && previous.micMuted;
  const knownFloats = previous.active && previous.floats;
  const knownAspect = previous.active ? previous.aspect : null;
  if (next.micMuted === knownMuted && next.floats === knownFloats && sameAspect(next.aspect, knownAspect)) return null;
  const aspect = next.aspect === null ? {} : { aspectWidth: next.aspect.width, aspectHeight: next.aspect.height };
  return { method: 'setPictureInPictureControls', options: { micMuted: next.micMuted, floats: next.floats, ...aspect } };
};

/** Les appels au plugin qu'impose un changement du magasin, dans l'ordre. */
export function shellCallCommands(previous: ShellCallSnapshot, next: ShellCallSnapshot): readonly ShellCallCommand[] {
  return [serviceFor(previous, next), pipControlsFor(previous, next), hapticFor(previous, next)].filter(
    (command): command is ShellCallCommand => command !== null,
  );
}

export function audioRouteLabelKey(route: ShellAudioRoute): `call.audioRoute.${ShellAudioRoute}` {
  return `call.audioRoute.${route}`;
}

export type ShellCallEnvironment = {
  readonly native: (method: string, options: object) => Promise<unknown>;
  readonly listen: (event: 'callAnswer' | 'pictureInPictureModeChanged' | 'pictureInPictureAction', listener: (data: unknown) => void) => void;
  readonly pictureInPicture: (active: boolean) => void;
  readonly toggleMic: () => void;
  readonly hangup: () => void;
  readonly store: Pick<CallStoreApi, 'getState' | 'subscribe'>;
  readonly accept: () => void;
  readonly now: () => number;
};

const callIdOf = (data: unknown): string | null => {
  const callId = (data as { readonly callId?: unknown } | null)?.callId;
  return typeof callId === 'string' && callId.trim() !== '' ? callId : null;
};

export function bindShellCall(env: ShellCallEnvironment): () => void {
  let attached = true;
  const send = (method: string, options: object): void => {
    if (!attached) return;
    void env.native(method, options).catch(() => undefined);
  };

  let previous = shellCallSnapshot(env.store.getState().call);
  const stopCommands = env.store.subscribe((state) => {
    const next = shellCallSnapshot(state.call);
    shellCallCommands(previous, next).forEach((command) => send(command.method, command.options));
    previous = next;
  });

  const messageListeners: Array<(event: { data: unknown }) => void> = [];
  env.listen('callAnswer', (data) => {
    const answerCallId = callIdOf(data);
    if (answerCallId === null) return;
    messageListeners.forEach((listener) => listener({ data: { type: NOTIFICATION_CLICKED_MESSAGE, answerCallId } }));
  });
  const stopIntents = listenCallAnswerIntents({
    search: '',
    forgetParam: () => undefined,
    container: { addEventListener: (_type, listener) => void messageListeners.push(listener) },
    store: env.store,
    accept: () => {
      if (attached) env.accept();
    },
    closeRinging: (callId) => send('dismissIncomingCall', { callId }),
    now: env.now,
  });

  env.listen('pictureInPictureModeChanged', (data) => {
    if (attached) env.pictureInPicture((data as { readonly active?: unknown } | null)?.active === true);
  });

  env.listen('pictureInPictureAction', (data) => {
    if (!attached) return;
    const action = (data as { readonly action?: unknown } | null)?.action;
    if (action === 'mic') env.toggleMic();
    if (action === 'hangup') env.hangup();
  });

  return () => {
    attached = false;
    env.pictureInPicture(false);
    stopCommands();
    stopIntents();
  };
}
