import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { FeedPostCard } from './feed-post-card';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import type { FeedPost } from '@/lib/api/feed-pages';

/**
 * `FeedPostCard`, LE GESTE — loi 4 (« un contrôle existe s'il a un EFFET »).
 * Les témoins de rendu (`feed-post-card.test.tsx`) prouvent l'état INITIAL ;
 * ceux-ci prouvent que « voir plus » et la pagination du carrousel changent
 * réellement ce que le lecteur VOIT, pas seulement leur propre libellé.
 */
describe('FeedPostCard — les gestes ont un effet', () => {
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

  const monte = (post: FeedPost) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<FeedPostCard model={resolveFeedCardModel(post, { preferredLanguages: ['fr'], now: new Date('2026-09-13T12:00:00.000Z') })} />);
    });
  };

  test('« voir plus » développe le texte ENTIER, « voir moins » le retronque', () => {
    const long = Array.from({ length: 24 }, (_, i) => `mot${i}`).join(' ');
    monte({ id: 'p1', type: 'POST', createdAt: '2026-09-13T11:55:00.000Z', content: long, originalLanguage: 'fr' });

    expect(container.textContent).not.toContain('mot23');
    const seeMore = [...container.querySelectorAll('button')].find((b) => b.textContent === 'voir plus');
    expect(seeMore).toBeDefined();
    act(() => seeMore?.click());
    expect(container.textContent).toContain('mot23');
    expect(container.textContent).toContain('voir moins');

    const seeLess = [...container.querySelectorAll('button')].find((b) => b.textContent === 'voir moins');
    act(() => seeLess?.click());
    expect(container.textContent).not.toContain('mot23');
  });

  test('« Média suivant » avance le compteur du carrousel, « Média précédent » revient', () => {
    monte({
      id: 'p1',
      type: 'POST',
      createdAt: '2026-09-13T11:55:00.000Z',
      media: [
        { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 },
        { id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', order: 1 },
      ],
    });

    expect(container.querySelector('[data-feed-media-counter]')?.textContent).toBe('1 / 2');
    const next = container.querySelector('button[aria-label="Média suivant"]') as HTMLButtonElement | null;
    expect(next).not.toBeNull();
    act(() => next?.click());
    expect(container.querySelector('[data-feed-media-counter]')?.textContent).toBe('2 / 2');
    expect(container.querySelector('button[aria-label="Média suivant"]')).toBeNull();

    const prev = container.querySelector('button[aria-label="Média précédent"]') as HTMLButtonElement | null;
    act(() => prev?.click());
    expect(container.querySelector('[data-feed-media-counter]')?.textContent).toBe('1 / 2');
  });
});
