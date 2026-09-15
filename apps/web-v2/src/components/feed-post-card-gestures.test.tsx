import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import type { PostToggleKind } from '@/lib/feed/interactions';

import { FeedPostCard } from './feed-post-card';

/**
 * `FeedPostCard`, LES GESTES QUI ÉCRIVENT (#6278) — loi 4 : le bouton existe
 * parce qu'il a un effet. La carte ne tient AUCUN état de geste : elle
 * PEINT `model.viewer` (le cache du fil) et REMET l'intention à son hôte ;
 * c'est la bascule du cache, pas un `useState` local, qui remplit le cœur.
 */
describe('FeedPostCard — aimer et enregistrer remettent l’intention à l’hôte', () => {
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

  const render = (post: FeedPost, onGesture: (postId: string, kind: PostToggleKind) => void) => {
    act(() => {
      root.render(<FeedPostCard model={resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: NOW })} onGesture={onGesture} />);
    });
  };

  const mount = (post: FeedPost, onGesture: (postId: string, kind: PostToggleKind) => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render(post, onGesture);
  };

  const gesture = (kind: PostToggleKind | 'share') =>
    container.querySelector(`button[data-feed-gesture="${kind}"]`) as HTMLButtonElement | null;

  const post = (partial: Partial<FeedPost>): FeedPost => ({
    id: 'p1',
    type: 'POST',
    createdAt: '2026-09-13T11:55:00.000Z',
    content: 'Bonjour',
    originalLanguage: 'fr',
    ...partial,
  });

  test('toucher « Aimer » remet `(postId, "like")` à l’hôte, une fois', () => {
    const calls: [string, PostToggleKind][] = [];
    mount(post({ likeCount: 3 }), (postId, kind) => calls.push([postId, kind]));

    act(() => gesture('like')?.click());
    expect(calls).toEqual([['p1', 'like']]);
  });

  test('toucher « Enregistrer » remet `(postId, "bookmark")` à l’hôte', () => {
    const calls: [string, PostToggleKind][] = [];
    mount(post({}), (postId, kind) => calls.push([postId, kind]));

    act(() => gesture('bookmark')?.click());
    expect(calls).toEqual([['p1', 'bookmark']]);
  });

  test('l’état peint SUIT le modèle : un cache basculé remplit le cœur et change le compte lu', () => {
    const noop = () => undefined;
    mount(post({ isLikedByMe: false, likeCount: 3 }), noop);
    expect(gesture('like')?.getAttribute('aria-pressed')).toBe('false');
    expect(gesture('like')?.textContent).toContain('3');

    render(post({ isLikedByMe: true, likeCount: 4 }), noop);
    expect(gesture('like')?.getAttribute('aria-pressed')).toBe('true');
    expect(gesture('like')?.textContent).toContain('4');
    expect(gesture('like')?.querySelector('[data-feed-glyph-filled]')).not.toBeNull();
  });

  test('un RÉEL porte les mêmes deux gestes, posés sur le média', () => {
    const calls: [string, PostToggleKind][] = [];
    mount(post({ type: 'REEL', media: [{ id: 'm1', mimeType: 'video/mp4', fileUrl: 'r.mp4' }] }), (postId, kind) =>
      calls.push([postId, kind]),
    );

    act(() => gesture('like')?.click());
    act(() => gesture('bookmark')?.click());
    expect(calls).toEqual([
      ['p1', 'like'],
      ['p1', 'bookmark'],
    ]);
  });

  /** « Partager » n'est PAS une bascule : il n'a ni état « pressé » ni cœur
   * plein — c'est un geste ponctuel, donc un bouton simple, et il n'existe
   * que si un hôte sait partager (loi 4). */
  test('« Partager » devient un bouton dès qu’un hôte sait partager — sans `aria-pressed`', () => {
    const shared: string[] = [];
    mount(post({ shareCount: 4 }), () => undefined);
    expect(gesture('share')).toBeNull();

    act(() => {
      root.render(
        <FeedPostCard
          model={resolveFeedCardModel(post({ shareCount: 4 }), { preferredLanguages: ['fr'], now: NOW })}
          onGesture={() => undefined}
          onShare={(postId) => shared.push(postId)}
        />,
      );
    });

    const share = gesture('share');
    expect(share).not.toBeNull();
    expect(share?.hasAttribute('aria-pressed')).toBe(false);
    expect(share?.textContent).toContain('4');
    act(() => share?.click());
    expect(shared).toEqual(['p1']);
  });
});
