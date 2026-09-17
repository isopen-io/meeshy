import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { appQueryClient } from '@/lib/api/query-client';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import FeedScreen from './feed';

/**
 * T16 (#6898) — LE FIL MONTE LES SCÈNES ET ÉLIT UNE LECTURE. Un montage
 * COMPLET (`FeedScreen`, fixtures réelles servies par `useFeed`) plutôt
 * qu'une carte isolée : c'est le SEUL niveau où « le fil monte-t-il vraiment
 * les cartes à scènes » se prouve.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/feed' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  // Les DEUX chunks À LA DEMANDE de la galerie plein écran (#6902) —
  // pré-chauffés pour que le témoin n'attende pas seul leur compilation.
  await Promise.all([import('@/components/media-viewer'), import('@/components/scene-player')]);
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
  window.history.pushState(null, '', '/feed');
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

async function mount(): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <FeedScreen />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

describe('le fil monte les scènes et les ouvre en plein écran, EN PLACE (#6902)', () => {
  test('les cartes post-scene-* rendent [data-feed-scene]', async () => {
    const el = await mount();
    const textCard = el.querySelector('[data-feed-card-id="post-scene-text"]');
    expect(textCard?.querySelector('[data-feed-scene]')).not.toBeNull();
    const mixedCard = el.querySelector('[data-feed-card-id="post-scenes-mixed"]');
    expect(mixedCard?.querySelectorAll('[data-feed-scene-index]').length).toBe(3);
  });

  /**
   * #6902 — le tap OUVRAIT le détail par une navigation (`?scene=0`) : cette
   * intérim est remplacée par `useSceneGallery`/`SceneFullscreenGallery`, EN
   * PLACE sur `/feed` — la MÊME visionneuse que la galerie de médias, une
   * page de plus (`scenes.get(id)`, `gallery-lot.ts`).
   */
  test('le tap sur une scène mono-page ouvre [data-scene-fullscreen] EN PLACE — AUCUNE navigation, /feed reste l’adresse', async () => {
    const el = await mount();
    const card = el.querySelector('[data-feed-card-id="post-scene-text"]');
    const button = card?.querySelector('[data-feed-scene] button') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    await settle();

    expect(window.location.pathname).toBe('/feed');
    const dialog = document.body.querySelector('[data-scene-fullscreen]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('data-viewer-index')).toBe('0');
  });

  test('history.back() ferme la couche — /feed reste sans [data-scene-fullscreen] ni <video> en lecture', async () => {
    const el = await mount();
    const card = el.querySelector('[data-feed-card-id="post-scenes-mixed"]');
    const button = card?.querySelector('[data-feed-scene-index="0"] button') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    await settle();
    expect(document.body.querySelector('[data-scene-fullscreen]')).not.toBeNull();

    await act(async () => {
      window.history.back();
    });
    await settle();

    expect(document.body.querySelector('[data-scene-fullscreen]')).toBeNull();
    expect(Array.from(document.body.querySelectorAll('video')).some((v) => !v.paused)).toBe(false);
  });
});
