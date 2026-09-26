import type { DeliveryReceiptCredential } from '@/lib/notifications/delivery-receipt-credential';
import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';

import { listenCallAnswerIntents } from './call-answer-intent';
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
 * - le credential que « Refuser » utilise app tuée suit la session.
 *
 * Tout est injecté ; `shell-call-runtime.ts` branche les réels.
 */

export const PONT_APPEL = 'MeeshyCall';

export type ShellAudioRoute = 'earpiece' | 'speaker' | 'wired' | 'bluetooth';

export type ShellCallSnapshot = {
  readonly active: boolean;
  readonly video: boolean;
  readonly phase: CallPhase['kind'] | null;
};

export type ShellCallCommand =
  | { readonly method: 'startCallService'; readonly options: { readonly video: boolean } }
  | { readonly method: 'stopCallService'; readonly options: Record<string, never> }
  | { readonly method: 'haptic'; readonly options: { readonly kind: 'connected' | 'reconnecting' | 'ended' } };

const LIVE_PHASES: ReadonlySet<CallPhase['kind']> = new Set(['outgoing', 'connecting', 'connected', 'reconnecting']);

export function shellCallSnapshot(call: ActiveCall | null): ShellCallSnapshot {
  if (call === null) return { active: false, video: false, phase: null };
  return { active: LIVE_PHASES.has(call.phase.kind), video: call.media === 'video', phase: call.phase.kind };
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

/** Les appels au plugin qu'impose un changement du magasin, dans l'ordre. */
export function shellCallCommands(previous: ShellCallSnapshot, next: ShellCallSnapshot): readonly ShellCallCommand[] {
  return [serviceFor(previous, next), hapticFor(previous, next)].filter(
    (command): command is ShellCallCommand => command !== null,
  );
}

export function audioRouteLabelKey(route: ShellAudioRoute): `call.audioRoute.${ShellAudioRoute}` {
  return `call.audioRoute.${route}`;
}

export type ShellCallEnvironment = {
  readonly native: (method: string, options: object) => Promise<unknown>;
  readonly listen: (event: 'callAnswer', listener: (data: unknown) => void) => void;
  readonly store: Pick<CallStoreApi, 'getState' | 'subscribe'>;
  readonly accept: () => void;
  readonly watchCredential: (write: (value: DeliveryReceiptCredential) => void) => () => void;
  readonly now: () => number;
};

const callIdOf = (data: unknown): string | null => {
  const callId = (data as { readonly callId?: unknown } | null)?.callId;
  return typeof callId === 'string' && callId.trim() !== '' ? callId : null;
};

const credentialOptions = ({ apiBase, credential }: DeliveryReceiptCredential): ShellCredentialOptions | null => {
  if (credential === null) return null;
  return credential.kind === 'registered'
    ? { apiBase, kind: 'registered', token: credential.token }
    : { apiBase, kind: 'anonymous', token: credential.sessionToken };
};

type ShellCredentialOptions = { readonly apiBase: string; readonly kind: 'registered' | 'anonymous'; readonly token: string };

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

  const stopCredential = env.watchCredential((value) => {
    const options = credentialOptions(value);
    if (options === null) send('clearCredential', {});
    else send('setCredential', options);
  });

  return () => {
    attached = false;
    stopCommands();
    stopIntents();
    stopCredential();
  };
}
