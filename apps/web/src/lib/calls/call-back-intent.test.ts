import { describe, expect, test } from 'bun:test';

import { NOTIFICATION_CLICKED_MESSAGE } from '@/lib/notifications/tap-navigation';

import {
  CALL_BACK_GROUP_PARAM,
  CALL_BACK_NAME_PARAM,
  CALL_BACK_PARAM,
  audioAutoplayAllowed,
  callBackIntentFromMessage,
  callBackIntentFromSearch,
  identifyCallBack,
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
  test('depuis l’adresse d’un onglet neuf : le fil et le type, JAMAIS le nom (une adresse se compose à la main, #18907)', () => {
    expect(callBackIntentFromSearch('/c/conv-1', search({ [CALL_BACK_PARAM]: 'video', [CALL_BACK_NAME_PARAM]: 'Awa' }))).toEqual({
      conversationId: 'conv-1',
      media: 'video',
      title: '',
      isGroup: false,
      origin: 'url',
    });
  });

  test('l’adresse ne dit pas non plus si c’est un groupe : la conversation le sait mieux qu’elle', () => {
    expect(
      callBackIntentFromSearch('/c/conv-g', search({ [CALL_BACK_PARAM]: 'audio', [CALL_BACK_NAME_PARAM]: 'Équipe', [CALL_BACK_GROUP_PARAM]: '1' }))?.isGroup,
    ).toBe(false);
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
    ).toEqual({ conversationId: 'conv-1', media: 'audio', title: 'Awa', isGroup: false, origin: 'message' });
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
  test('un onglet neuf ne compose JAMAIS l’appel qu’une adresse désigne : il demande un toucher, puis oublie l’adresse (#18907)', async () => {
    const { started, confirmed, forgotten } = harness({ search: search({ [CALL_BACK_PARAM]: 'video', [CALL_BACK_NAME_PARAM]: 'Awa' }) });
    await settle();
    expect(started).toEqual([]);
    expect(confirmed).toEqual([{ conversationId: 'conv-1', media: 'video', title: '', avatar: null, isGroup: false }]);
    expect(forgotten).toEqual([1]);
  });

  test('une adresse forgée ne choisit ni le nom ni le groupe de l’appel, même quand le navigateur laisse jouer le son', async () => {
    const h = harness({
      path: '/c/conv-1',
      search: search({ [CALL_BACK_PARAM]: 'video', [CALL_BACK_NAME_PARAM]: 'Maman', [CALL_BACK_GROUP_PARAM]: '1' }),
      mayPlayAudio: true,
    });
    await settle();
    expect(h.started).toEqual([]);
    expect(h.confirmed).toHaveLength(1);
    expect(h.confirmed[0]?.title).not.toBe('Maman');
    expect(h.confirmed[0]?.isGroup).toBe(false);
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
    const h = harness({ connected: false, search: search({ [CALL_BACK_PARAM]: 'audio' }) });
    await settle();
    expect(h.confirmed).toEqual([]);
    expect(h.forgotten).toEqual([1]);

    await h.connect();
    expect(h.confirmed).toEqual([{ conversationId: 'conv-1', media: 'audio', title: '', avatar: null, isGroup: false }]);
    expect(h.started).toEqual([]);
  });

  test('le message du worker attend aussi la connexion', async () => {
    const h = harness({ connected: false });
    await h.post({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/conv-2', callBack: { conversationId: 'conv-2', media: 'video', title: 'Bo', isGroup: false } });
    expect(h.started).toEqual([]);

    await h.connect();
    expect(h.started.map((request) => request.conversationId)).toEqual(['conv-2']);
  });

  test('quand le son ne peut pas partir sans geste, le message du worker demande une confirmation au lieu de composer', async () => {
    const h = harness({ mayPlayAudio: false });
    await h.post({ type: NOTIFICATION_CLICKED_MESSAGE, url: '/c/conv-1', callBack: { conversationId: 'conv-1', media: 'video', title: 'Awa', isGroup: false } });
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

describe('l’identité d’un rappel vient de la conversation connue (#18907)', () => {
  const known = { title: 'Awa', avatar: 'https://gate.meeshy.me/a.png', isGroup: true };

  test('sans nom dans la demande, le titre, l’avatar et le groupe sont ceux de la conversation', () => {
    expect(identifyCallBack({ conversationId: 'c', media: 'audio', title: '', avatar: null, isGroup: false }, known)).toEqual({
      conversationId: 'c',
      media: 'audio',
      title: 'Awa',
      avatar: 'https://gate.meeshy.me/a.png',
      isGroup: true,
    });
  });

  test('une conversation inconnue garde ce que la demande porte', () => {
    expect(
      identifyCallBack({ conversationId: 'c', media: 'audio', title: 'Bo', avatar: null, isGroup: true }, { title: '', avatar: null, isGroup: false }),
    ).toEqual({ conversationId: 'c', media: 'audio', title: 'Bo', avatar: null, isGroup: true });
  });
});
