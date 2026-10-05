import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';

import type { ActiveCall, CallStoreApi } from './call-store';

/**
 * **RÉPONDRE DEPUIS LA NOTIFICATION DÉCROCHE** (#8043) — le toucher « Répondre »
 * de la notification d'appel (`public/sw-push.js`) ouvre le fil ; ce module
 * fait le reste : quand l'appel qu'il désigne SONNE dans l'application
 * (`call:check-active` le rejoue à la connexion), il le décroche, une fois.
 *
 * L'intention arrive par deux portes : l'adresse d'un onglet NEUF
 * (`?repondre=<id>`, retirée aussitôt pour qu'un rechargement ne redécroche
 * rien), ou le message qu'un onglet DÉJÀ OUVERT reçoit du worker. Elle expire
 * avec la sonnerie : un appel qui sonne plus tard n'est pas celui qu'on a
 * accepté.
 *
 * Et la notification suit l'appel : dès qu'il quitte la sonnerie dans
 * l'application (décroché, refusé, terminé), celle du worker est retirée.
 */

/** JUMEAU de `CALL_ANSWER_PARAM` dans `public/sw-push.js`. */
export const CALL_ANSWER_PARAM = 'repondre';
export const ANSWER_INTENT_TTL_MS = 70_000;

type Intent = { readonly callId: string; readonly until: number };

export type CallAnswerIntentEnvironment = {
  readonly search: string;
  readonly forgetParam: () => void;
  readonly container: { addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void } | undefined;
  readonly store: Pick<CallStoreApi, 'getState' | 'subscribe'>;
  readonly accept: () => void;
  readonly closeRinging: (callId: string) => void;
  readonly now: () => number;
};

export function answerCallIdFromSearch(search: string): string | null {
  const callId = new URLSearchParams(search).get(CALL_ANSWER_PARAM);
  return callId === null || callId.trim() === '' ? null : callId.trim();
}

export function answerCallIdFromMessage(message: unknown): string | null {
  if (message === null || typeof message !== 'object') return null;
  const { type, answerCallId } = message as { readonly type?: unknown; readonly answerCallId?: unknown };
  if (type !== NOTIFICATION_CLICKED_MESSAGE || typeof answerCallId !== 'string') return null;
  return answerCallId.trim() === '' ? null : answerCallId.trim();
}

const ringing = (call: ActiveCall | null): string | null =>
  call !== null && call.direction === 'incoming' && call.phase.kind === 'incoming' ? call.callId : null;

export function listenCallAnswerIntents(env: CallAnswerIntentEnvironment): () => void {
  let intent: Intent | null = null;

  const tryAnswer = (): void => {
    if (intent === null) return;
    if (env.now() > intent.until) {
      intent = null;
      return;
    }
    if (ringing(env.store.getState().call) !== intent.callId) return;
    intent = null;
    env.accept();
  };

  const remember = (callId: string): void => {
    intent = { callId, until: env.now() + ANSWER_INTENT_TTL_MS };
    tryAnswer();
  };

  const fromSearch = answerCallIdFromSearch(env.search);
  if (fromSearch !== null) {
    env.forgetParam();
    remember(fromSearch);
  }

  env.container?.addEventListener('message', (event) => {
    const callId = answerCallIdFromMessage(event.data);
    if (callId !== null) remember(callId);
  });

  return env.store.subscribe((state, previous) => {
    const was = ringing(previous.call);
    if (was !== null && ringing(state.call) !== was) env.closeRinging(was);
    tryAnswer();
  });
}

/** L'ENVIRONNEMENT RÉEL — même découpage que `listenNotificationTapsInBrowser`. */
export async function listenCallAnswerIntentsInBrowser(): Promise<void> {
  const [{ callStore }, { callActions }] = await Promise.all([import('./call-store'), import('./call-actions')]);
  const container = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
  listenCallAnswerIntents({
    search: window.location.search,
    forgetParam: () => {
      const url = new URL(window.location.href);
      url.searchParams.delete(CALL_ANSWER_PARAM);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    },
    container: container as unknown as CallAnswerIntentEnvironment['container'],
    store: callStore,
    accept: () => callActions.accept(),
    closeRinging: (callId) => {
      if (container === undefined) return;
      void container.ready
        .then((registration) => registration.getNotifications({ tag: `call:${callId}` }))
        .then((shown) => shown.forEach((notification) => notification.close()))
        .catch(() => undefined);
    },
    now: () => Date.now(),
  });
}
