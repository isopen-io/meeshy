import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import type { FeedPost } from '@/lib/api/feed-pages';
import { postQueryKey } from '@/lib/api/publication-detail';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentThread } from './comment-thread';

/**
 * **DES COMMENTAIRES FERMÉS, LE FIL RESTE LISIBLE ET LE DIT** (#16541) — la
 * barre d'écriture se retire, une ligne discrète la remplace, les rangées
 * restent là, et le réglage se suit EN DIRECT (une diffusion ou le geste de
 * l'auteur écrit la caisse ; le fil la relit).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const POST_ID = 'post-text-rank2';

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

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 30)));

const seed = (commentsDisabled: boolean) =>
  appQueryClient.setQueryData<FeedPost>(postQueryKey(POST_ID), { id: POST_ID, type: 'POST', createdAt: '2026-11-01T10:00:00.000Z', commentsDisabled });

async function mountThread(): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={appQueryClient}>
        <CommentThread postId={POST_ID} />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

const composer = (host: HTMLElement) => host.querySelector('form[data-comment-composer]');
const closedLine = (host: HTMLElement) => host.querySelector('[data-comment-composer="closed"]');

describe('un fil aux commentaires fermés', () => {
  test('n’offre pas la barre d’écriture, et dit pourquoi — les commentaires restent lisibles', async () => {
    seed(true);
    const host = await mountThread();
    expect(composer(host)).toBe(null);
    expect(closedLine(host)?.textContent).toBe('Les commentaires sont désactivés.');
    expect(host.querySelectorAll('[data-comment-row]').length).toBeGreaterThan(0);
    expect(host.querySelector('[data-comment-gesture="reply"]')).toBe(null);
  });

  test('ouverts, la barre est là et la ligne n’existe pas', async () => {
    seed(false);
    const host = await mountThread();
    expect(composer(host)).not.toBe(null);
    expect(closedLine(host)).toBe(null);
  });

  test('le réglage se suit en direct : fermé puis rouvert sans recharger', async () => {
    seed(false);
    const host = await mountThread();
    await act(async () => seed(true));
    await settle();
    expect(composer(host)).toBe(null);
    expect(closedLine(host)).not.toBe(null);
    await act(async () => seed(false));
    await settle();
    expect(composer(host)).not.toBe(null);
  });
});
