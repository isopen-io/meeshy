import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import { appQueryClient } from '@/lib/api/query-client';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { navigate, Router } from './route-table';

/**
 * **GLISSER POUR RÉPONDRE, SUR CHAQUE HÔTE QUI PEINT DES COMMENTAIRES**
 * (#8583, directive porteur du 2026-09-28 : « le swipe doit être appliqué sur
 * tous ces points aussi ! »). Les hôtes sont ceux de
 * `comment-translation-live.test.tsx` — la fiche d'une publication et la
 * feuille partagée des lecteurs de stories et de Réels (D-89) — montés en
 * ENTIER par l'adresse que l'application sert, sur les fixtures.
 *
 * Le parcours est celui du porteur : glisser un commentaire vers la droite ⇒
 * le composeur annonce « Répondre à X » et prend le focus ⇒ envoyer ⇒ la
 * réponse paraît SOUS sa racine, dépliée. Une réponse partie à plat en tête
 * du fil, ou un bandeau sans envoi, ferait rougir ce témoin.
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
  appQueryClient.clear();
  resetFixtureCommentsForTests();
  navigate('/feed', true);
});

const TIMEOUT_MS = 8000;
const TEST_TIMEOUT_MS = 20_000;

async function settleUntil(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  for (;;) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    if (condition() || Date.now() >= deadline) return;
  }
}

async function mountAt(url: string): Promise<HTMLDivElement> {
  navigate(url, true);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <Router wrap={(children) => children} skeleton={null} />
      </QueryClientProvider>,
    );
  });
  return container;
}

const pointer = (type: string, x: number, y: number) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 3, pointerType: 'touch', isPrimary: true });

async function swipeRight(surface: Element): Promise<void> {
  await act(async () => surface.dispatchEvent(pointer('pointerdown', 20, 40)));
  await act(async () => surface.dispatchEvent(pointer('pointermove', 60, 41)));
  await act(async () => surface.dispatchEvent(pointer('pointermove', 110, 42)));
  await act(async () => surface.dispatchEvent(pointer('pointerup', 110, 42)));
}

type Host = {
  readonly name: string;
  readonly url: string;
  readonly commentId: string;
  readonly open: (container: HTMLElement) => void;
};

const HOSTS: readonly Host[] = [
  { name: 'la fiche d’une publication', url: '/post/post-text-rank2', commentId: 'cm-r2-1', open: () => undefined },
  {
    name: 'la feuille de commentaires du lecteur de stories',
    url: '/story/st-amie-2',
    commentId: 'cm-st-1',
    open: (container) => container.querySelector<HTMLButtonElement>('[data-story-action="comments"]')?.click(),
  },
];

const swipeSurface = (container: HTMLElement, commentId: string): Element | null =>
  container.querySelector(`[data-comment-row="${commentId}"] > [data-comment-swipe]`);

describe('glisser un commentaire vers la droite ouvre le composeur pour y répondre (#8583)', () => {
  for (const host of HOSTS) {
    test(
      `${host.name} : glisser ⇒ « Répondre à X » ⇒ la réponse paraît sous sa racine`,
      async () => {
        const container = await mountAt(host.url);
        await settleUntil(
          () => swipeSurface(container, host.commentId) !== null || container.querySelector('[data-story-action="comments"]') !== null,
        );
        await act(async () => host.open(container));
        await settleUntil(() => swipeSurface(container, host.commentId) !== null);
        const surface = swipeSurface(container, host.commentId);
        if (surface === null) throw new Error(`${host.name} : la rangée ${host.commentId} ne glisse pas`);

        await swipeRight(surface);
        const banner = container.querySelector(`[data-comment-reply-banner="${host.commentId}"]`);
        expect(banner?.textContent).toContain('Répondre à');
        const field = container.querySelector<HTMLTextAreaElement>('[data-comment-field]');
        expect(document.activeElement).toBe(field);

        await act(async () => {
          if (field === null) return;
          field.value = 'Merci pour ta réponse';
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await act(async () => container.querySelector<HTMLButtonElement>('[data-comment-send]')?.click());
        await settleUntil(
          () =>
            container.querySelector(`[data-comment-replies="${host.commentId}"] [data-comment-reply-list]`)?.textContent?.includes(
              'Merci pour ta réponse',
            ) === true,
        );

        const replies = container.querySelector(`[data-comment-replies="${host.commentId}"] [data-comment-reply-list]`);
        expect(replies?.textContent).toContain('Merci pour ta réponse');
        const topLevel = [...container.querySelectorAll('[data-comment-list] > [data-comment-row]')].map((row) => row.textContent ?? '');
        expect(topLevel.some((text) => text.startsWith('Vous') && text.includes('Merci pour ta réponse'))).toBe(false);
        await settleUntil(() => container.querySelector('[data-comment-reply-banner]') === null);
        expect(container.querySelector('[data-comment-reply-banner]')).toBeNull();
      },
      TEST_TIMEOUT_MS,
    );
  }

  test(
    'les réponses existantes se déplient, avec leurs effets : un halo, un voile',
    async () => {
      const container = await mountAt('/post/post-text-rank2');
      await settleUntil(() => container.querySelector('[data-comment-replies="cm-r2-3"] [data-comment-replies-toggle]') !== null);
      const toggle = container.querySelector<HTMLButtonElement>('[data-comment-replies="cm-r2-3"] [data-comment-replies-toggle]');
      expect(toggle?.textContent).toBe('Voir les réponses (2)');
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');

      await act(async () => toggle?.click());
      await settleUntil(() => container.querySelector('[data-comment-row="cm-r2-3-b"]') !== null);

      expect(container.querySelector('[data-comment-row="cm-r2-3-a"] [data-effects-host]')).not.toBeNull();
      expect(container.querySelector('[data-comment-row="cm-r2-3-b"] [data-protected="hidden"]')).not.toBeNull();
      expect(container.querySelector('[data-comment-row="cm-r2-3-b"]')?.textContent).not.toContain('Je t’envoie le lien en privé.');
      expect(container.querySelector('[data-comment-row="cm-r2-3-b"] [data-comment-swipe]')).not.toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});
