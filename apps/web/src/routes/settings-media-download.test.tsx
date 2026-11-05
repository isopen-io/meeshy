import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createMediaDownloadStore, MEDIA_DOWNLOAD_STORAGE_KEY } from '@/lib/media/media-download-preferences';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { MediaDownloadRows } from './settings-media-download';

/**
 * **LE RÉGLAGE A UN EFFET** (#6333) — choisir une politique l'applique aussitôt
 * et l'écrit sur l'appareil, d'où le fil la relit.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const memory = () => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, value),
    removeItem: (key: string) => void entries.delete(key),
  };
};

describe('MediaDownloadRows', () => {
  test('choisir « Jamais » pour les images l’applique et l’écrit sur l’appareil ; les vidéos gardent leur politique', () => {
    const storage = memory();
    const store = createMediaDownloadStore(storage);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<MediaDownloadRows language="fr" store={store} />));

    const images = host.querySelector<HTMLSelectElement>('[data-media-download="image"]');
    expect(images?.value).toBe('wifiAndGoodCellular');
    act(() => {
      if (images === null) return;
      images.value = 'never';
      images.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(store.getState()).toEqual({ image: 'never', video: 'wifiOnly' });
    expect(JSON.parse(storage.entries.get(MEDIA_DOWNLOAD_STORAGE_KEY) ?? '{}')).toEqual({ image: 'never', video: 'wifiOnly' });
    expect(host.querySelector<HTMLSelectElement>('[data-media-download="image"]')?.value).toBe('never');
  });

  test('chaque sélecteur est nommé par sa rangée et décrit par la légende', () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<MediaDownloadRows language="fr" store={createMediaDownloadStore(memory())} />));
    const videos = host.querySelector<HTMLSelectElement>('[data-media-download="video"]');
    expect(videos?.closest('label')?.textContent).toContain('Vidéos');
    const caption = host.querySelector(`[id="${videos?.getAttribute('aria-describedby') ?? ''}"]`);
    expect(caption?.textContent).toContain('100 Ko');
  });
});
