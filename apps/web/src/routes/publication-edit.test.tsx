import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test } from 'bun:test';
import { QueryClientProvider } from '@tanstack/react-query';

import type { FeedPost } from '@/lib/api/feed-pages';
import { postQueryKey } from '@/lib/api/publication-detail';
import { appQueryClient } from '@/lib/api/query-client';
import { buildStoryCanvasEffectsPages } from '@/lib/stories/story-document';
import { newTextLayer } from '@/lib/stories/studio-text';
import { PublicationEditView } from '@/routes/publication-edit';
import { ROUTES } from '@/routes/route-table';
import { VIEWER_ID, flush, publishButton, registerStudioBench } from '@/test-support/story-studio-bench';

/**
 * **L'ADRESSE `/posts/:id/edit`** (#9317) — elle lit la publication
 * CACHE-FIRST (la carte du fil ou le détail déjà en cache : aucun squelette)
 * et l'ouvre dans le studio ; une publication que le studio ne sait pas
 * porter (texte seul) s'ouvre dans la feuille de texte, comme avant.
 */

registerStudioBench();

const roots: Array<{ readonly root: Root; readonly container: HTMLDivElement }> = [];

afterEach(() => {
  act(() => roots.splice(0).forEach(({ root, container }) => {
    root.unmount();
    container.remove();
  }));
  appQueryClient.removeQueries({ queryKey: ['posts'] });
});

const cached = (post: FeedPost): FeedPost => {
  appQueryClient.setQueryData(postQueryKey(post.id), post);
  return post;
};

const mountAt = (postId: string): HTMLDivElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  act(() => root.render(
    <QueryClientProvider client={appQueryClient}>
      <PublicationEditView postId={postId} />
    </QueryClientProvider>,
  ));
  return container;
};

const withScene = (id: string): FeedPost => ({
  id,
  type: 'POST',
  createdAt: '2026-10-01T10:00:00.000Z',
  author: { id: VIEWER_ID },
  storyEffects: buildStoryCanvasEffectsPages([{ id: 'page-1', texts: [{ ...newTextLayer({ id: 'text-1', language: 'fr' }), text: 'Une scène' }] }], null),
  media: [],
});

describe('PublicationEditView — /posts/:id/edit (#9317)', () => {
  test('l’adresse est déclarée, et PRIVÉE comme toute composition', async () => {
    expect(ROUTES.postEdit.pattern).toBe('/posts/$post/edit');
    const { resolveRouteAccess } = await import('@/lib/session-guard');
    expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'postEdit' })).toBe('redirect-login');
  });

  test('une publication EN CACHE s’ouvre aussitôt dans le studio, sans squelette — la capsule dit « Enregistrer »', async () => {
    const post = cached(withScene('p-cache'));
    const el = mountAt(post.id);
    await flush(() => publishButton(el) !== null);
    expect(el.querySelector('[data-story-studio]')).not.toBeNull();
    expect(publishButton(el)?.textContent).toBe('Enregistrer');
  });

  test('un post de TEXTE seul s’ouvre dans la feuille de texte', async () => {
    const post = cached({ ...withScene('p-texte'), content: 'Juste du texte', storyEffects: null });
    mountAt(post.id);
    await flush(() => document.querySelector('[data-publication-edit-sheet]') !== null);
    expect(document.querySelector<HTMLTextAreaElement>('[data-publication-edit-field]')?.value).toBe('Juste du texte');
  });
});
