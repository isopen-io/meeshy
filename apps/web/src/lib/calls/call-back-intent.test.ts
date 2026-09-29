import { describe, expect, test } from 'bun:test';

import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';

import {
  CALL_BACK_GROUP_PARAM,
  CALL_BACK_NAME_PARAM,
  CALL_BACK_PARAM,
  audioAutoplayAllowed,
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

type HarnessOptions = {
  readonly search?: string;
  readonly path?: string;
  readonly connected?: boolean;
  readonly mayPlayAudio?: boolean;
};

function harness(options: HarnessOptions = {}) {
  const started: StartCallRequest[] = [];
  const confirmed: StartCallRequest[] = [];
  const forgotten: number[] = [];
  const listeners: Array<(event: { data: unknown }) => void> = [];
  const connection = { open: () => undefined as void };
  const ready =
    options.connected === false
      ? new Promise<void>((resolve) => {
          connection.open = resolve;
        })
      : Promise.resolve();
  listenCallBackIntents({
    path: options.path ?? '/c/conv-1',
    search: options.search ?? '',
    forgetParams: () => void forgotten.push(1),
    container: { addEventListener: (_type, listener) => void listeners.push(listener) },
    ready: () => ready,
    mayPlayAudio: () => options.mayPlayAudio ?? true,
    start: (request) => void started.push(request),
    confirm: (request) => void confirmed.push(request),
  });
  return {
    started,
    confirmed,
    forgotten,
    connect: async () => {
      connection.open();
      await settle();
    },
    post: async (data: unknown) => {
      listeners.forEach((listener) => listener({ data }));
      await settle();
    },
  };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

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
  test('un onglet neuf compose l’appel désigné par son adresse, puis l’oublie', async () => {
    const { started, forgotten } = harness({ search: search({ [CALL_BACK_PARAM]: 'video', [CALL_BACK_NAME_PARAM]: 'Awa' }) });
    await settle();
    expect(started).toEqual([{ conversationId: 'conv-1', media: 'video', title: 'Awa', avatar: null, isGroup: false }]);
    expect(forgotten).toEqual([1]);
  });

  test('un onglet déjà ouvert compose à la réception du message du worker', async () => {
    const { started, post } = harness();
    await post({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/conv-2', callBack: { conversationId: 'conv-2', media: 'audio', title: 'Bo', isGroup: false } });
    expect(started).toEqual([{ conversationId: 'conv-2', media: 'audio', title: 'Bo', avatar: null, isGroup: false }]);
  });

  test('une adresse sans intention ne compose rien et ne touche pas à l’adresse', async () => {
    const { started, forgotten } = harness();
    await settle();
    expect(started).toEqual([]);
    expect(forgotten).toEqual([]);
  });
});

describe('un onglet ouvert à froid attend sa connexion avant de composer (#8199)', () => {
  test('rien ne part tant que la connexion n’est pas authentifiée, puis l’appel part une fois', async () => {
    const h = harness({ connected: false, search: search({ [CALL_BACK_PARAM]: 'audio', [CALL_BACK_NAME_PARAM]: 'Awa' }) });
    await settle();
    expect(h.started).toEqual([]);
    expect(h.forgotten).toEqual([1]);

    await h.connect();
    expect(h.started).toEqual([{ conversationId: 'conv-1', media: 'audio', title: 'Awa', avatar: null, isGroup: false }]);
  });

  test('le message du worker attend aussi la connexion', async () => {
    const h = harness({ connected: false });
    await h.post({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/conv-2', callBack: { conversationId: 'conv-2', media: 'video', title: 'Bo', isGroup: false } });
    expect(h.started).toEqual([]);

    await h.connect();
    expect(h.started.map((request) => request.conversationId)).toEqual(['conv-2']);
  });

  test('quand le son ne peut pas partir sans geste, le rappel demande une confirmation au lieu de composer', async () => {
    const h = harness({ mayPlayAudio: false, search: search({ [CALL_BACK_PARAM]: 'video', [CALL_BACK_NAME_PARAM]: 'Awa' }) });
    await settle();
    expect(h.started).toEqual([]);
    expect(h.confirmed).toEqual([{ conversationId: 'conv-1', media: 'video', title: 'Awa', avatar: null, isGroup: false }]);
  });
});

describe('le navigateur laisse-t-il partir le son sans geste ?', () => {
  test('une page déjà touchée par l’utilisateur joue', () => {
    expect(audioAutoplayAllowed({ userActivation: { hasBeenActive: true } })).toBe(true);
  });

  test('une page jamais touchée, que le navigateur déclare bloquée, demande un geste', () => {
    expect(audioAutoplayAllowed({ userActivation: { hasBeenActive: false } })).toBe(false);
    expect(audioAutoplayAllowed({ userActivation: { hasBeenActive: false }, getAutoplayPolicy: () => 'disallowed' })).toBe(false);
  });

  test('la politique d’autoplay du navigateur l’emporte quand elle autorise', () => {
    expect(audioAutoplayAllowed({ userActivation: { hasBeenActive: false }, getAutoplayPolicy: () => 'allowed' })).toBe(true);
  });

  test('un navigateur qui ne dit rien garde le comportement direct', () => {
    expect(audioAutoplayAllowed({})).toBe(true);
  });
});
