import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';

import { FeedPostCard } from './feed-post-card';

/**
 * LA PUBLICATION CITÉE (#6278 c) — un repost SIMPLE rend l'ORIGINAL en carte
 * imbriquée (`FeedRepostEmbed`), miroir `FeedPostCard.swift:822-910`. Ces
 * témoins mesurent l'EFFET (loi 4) : le rendu du corps cité au Prisme, `lang=`
 * sur un rang ≠ 1, et le clic qui mène à l'original — jamais seulement la
 * présence du bloc.
 */
describe('FeedPostCard — la publication citée d’un repost simple', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const NOW = new Date('2026-09-25T12:00:00.000Z');

  const mount = (post: FeedPost) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<FeedPostCard model={resolveFeedCardModel(post, { preferredLanguages: ['fr', 'es'], now: NOW })} />);
    });
  };

  const post = (partial: Partial<FeedPost>): FeedPost => ({
    id: 'p1',
    type: 'POST',
    createdAt: '2026-09-25T11:55:00.000Z',
    ...partial,
  });

  test('le corps cité, servi à un rang ≠ 1, porte `lang=` sur la langue SERVIE — jamais l’original', () => {
    mount(
      post({
        repostOf: {
          id: 'orig-1',
          type: 'POST',
          content: 'Good morning',
          originalLanguage: 'en',
          translations: { es: { text: 'Buenos días' } },
          author: { id: 'u9', displayName: 'Yann Petit' },
          likeCount: 12,
        },
      }),
    );

    const embed = container.querySelector('[data-feed-repost-embed]');
    expect(embed).not.toBeNull();
    expect(embed?.textContent).toContain('Buenos días');
    expect(embed?.textContent).not.toContain('Good morning');
    const texte = embed?.querySelector('[lang]');
    expect(texte?.getAttribute('lang')).toBe('es');
    expect(embed?.textContent).toContain('Yann Petit');
    expect(embed?.textContent).toContain('12');
  });

  test('la carte citée MÈNE à l’original — un `<a>` distinct de la porte de la republication', () => {
    mount(post({ content: 'Regardez', originalLanguage: 'fr', repostOf: { id: 'orig-2', type: 'POST', author: { id: 'u9' } } }));

    const open = container.querySelector('a[data-feed-repost-embed-open]');
    expect(open).not.toBeNull();
    expect(open?.getAttribute('href')).toContain('orig-2');
  });

  test('sans `id` sur l’original, la carte citée reste NON cliquable — jamais un lien mort', () => {
    mount(post({ repostOf: { type: 'POST', author: { id: 'u9', displayName: 'Compte supprimé' } } }));

    expect(container.querySelector('a[data-feed-repost-embed-open]')).toBeNull();
    expect(container.querySelector('[data-feed-repost-embed]')?.textContent).toContain('Compte supprimé');
  });

  test('la puce nomme le médium cité — STORY et REEL, jamais pour un POST', () => {
    mount(post({ repostOf: { id: 'o1', type: 'STORY', author: { id: 'u1' } } }));
    expect(container.querySelector('[data-feed-repost-embed-chip]')?.textContent).toBe('Story');
  });

  test('sans republication, aucune carte citée dans le DOM', () => {
    mount(post({ content: 'Un post ordinaire', originalLanguage: 'fr' }));
    expect(container.querySelector('[data-feed-repost-embed]')).toBeNull();
  });
});
