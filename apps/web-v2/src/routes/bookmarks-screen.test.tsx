import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { BOOKMARKS_QUERY_KEY } from '@/lib/api/bookmarked-posts';
import { FEED_QUERY_KEY } from '@/lib/api/feed';
import type { FeedInfiniteData, FeedPost } from '@/lib/api/feed-pages';
import { BOOKMARKED_POSTS } from '@/lib/api/fixtures-bookmarks';
import { appQueryClient } from '@/lib/api/query-client';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import BookmarksScreen from './bookmarks';

/**
 * **L'ÉCRAN DES PUBLICATIONS ENREGISTRÉES, MONTÉ EN ENTIER** (#7286) — les
 * états que les composants purs de `bookmarks.test.tsx` ne peuvent pas dire,
 * parce qu'ils dépendent de la requête : le CHARGEMENT (cache vide), le
 * PEUPLÉ (servi par les fixtures), le CACHE D'ABORD (aucun squelette sur un
 * cache non vide) et le RETRAIT depuis l'écran, qui doit ôter la carte ICI et
 * éteindre le signet dans le Flux.
 *
 * Même méthode que `feed-scenes.test.tsx` : `appQueryClient`, le client que
 * `postGestureAction` écrit — un client local ne verrait pas le geste.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/bookmarks' });
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
  appQueryClient.clear();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

function mountNow(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <BookmarksScreen />
      </QueryClientProvider>,
    );
  });
  return container;
}

const corpusOf = (posts: readonly FeedPost[]): FeedInfiniteData => ({
  pages: [{ posts, pagination: { limit: 20, hasMore: false, nextCursor: null } }],
  pageParams: [undefined],
});

const cardIds = (el: HTMLElement): readonly string[] =>
  Array.from(el.querySelectorAll('[data-feed-card-id]')).map((card) => card.getAttribute('data-feed-card-id') ?? '');

describe('l’écran monté — chargement, peuplé, cache d’abord', () => {
  test('CACHE VIDE : le squelette, annoncé occupé, avant toute réponse', () => {
    const el = mountNow();
    expect(el.querySelector('#contenu')?.getAttribute('aria-busy')).toBe('true');
    expect(cardIds(el)).toEqual([]);
  });

  test('PEUPLÉ : les publications servies, et le sélecteur (le corpus porte un réel ET des postes)', async () => {
    const el = mountNow();
    await settle();

    expect([...cardIds(el)].sort()).toEqual(BOOKMARKED_POSTS.map((post) => post.id).sort());
    expect(el.querySelector('#contenu')?.hasAttribute('aria-busy')).toBe(false);
    expect(el.querySelector('[role="group"]')).not.toBeNull();
  });

  test('CACHE D’ABORD : un corpus déjà en cache se peint à la PREMIÈRE image, sans squelette', () => {
    appQueryClient.setQueryData(BOOKMARKS_QUERY_KEY, corpusOf([BOOKMARKED_POSTS[0] as FeedPost]));
    const el = mountNow();

    expect(el.querySelector('#contenu')?.hasAttribute('aria-busy')).toBe(false);
    expect(cardIds(el)).toEqual([(BOOKMARKED_POSTS[0] as FeedPost).id]);
  });

  test('VIDE : l’état qui apprend le geste, pas une liste muette', () => {
    appQueryClient.setQueryData(BOOKMARKS_QUERY_KEY, corpusOf([]));
    const el = mountNow();

    expect(cardIds(el)).toEqual([]);
    expect(el.textContent).toContain('Aucune publication enregistrée');
    expect(el.querySelector('a[href="/feed"]')).not.toBeNull();
  });
});

describe('retirer DEPUIS l’écran', () => {
  test('la carte quitte l’écran sur-le-champ, et le signet s’éteint dans le Flux', async () => {
    const [premier, second] = BOOKMARKED_POSTS as readonly [FeedPost, FeedPost];
    appQueryClient.setQueryData(BOOKMARKS_QUERY_KEY, corpusOf([premier, second]));
    appQueryClient.setQueryData(FEED_QUERY_KEY, corpusOf([premier]));
    const el = mountNow();

    const signet = el.querySelector(
      `[data-feed-card-id="${premier.id}"] button[data-feed-gesture="bookmark"]`,
    ) as HTMLButtonElement | null;
    expect(signet?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      signet?.click();
    });
    await settle();

    expect(cardIds(el)).toEqual([second.id]);
    const dansLeFlux = appQueryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY)?.pages[0]?.posts[0];
    expect(dansLeFlux?.isBookmarkedByMe).toBe(false);
  });
});
