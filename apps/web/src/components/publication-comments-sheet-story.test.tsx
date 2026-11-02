import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { StoryPlaybackStory } from '@/lib/stories/playback';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { PublicationCommentsSheet } from './publication-comments-sheet';

/**
 * **LA FEUILLE DES COMMENTAIRES D'UNE STORY REMET LA STORY AU FIL** (#13922) —
 * le lecteur de stories monte la feuille avec la story qu'il joue ; « Imager »
 * un commentaire compose alors la carte autour de son visuel, comme
 * `StoryCommentRowView` iOS (`story: commentCardStory`).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  appQueryClient.clear();
  resetFixtureCommentsForTests();
});

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
};

const story: StoryPlaybackStory = {
  id: 'post-text-rank2',
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  content: 'Le lac',
  author: { id: 'u-author', username: 'author', displayName: 'Auteur' },
  media: [{ id: 'st-photo', fileUrl: '/lac.jpg', mimeType: 'image/jpeg', width: 1080, height: 1920 }],
  visibility: 'PUBLIC',
};

describe('la feuille des commentaires d’une story', () => {
  test('« Imager » un commentaire ouvre l’atelier sur « Post + commentaire », la story en tête', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(
        <QueryClientProvider client={appQueryClient}>
          <PublicationCommentsSheet postId={story.id} story={story} onClose={() => undefined} />
        </QueryClientProvider>,
      );
    });
    await settle();
    await act(async () => container?.querySelector<HTMLButtonElement>('[data-comment-row="cm-r2-3"] [data-comment-gesture="more"]')?.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-comment-menu] [data-comment-gesture="image"]')?.click());
    for (let attempt = 0; attempt < 20 && document.querySelector('[data-export-compose-mode]') === null; attempt += 1) await settle();
    expect(document.querySelector('[data-export-compose-mode="postAndComment"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});
