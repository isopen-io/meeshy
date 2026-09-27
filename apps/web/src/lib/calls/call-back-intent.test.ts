import { describe, expect, test } from 'bun:test';

import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';

import {
  CALL_BACK_GROUP_PARAM,
  CALL_BACK_NAME_PARAM,
  CALL_BACK_PARAM,
  callBackIntentFromMessage,
  callBackIntentFromSearch,
  listenCallBackIntents,
} from './call-back-intent';
import type { StartCallRequest } from './engine';

/**
 * « RAPPELER » DEPUIS LA NOTIFICATION D'APPEL MANQUÉ (#8067) — le worker
 * (`public/sw-push.js`) ouvre le fil ; ce module compose l'appel qu'il désigne,
 * du même type, UNE fois.
 */

const search = (params: Readonly<Record<string, string>>): string => `?${new URLSearchParams(params).toString()}`;

function harness(options: { readonly search?: string; readonly path?: string } = {}) {
  const started: StartCallRequest[] = [];
  const forgotten: number[] = [];
  const listeners: Array<(event: { data: unknown }) => void> = [];
  listenCallBackIntents({
    path: options.path ?? '/c/conv-1',
    search: options.search ?? '',
    forgetParams: () => void forgotten.push(1),
    container: { addEventListener: (_type, listener) => void listeners.push(listener) },
    start: (request) => void started.push(request),
  });
  return { started, forgotten, post: (data: unknown) => listeners.forEach((listener) => listener({ data })) };
}

describe('lire l’intention de rappel', () => {
  test('depuis l’adresse d’un onglet neuf : le fil, le type et le nom', () => {
    expect(callBackIntentFromSearch('/c/conv-1', search({ [CALL_BACK_PARAM]: 'video', [CALL_BACK_NAME_PARAM]: 'Awa' }))).toEqual({
      conversationId: 'conv-1',
      media: 'video',
      title: 'Awa',
      isGroup: false,
    });
  });

  test('un appel de groupe se rappelle dans le groupe', () => {
    expect(
      callBackIntentFromSearch('/c/conv-g', search({ [CALL_BACK_PARAM]: 'audio', [CALL_BACK_NAME_PARAM]: 'Équipe', [CALL_BACK_GROUP_PARAM]: '1' }))?.isGroup,
    ).toBe(true);
  });

  test('sans type reconnu ou hors d’un fil, rien ne sonne', () => {
    expect(callBackIntentFromSearch('/c/conv-1', '')).toBeNull();
    expect(callBackIntentFromSearch('/c/conv-1', search({ [CALL_BACK_PARAM]: 'fax' }))).toBeNull();
    expect(callBackIntentFromSearch('/notifications', search({ [CALL_BACK_PARAM]: 'audio' }))).toBeNull();
  });

  test('depuis le message remis à un onglet déjà ouvert', () => {
    expect(
      callBackIntentFromMessage({
        type: NOTIFICATION_CLICKED_MESSAGE,
        url: '/c/conv-1',
        callBack: { conversationId: 'conv-1', media: 'audio', title: 'Awa', isGroup: false },
      }),
    ).toEqual({ conversationId: 'conv-1', media: 'audio', title: 'Awa', isGroup: false });
  });

  test('un message étranger ou mal formé ne compose rien', () => {
    expect(callBackIntentFromMessage(null)).toBeNull();
    expect(callBackIntentFromMessage({ type: 'OTHER', callBack: { conversationId: 'c', media: 'audio' } })).toBeNull();
    expect(callBackIntentFromMessage({ type: NOTIFICATION_CLICKED_MESSAGE, callBack: { conversationId: '', media: 'audio' } })).toBeNull();
    expect(callBackIntentFromMessage({ type: NOTIFICATION_CLICKED_MESSAGE, callBack: { conversationId: 'c', media: 'fax' } })).toBeNull();
    expect(callBackIntentFromMessage({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/conv-1' })).toBeNull();
  });
});

describe('composer le rappel', () => {
  test('un onglet neuf compose l’appel désigné par son adresse, puis l’oublie', () => {
    const { started, forgotten } = harness({ search: search({ [CALL_BACK_PARAM]: 'video', [CALL_BACK_NAME_PARAM]: 'Awa' }) });
    expect(started).toEqual([{ conversationId: 'conv-1', media: 'video', title: 'Awa', avatar: null, isGroup: false }]);
    expect(forgotten).toEqual([1]);
  });

  test('un onglet déjà ouvert compose à la réception du message du worker', () => {
    const { started, post } = harness();
    post({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/conv-2', callBack: { conversationId: 'conv-2', media: 'audio', title: 'Bo', isGroup: false } });
    expect(started).toEqual([{ conversationId: 'conv-2', media: 'audio', title: 'Bo', avatar: null, isGroup: false }]);
  });

  test('une adresse sans intention ne compose rien et ne touche pas à l’adresse', () => {
    const { started, forgotten } = harness();
    expect(started).toEqual([]);
    expect(forgotten).toEqual([]);
  });
});
