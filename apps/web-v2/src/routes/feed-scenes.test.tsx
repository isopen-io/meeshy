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

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/feed' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
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

describe('le fil monte les scènes et navigue à défaut de plein écran', () => {
  test('les cartes post-scene-* rendent [data-feed-scene]', async () => {
    const el = await mount();
    const textCard = el.querySelector('[data-feed-card-id="post-scene-text"]');
    expect(textCard?.querySelector('[data-feed-scene]')).not.toBeNull();
    const mixedCard = el.querySelector('[data-feed-card-id="post-scenes-mixed"]');
    expect(mixedCard?.querySelectorAll('[data-feed-scene-index]').length).toBe(3);
  });

  test('le tap sur une scène mono-page navigue vers /post/post-scene-text?scene=0', async () => {
    const el = await mount();
    const card = el.querySelector('[data-feed-card-id="post-scene-text"]');
    const button = card?.querySelector('[data-feed-scene] button') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    expect(window.location.pathname).toBe('/post/post-scene-text');
    expect(window.location.search).toBe('?scene=0');
  });
});
