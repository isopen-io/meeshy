import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';

import type { CallMedia } from './call-store';
import type { StartCallRequest } from './engine';

export const CALL_BACK_PARAM = 'rappeler';
export const CALL_BACK_NAME_PARAM = 'appelant';
export const CALL_BACK_GROUP_PARAM = 'groupe';

export type CallBackIntent = {
  readonly conversationId: string;
  readonly media: CallMedia;
  readonly title: string;
  readonly isGroup: boolean;
};

export type CallBackIntentEnvironment = {
  readonly path: string;
  readonly search: string;
  readonly forgetParams: () => void;
  readonly container: { addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void } | undefined;
  readonly start: (request: StartCallRequest) => void;
};

const THREAD_PATH = /^\/c\/([^/?#]+)\/?$/;

const mediaOf = (value: unknown): CallMedia | null => (value === 'audio' || value === 'video' ? value : null);

const conversationOfPath = (path: string): string | null => {
  const match = THREAD_PATH.exec(path);
  if (match === null || match[1] === undefined) return null;
  const conversationId = decodeURIComponent(match[1]).trim();
  return conversationId === '' ? null : conversationId;
};

export function callBackIntentFromSearch(path: string, search: string): CallBackIntent | null {
  const params = new URLSearchParams(search);
  const media = mediaOf(params.get(CALL_BACK_PARAM));
  const conversationId = conversationOfPath(path);
  if (media === null || conversationId === null) return null;
  return {
    conversationId,
    media,
    title: (params.get(CALL_BACK_NAME_PARAM) ?? '').trim(),
    isGroup: params.get(CALL_BACK_GROUP_PARAM) === '1',
  };
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
  const fromSearch = callBackIntentFromSearch(env.path, env.search);
  if (fromSearch !== null) {
    env.forgetParams();
    env.start(requestOf(fromSearch));
  }
  env.container?.addEventListener('message', (event) => {
    const intent = callBackIntentFromMessage(event.data);
    if (intent !== null) env.start(requestOf(intent));
  });
}

export async function listenCallBackIntentsInBrowser(): Promise<void> {
  const [{ callActions }, { callIdentityOf }] = await Promise.all([import('./call-actions'), import('./call-notice')]);
  const container = 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
  listenCallBackIntents({
    path: window.location.pathname,
    search: window.location.search,
    forgetParams: () => {
      const url = new URL(window.location.href);
      [CALL_BACK_PARAM, CALL_BACK_NAME_PARAM, CALL_BACK_GROUP_PARAM].forEach((name) => url.searchParams.delete(name));
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    },
    container: container as unknown as CallBackIntentEnvironment['container'],
    start: (request) => {
      const known = callIdentityOf(request.conversationId);
      callActions.start({
        ...request,
        title: request.title === '' ? known.title : request.title,
        avatar: known.avatar,
      });
    },
  });
}
