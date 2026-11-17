import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';

import type { CallMedia } from './call-store';
import type { StartCallRequest } from './engine';

export const CALL_BACK_PARAM = 'rappeler';
export const CALL_BACK_NAME_PARAM = 'appelant';
export const CALL_BACK_GROUP_PARAM = 'groupe';

/**
 * `origin` dit d'où vient l'intention : le MESSAGE du worker (ou le pont de la
 * coque) est une voie de confiance ; l'ADRESSE d'un onglet neuf se compose à la
 * main (#18907) — elle ne porte ni nom ni groupe, et ne compose jamais seule.
 */
export type CallBackIntentOrigin = 'url' | 'message';

export type CallBackIntent = {
  readonly conversationId: string;
  readonly media: CallMedia;
  readonly title: string;
  readonly isGroup: boolean;
  readonly origin: CallBackIntentOrigin;
};

export type CallBackIntentEnvironment = {
  readonly path: string;
  readonly search: string;
  readonly forgetParams: () => void;
  readonly container: { addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void } | undefined;
  /** Se résout quand la connexion peut porter l'appel (#8199). */
  readonly ready: () => Promise<void>;
  /** Le navigateur laisse-t-il partir la sonnerie et la voix sans geste ? */
  readonly mayPlayAudio: () => boolean;
  readonly start: (request: StartCallRequest) => void;
  /** Le geste manque : « Appeler » le demande, et c'est lui qui composera. */
  readonly confirm: (request: StartCallRequest) => void;
};

/**
 * Ce que le navigateur dit de sa politique d'autoplay. Un onglet ouvert par le
 * worker n'a reçu aucun geste : Chrome, Safari et Firefox y bloquent le son
 * (sonnerie Web Audio, voix distante) jusqu'au premier toucher (#8199).
 */
export type AutoplaySignals = {
  readonly userActivation?: { readonly hasBeenActive: boolean };
  readonly getAutoplayPolicy?: (type: 'audiocontext') => string;
};

export function audioAutoplayAllowed(signals: AutoplaySignals): boolean {
  if (signals.userActivation?.hasBeenActive === true) return true;
  if (typeof signals.getAutoplayPolicy === 'function') return signals.getAutoplayPolicy('audiocontext') === 'allowed';
  return signals.userActivation === undefined;
}

const THREAD_PATH = /^\/c\/([^/?#]+)\/?$/;

const mediaOf = (value: unknown): CallMedia | null => (value === 'audio' || value === 'video' ? value : null);

const conversationOfPath = (path: string): string | null => {
  const match = THREAD_PATH.exec(path);
  if (match === null || match[1] === undefined) return null;
  const conversationId = decodeURIComponent(match[1]).trim();
  return conversationId === '' ? null : conversationId;
};

export function callBackIntentFromSearch(path: string, search: string): CallBackIntent | null {
  const media = mediaOf(new URLSearchParams(search).get(CALL_BACK_PARAM));
  const conversationId = conversationOfPath(path);
  if (media === null || conversationId === null) return null;
  return { conversationId, media, title: '', isGroup: false, origin: 'url' };
}

export function callBackIntentFromMessage(message: unknown): CallBackIntent | null {
  if (message === null || typeof message !== 'object') return null;
  const { type, callBack } = message as { readonly type?: unknown; readonly callBack?: unknown };
  if (type !== NOTIFICATION_CLICKED_MESSAGE || callBack === null || typeof callBack !== 'object') return null;
  const { conversationId, media, title, isGroup } = callBack as Readonly<Record<string, unknown>>;
  const medium = mediaOf(media);
  if (typeof conversationId !== 'string' || conversationId.trim() === '' || medium === null) return null;
  return {
    conversationId: conversationId.trim(),
    media: medium,
    title: typeof title === 'string' ? title.trim() : '',
    isGroup: isGroup === true,
    origin: 'message',
  };
}

const requestOf = (intent: CallBackIntent): StartCallRequest => ({
  conversationId: intent.conversationId,
  media: intent.media,
  title: intent.title,
  avatar: null,
  isGroup: intent.isGroup,
});

export function listenCallBackIntents(env: CallBackIntentEnvironment): void {
  const deliver = (intent: CallBackIntent): void => {
    void env.ready().then(() => {
      const request = requestOf(intent);
      if (intent.origin === 'url' || !env.mayPlayAudio()) return env.confirm(request);
      env.start(request);
    });
  };
  const fromSearch = callBackIntentFromSearch(env.path, env.search);
  if (fromSearch !== null) {
    env.forgetParams();
    deliver(fromSearch);
  }
  env.container?.addEventListener('message', (event) => {
    const intent = callBackIntentFromMessage(event.data);
    if (intent !== null) deliver(intent);
  });
}

type CallBackActions = Pick<CallBackIntentEnvironment, 'ready' | 'start' | 'confirm'>;

/** Le nom, l'avatar et le groupe d'un rappel viennent de la conversation connue ; ce que la demande porte ne sert que faute de mieux. */
export function identifyCallBack(request: StartCallRequest, known: { readonly title: string; readonly avatar: string | null; readonly isGroup: boolean }): StartCallRequest {
  return { ...request, title: request.title === '' ? known.title : request.title, avatar: known.avatar, isGroup: request.isGroup || known.isGroup };
}

async function callBackActions(): Promise<CallBackActions> {
  const [{ callActions }, { callIdentityOf }, { whenCallTransportReady }, { callBackPromptStore }] = await Promise.all([
    import('./call-actions'),
    import('./call-notice'),
    import('./call-transport'),
    import('./call-back-prompt'),
  ]);
  const identified = (request: StartCallRequest): StartCallRequest => identifyCallBack(request, callIdentityOf(request.conversationId));
  return {
    ready: whenCallTransportReady,
    start: (request) => callActions.start(identified(request)),
    confirm: (request) => callBackPromptStore.setState({ request: identified(request) }),
  };
}

export async function listenCallBackIntentsInBrowser(): Promise<void> {
  const actions = await callBackActions();
  const container = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
  listenCallBackIntents({
    ...actions,
    path: window.location.pathname,
    search: window.location.search,
    forgetParams: () => {
      const url = new URL(window.location.href);
      [CALL_BACK_PARAM, CALL_BACK_NAME_PARAM, CALL_BACK_GROUP_PARAM].forEach((name) => url.searchParams.delete(name));
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    },
    container: container as unknown as CallBackIntentEnvironment['container'],
    mayPlayAudio: () => audioAutoplayAllowed(navigator as unknown as AutoplaySignals),
  });
}

/**
 * « Rappeler » touché sur une bannière de la coque Android (#10908) : l'appel
 * arrive par le pont natif (`shell-call-back.ts`), jamais par l'adresse — le
 * lien profond l'y laisse, et le relire composerait l'appel deux fois. La
 * WebView de Capacitor joue le son sans geste
 * (`setMediaPlaybackRequiresUserGesture(false)`) : l'appel part sans « Appeler ».
 */
export async function listenCallBackIntentsInShell(): Promise<void> {
  const [actions, { ecouterRappels }, { coqueCourante }] = await Promise.all([
    callBackActions(),
    import('./shell-call-back'),
    import('@/lib/native-shell'),
  ]);
  listenCallBackIntents({
    ...actions,
    path: '',
    search: '',
    forgetParams: () => undefined,
    container: {
      addEventListener: (_type, listener) => {
        ecouterRappels(coqueCourante(), (callBack) => listener({ data: { type: NOTIFICATION_CLICKED_MESSAGE, callBack } }));
      },
    },
    mayPlayAudio: () => true,
  });
}
