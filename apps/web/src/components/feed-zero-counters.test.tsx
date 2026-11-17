import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';

import { FeedPostCard } from './feed-post-card';

/**
 * Épure #17584 (#18446), règle 5 : un compteur à 0 est un texte en trop. La
 * rangée d'actions et le cœur d'un repartage n'écrivent que les compteurs
 * NON NULS ; le glyphe garde le nom accessible, donc chaque geste reste
 * atteignable et nommé.
 */
describe('un compteur nul ne s’écrit pas', () => {
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

  const NOW = new Date('2026-09-13T12:00:00.000Z');
  const noop = () => undefined;

  const mount = (post: FeedPost) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <FeedPostCard
          model={resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: NOW })}
          onGesture={noop}
          onShare={noop}
          onComment={noop}
          onRepost={noop}
        />,
      );
    });
  };

  const post = (partial: Partial<FeedPost>): FeedPost => ({
    id: 'p1',
    type: 'POST',
    createdAt: '2026-09-13T11:55:00.000Z',
    content: 'Bonjour',
    originalLanguage: 'fr',
    ...partial,
  });

  const actions = () => container.querySelector('[data-feed-actions]') as HTMLElement;

  test('une carte sans aucun compteur ne montre aucun chiffre', () => {
    mount(post({}));
    expect(actions().textContent?.trim()).toBe('');
  });

  test('les cinq gestes restent nommés et atteignables sans compteur', () => {
    mount(post({}));
    const names = Array.from(actions().querySelectorAll('[role="img"]')).map((n) => n.getAttribute('aria-label'));
    expect(names).toEqual(['Aimer', 'Commenter', 'Repartager', 'Enregistrer', 'Partager']);
    for (const kind of ['like', 'comment', 'repost', 'bookmark', 'share']) {
      expect(actions().querySelector(`button[data-feed-gesture="${kind}"]`)).not.toBeNull();
    }
  });

  test('un compteur non nul s’écrit toujours, les autres restent muets', () => {
    mount(post({ likeCount: 3 }));
    expect(actions().textContent?.trim()).toBe('3');
    expect(actions().querySelector('button[data-feed-gesture="like"]')?.textContent).toContain('3');
  });

  test('le cœur d’un repartage sans « j’aime » est un cœur seul, nommé', () => {
    mount(post({ repostOf: { id: 'o1', type: 'POST', content: 'Salut', originalLanguage: 'fr', author: { id: 'u9' }, likeCount: 0 } }));
    const likes = container.querySelector('[data-feed-repost-embed-likes]');
    expect(likes).not.toBeNull();
    expect(likes?.textContent?.trim()).toBe('');
    expect(likes?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Aimer');
  });
});
