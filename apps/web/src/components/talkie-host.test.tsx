import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { appQueryClient } from '@/lib/api/query-client';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createTalkieStore, type TalkieStoreApi } from '@/lib/talkie/talkie-live';
import type { TalkieSink } from '@/lib/talkie/talkie-player';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { TalkieHost } from './talkie-host';

/**
 * LE TALKIE REÇU, ONGLET OUVERT (#16638, `proche-talkie@web`) — la voix d'un
 * Proche sort sans décrocher : un indicateur DISCRET, non modal, dit qui parle,
 * et « Couper » la fait taire ici d'un geste.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

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

const incoming = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  talkieId: 't1',
  fromUserId: 'u-ada',
  codec: 'aac-adts' as const,
  startedAt: new Date().toISOString(),
  maxDurationMs: 30_000,
  ...overrides,
});

function recordingSink() {
  const silenced: string[] = [];
  const sink: TalkieSink = { play: () => undefined, silence: (talkieId) => void silenced.push(talkieId), release: () => undefined };
  return { sink, silenced };
}

const host = (store: TalkieStoreApi, sink: TalkieSink = recordingSink().sink) => <TalkieHost language="fr" store={store} sink={sink} watch={() => () => undefined} />;

describe('l’indicateur du talkie', () => {
  test('rien ne s’affiche sans prise de parole', async () => {
    const node = await mount(host(createTalkieStore()));
    expect(node.querySelector('[data-talkie-incoming]')).toBeNull();
  });

  test('une prise de parole s’annonce SANS bloquer l’écran, l’émetteur nommé par les caches', async () => {
    appQueryClient.setQueryData(['conversations'], {
      pages: [{ conversations: [{ participants: [{ user: { id: 'u-ada', username: 'ada', displayName: 'Ada' } }] }] }],
    });
    const store = createTalkieStore();
    store.getState().open(incoming());
    const node = await mount(host(store));
    const status = node.querySelector('[data-talkie-incoming="t1"]');
    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.getAttribute('aria-modal')).toBeNull();
    expect(status?.textContent).toContain('Ada vous parle');
  });

  test('un émetteur inconnu des caches n’est pas inventé', async () => {
    const store = createTalkieStore();
    store.getState().open(incoming({ fromUserId: 'u-unknown' }));
    const node = await mount(host(store));
    expect(node.querySelector('[data-talkie-incoming]')?.textContent).toContain('Quelqu’un vous parle');
  });

  test('« Couper » fait taire la voix AU GESTE et retire l’indicateur', async () => {
    appQueryClient.setQueryData(['conversations'], {
      pages: [{ conversations: [{ participants: [{ user: { id: 'u-ada', username: 'ada', displayName: 'Ada' } }] }] }],
    });
    const store = createTalkieStore();
    const { sink, silenced } = recordingSink();
    store.getState().open(incoming());
    const node = await mount(host(store, sink));
    const mute = node.querySelector<HTMLButtonElement>('[data-talkie-mute="t1"]');
    expect(mute?.getAttribute('aria-label')).toContain('Ada');
    await click(mute);
    expect(node.querySelector('[data-talkie-incoming]')).toBeNull();
    expect(silenced).toEqual(['t1']);
  });

  test('passé la durée maximale sans fin annoncée, l’indicateur part et la voix se tait', async () => {
    let shift = -32_990;
    const store = createTalkieStore({ now: () => Date.now() + shift });
    const { sink, silenced } = recordingSink();
    store.getState().open(incoming());
    shift = 0;
    const node = await mount(host(store, sink));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    await settle();
    expect(node.querySelector('[data-talkie-incoming]')).toBeNull();
    expect(silenced).toEqual(['t1']);
  });

  test('l’hôte s’accroche à la socket vivante, et s’en détache au démontage', async () => {
    let attached = 0;
    let detached = 0;
    await mount(
      <TalkieHost
        language="fr"
        store={createTalkieStore()}
        sink={recordingSink().sink}
        watch={() => {
          attached += 1;
          return () => {
            detached += 1;
          };
        }}
      />,
    );
    expect(attached).toBe(1);
    unmountAll();
    expect(detached).toBe(1);
  });
});
