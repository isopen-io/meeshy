import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useRememberSeenMedia } from './use-remember-seen-media';

/**
 * #11326 — UN MÉDIA EST « VU » QUAND SA LECTURE DÉMARRE, sur la page visible :
 * c'est alors seulement que la garde du seau « récents » est sollicitée — une
 * fois par élément, jamais pour un voisin préchargé.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

async function mount(active: boolean) {
  const seen: { readonly src: string; readonly protection: string }[] = [];
  const element = window.document.createElement('video');
  function Probe() {
    useRememberSeenMedia({ element, src: 'https://g/reel.mp4', protection: 'none', active, remember: async (media) => void seen.push(media) });
    return null;
  }
  const container = window.document.createElement('div');
  const root = createRoot(container);
  await act(async () => root.render(<Probe />));
  return { element, seen, unmount: () => act(() => root.unmount()) };
}

describe('useRememberSeenMedia', () => {
  test('la lecture du média visible démarre : la garde est sollicitée, une seule fois', async () => {
    const probe = await mount(true);
    await act(async () => {
      probe.element.dispatchEvent(new Event('playing'));
      probe.element.dispatchEvent(new Event('playing'));
    });
    expect(probe.seen).toEqual([{ src: 'https://g/reel.mp4', protection: 'none' }]);
    probe.unmount();
  });

  test('un voisin préchargé qui n’est pas visible n’est pas « vu »', async () => {
    const probe = await mount(false);
    await act(async () => probe.element.dispatchEvent(new Event('playing')));
    expect(probe.seen).toEqual([]);
    probe.unmount();
  });

  test('démonté, l’élément n’est plus écouté', async () => {
    const probe = await mount(true);
    probe.unmount();
    await act(async () => probe.element.dispatchEvent(new Event('playing')));
    expect(probe.seen).toEqual([]);
  });
});
