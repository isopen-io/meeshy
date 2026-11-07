import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { createBringStore, type BringStoreApi } from '@/lib/bring/bring-live';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { BringRingHost } from './bring-ring-host';

/**
 * L'ÉCRAN DE SONNERIE DU BRING, ONGLET OUVERT (#13936, `proche-bring@web`) —
 * iso du contrat iOS : un son FORCÉ qui sonne jusqu'à ce qu'on l'arrête d'un
 * geste, ou jusqu'à `expiresAt`, et dont l'arrêt part au serveur pour TOUS les
 * appareils.
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

const ring = (overrides: Readonly<Record<string, string>> = {}) => ({
  bringId: 'b1',
  fromUserId: 'u-ada',
  toUserId: 'me',
  sentAt: new Date(Date.now() - 5_000).toISOString(),
  expiresAt: new Date(Date.now() + 115_000).toISOString(),
  ...overrides,
});

function fakeTones() {
  const calls: string[] = [];
  return { calls, start: (kind: string) => void calls.push(`start:${kind}`), stop: () => void calls.push('stop') };
}

function fakeDeps() {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return { ok: true, data: { bringId: 'b1', stopped: true } };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

const host = (store: BringStoreApi, tones: ReturnType<typeof fakeTones>, deps = fakeDeps().deps) => (
  <BringRingHost language="fr" store={store} deps={deps} tones={tones} watch={() => () => undefined} />
);

describe('l’écran de sonnerie', () => {
  test('rien ne sonne, rien ne s’affiche, sans Bring en vol', async () => {
    const tones = fakeTones();
    const node = await mount(host(createBringStore(), tones));
    expect(node.querySelector('[data-bring-ring]')).toBeNull();
    expect(tones.calls).toEqual([]);
  });

  test('un Bring reçu SONNE et s’annonce comme une alerte, l’expéditeur nommé par les caches', async () => {
    appQueryClient.setQueryData(['conversations'], {
      pages: [{ conversations: [{ participants: [{ user: { id: 'u-ada', username: 'ada', displayName: 'Ada' } }] }] }],
    });
    const store = createBringStore();
    const tones = fakeTones();
    store.getState().receive(ring());
    const node = await mount(host(store, tones));
    const dialog = node.querySelector('[data-bring-ring="b1"]');
    expect(dialog?.getAttribute('role')).toBe('alertdialog');
    expect(dialog?.textContent).toContain('Ada vous fait sonner');
    expect(tones.calls).toEqual(['start:ring']);
  });

  test('un expéditeur inconnu des caches n’est pas inventé', async () => {
    const store = createBringStore();
    store.getState().receive(ring({ fromUserId: 'u-unknown' }));
    const node = await mount(host(store, fakeTones()));
    expect(node.querySelector('[data-bring-ring]')?.textContent).toContain('Quelqu’un vous fait sonner');
  });

  test('« Arrêter » coupe le son AU GESTE et prévient le serveur (tous les appareils)', async () => {
    const store = createBringStore();
    const tones = fakeTones();
    const { deps, requests } = fakeDeps();
    store.getState().receive(ring());
    const node = await mount(host(store, tones, deps));
    await click(node.querySelector<HTMLButtonElement>('[data-bring-stop]'));
    expect(node.querySelector('[data-bring-ring]')).toBeNull();
    expect(tones.calls).toEqual(['start:ring', 'stop']);
    expect(requests.map((req) => `${req.method} ${req.path}`)).toEqual(['DELETE /api/v1/bring/b1']);
  });

  test('`bring:stopped` venu d’ailleurs (autre appareil, expéditeur) coupe aussi le son', async () => {
    const store = createBringStore();
    const tones = fakeTones();
    store.getState().receive(ring());
    const node = await mount(host(store, tones));
    await act(async () => store.getState().stop('b1'));
    await settle();
    expect(node.querySelector('[data-bring-ring]')).toBeNull();
    expect(tones.calls).toEqual(['start:ring', 'stop']);
  });

  test('à `expiresAt`, le son cesse sans événement du serveur', async () => {
    const store = createBringStore();
    const tones = fakeTones();
    store.getState().receive(ring({ expiresAt: new Date(Date.now() + 30).toISOString() }));
    const node = await mount(host(store, tones));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    await settle();
    expect(node.querySelector('[data-bring-ring]')).toBeNull();
    expect(tones.calls).toEqual(['start:ring', 'stop']);
  });

  test('l’hôte s’accroche à la socket vivante, et s’en détache au démontage', async () => {
    let attached = 0;
    let detached = 0;
    await mount(
      <BringRingHost
        language="fr"
        store={createBringStore()}
        deps={fakeDeps().deps}
        tones={fakeTones()}
        watch={() => {
          attached += 1;
          return () => void (detached += 1);
        }}
      />,
    );
    expect(attached).toBe(1);
    unmountAll();
    expect(detached).toBe(1);
  });
});
