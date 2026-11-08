import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { TOGETHER_CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/together-event-names';

import { mediaHubConversationKey } from '@/lib/api/media-hub-cache';
import { appQueryClient } from '@/lib/api/query-client';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import type { SocketClient } from '@/lib/net/socket';
import { createTogetherStore, decodeTogetherInvited, decodeTogetherStarted, type TogetherStoreApi } from '@/lib/together/together-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { TogetherHost } from './together-host';

/**
 * REGARDER OU ÉCOUTER ENSEMBLE, ONGLET OUVERT (#17055) — une invitation se propose
 * sans bloquer l'écran, « Rejoindre » ouvre le lecteur d'un geste, la lecture suit la
 * séance, et « Quitter » la ferme chez les deux.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

const ADA = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CONV = 'cccccccccccccccccccccccc';
const PIECE = 'dddddddddddddddddddddddd';
const SESSION = '0123456789abcdef0123456789abcdef';

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

const knowAda = (): void => {
  appQueryClient.setQueryData(['conversations'], {
    pages: [{ conversations: [{ participants: [{ user: { id: ADA, username: 'ada', displayName: 'Ada' } }] }] }],
  });
};

const cachePiece = (): void => {
  appQueryClient.setQueryData([...mediaHubConversationKey(CONV), 'visual', ''], {
    pages: [{ messages: [{ attachments: [{ id: PIECE, fileUrl: 'https://media.example/film.mp4' }] }] }],
    pageParams: [undefined],
  });
};

const invitation = () => decodeTogetherInvited({ sessionId: SESSION, fromUserId: ADA, conversationId: CONV, attachmentId: PIECE, media: 'video', expiresAt: '2026-11-08T18:02:00.000Z' })!;

const startedAt = (positionMs: number, playing = false, rev = 0) =>
  decodeTogetherStarted({
    sessionId: SESSION,
    hostUserId: ADA,
    guestUserId: 'me',
    conversationId: CONV,
    attachmentId: PIECE,
    media: 'video',
    playback: { playing, positionMs, at: Date.now(), rev, byUserId: ADA },
  })!;

function fakeSocket(ack: (event: string) => unknown = () => ({ success: true })) {
  const emitted: { event: string; payload: unknown }[] = [];
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: () => undefined,
    off: () => undefined,
    emit: (event: string, payload?: unknown) => {
      emitted.push({ event, payload });
    },
    emitWithAck: async (event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return ack(event);
    },
  };
  return { socket, emitted };
}

const host = (store: TogetherStoreApi, socket: SocketClient = fakeSocket().socket) => (
  <TogetherHost
    language="fr"
    store={store}
    watch={(watcher) => {
      const stop = watcher(socket);
      return () => stop?.();
    }}
  />
);

describe('l’invitation reçue', () => {
  test('rien ne s’affiche sans invitation ni séance', async () => {
    const node = await mount(host(createTogetherStore()));
    expect(node.querySelector('[data-together-invitation], [data-together-player], [data-together-waiting]')).toBeNull();
  });

  test('elle s’annonce sans bloquer l’écran, l’hôte nommé par les caches', async () => {
    knowAda();
    const store = createTogetherStore();
    store.getState().invited(invitation());
    const node = await mount(host(store));
    const region = node.querySelector(`[data-together-invitation="${SESSION}"]`);
    expect(region?.getAttribute('aria-modal')).toBeNull();
    expect(region?.textContent).toContain('Ada vous invite à regarder une vidéo ensemble');
    expect(node.querySelector('[data-together-join]')?.getAttribute('aria-label')).toBe('Rejoindre Ada');
  });

  test('« Refuser » la retire au geste et le dit au serveur', async () => {
    const store = createTogetherStore();
    const live = fakeSocket();
    store.getState().invited(invitation());
    const node = await mount(host(store, live.socket));
    await click(node.querySelector<HTMLButtonElement>('[data-together-decline]'));
    expect(node.querySelector('[data-together-invitation]')).toBeNull();
    expect(live.emitted).toEqual([{ event: TOGETHER_CLIENT_EVENTS.TOGETHER_LEAVE, payload: { sessionId: SESSION } }]);
  });

  test('« Rejoindre » ouvre le lecteur sur la pièce, à la position servie', async () => {
    knowAda();
    cachePiece();
    const store = createTogetherStore();
    const live = fakeSocket(() => ({ success: true, data: { ...startedAt(12_000), guestUserId: 'me' } }));
    store.getState().invited(invitation());
    const node = await mount(host(store, live.socket));
    await click(node.querySelector<HTMLButtonElement>('[data-together-join]'));
    await settle();
    expect(live.emitted[0]).toEqual({ event: TOGETHER_CLIENT_EVENTS.TOGETHER_JOIN, payload: { sessionId: SESSION } });
    const video = node.querySelector<HTMLVideoElement>('[data-together-media="video"]');
    expect(video?.getAttribute('src')).toBe('https://media.example/film.mp4');
    expect(video?.hasAttribute('controls')).toBe(true);
    expect(video?.currentTime).toBe(12);
    expect(node.querySelector(`[data-together-player="${SESSION}"]`)?.getAttribute('aria-label')).toBe('Ensemble avec Ada');
  });
});

describe('la séance ouverte', () => {
  test('un état servi plus récent déplace le lecteur', async () => {
    cachePiece();
    const store = createTogetherStore();
    store.getState().started(startedAt(0), 'me');
    const node = await mount(host(store));
    await settle();
    await act(async () => {
      store.getState().synced({ sessionId: SESSION, playback: { playing: false, positionMs: 45_000, at: Date.now(), rev: 1, byUserId: ADA } });
    });
    expect(node.querySelector<HTMLVideoElement>('[data-together-media]')?.currentTime).toBe(45);
  });

  test('« Quitter » ferme le lecteur ici, le dit au serveur, et l’annonce', async () => {
    cachePiece();
    const store = createTogetherStore();
    const live = fakeSocket();
    store.getState().started(startedAt(0), 'me');
    const node = await mount(host(store, live.socket));
    await click(node.querySelector<HTMLButtonElement>('[data-together-leave]'));
    expect(node.querySelector('[data-together-player]')).toBeNull();
    expect(live.emitted).toEqual([{ event: TOGETHER_CLIENT_EVENTS.TOGETHER_LEAVE, payload: { sessionId: SESSION } }]);
    expect(node.querySelector('[data-together-notice]')?.textContent).toBe('La séance ensemble est terminée.');
  });

  test('une pièce introuvable le dit, sans lecteur muet', async () => {
    const store = createTogetherStore();
    store.getState().started(startedAt(0), 'me');
    const node = await mount(host(store));
    await settle();
    expect(node.querySelector('[data-together-media]')).toBeNull();
    expect(node.querySelector('[data-together-unavailable]')?.textContent).toBe('Ce média ne se lit pas sur cet appareil.');
  });
});

describe('l’invitation envoyée', () => {
  test('« En attente de Ada · Annuler » ; annuler retire l’attente et le dit au serveur', async () => {
    knowAda();
    const store = createTogetherStore();
    const live = fakeSocket();
    store.getState().waiting({ sessionId: SESSION, toUserId: ADA, media: 'video' });
    const node = await mount(host(store, live.socket));
    expect(node.querySelector('[data-together-waiting]')?.textContent).toContain('En attente de Ada…');
    await click(node.querySelector<HTMLButtonElement>('[data-together-cancel]'));
    expect(node.querySelector('[data-together-waiting]')).toBeNull();
    expect(live.emitted).toEqual([{ event: TOGETHER_CLIENT_EVENTS.TOGETHER_LEAVE, payload: { sessionId: SESSION } }]);
  });
});

