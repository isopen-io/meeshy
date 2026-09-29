import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import { loadCommentRepliesAction } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentThread } from './comment-thread';

/**
 * LE MENU « … » AU NIVEAU DU FIL (#8734) — la rangée rend le geste, le FIL
 * l'exécute et en ANNONCE l'issue : la rangée n'a pas de région vivante, et
 * « Texte copié » ou « Signalement envoyé » ne se voient nulle part sans elle.
 * Le même fil sert le détail d'une publication, la feuille des stories et
 * celle des Réels (`PublicationCommentsSheet` monte `CommentThread`).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const navigatorWithClipboard = navigator as Navigator & { clipboard?: { writeText: (text: string) => Promise<void> } };

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

async function mountThread(postId: string): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={appQueryClient}>
        <CommentThread postId={postId} />
      </QueryClientProvider>,
    );
  });
  await settle();
  return container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

const pick = async (host: HTMLElement, rowId: string, gesture: string) => {
  await act(async () => host.querySelector<HTMLButtonElement>(`[data-comment-row="${rowId}"] [data-comment-gesture="more"]`)?.click());
  await act(async () => document.querySelector<HTMLButtonElement>(`[data-comment-menu] [data-comment-gesture="${gesture}"]`)?.click());
  await settle();
};

const notice = (host: HTMLElement) => host.querySelector('[data-comment-thread-notice]')?.textContent ?? '';

describe('le fil exécute le menu « … » et en annonce l’issue', () => {
  test('« Copier » écrit le texte affiché dans le presse-papiers, et le dit', async () => {
    const written: string[] = [];
    const previous = navigatorWithClipboard.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void written.push(text) },
    });
    try {
      const host = await mountThread('st-amie-2');
      await pick(host, 'cm-st-2', 'copy');
      expect(written).toEqual(['C’est quel lac ?']);
      expect(notice(host)).toBe('Texte copié');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: previous });
    }
  });

  test('« Signaler » part avec son motif, et l’envoi s’annonce', async () => {
    const host = await mountThread('st-amie-2');
    await pick(host, 'cm-st-1', 'report');
    await act(async () => document.querySelector<HTMLButtonElement>('[data-report-reason="spam"]')?.click());
    await settle();
    expect(notice(host)).toBe('Signalement envoyé');
  });

  test('le commentaire d’un autre n’offre ni « Modifier » ni « Supprimer », le sien pas « Signaler »', async () => {
    const host = await mountThread('post-text-rank2');
    const entriesOf = async (rowId: string) => {
      await act(async () => host.querySelector<HTMLButtonElement>(`[data-comment-row="${rowId}"] [data-comment-gesture="more"]`)?.click());
      const found = [...document.querySelectorAll('[data-comment-menu] [role="menuitem"]')].map((element) => element.getAttribute('data-comment-gesture'));
      await act(async () => host.querySelector<HTMLButtonElement>(`[data-comment-row="${rowId}"] [data-comment-gesture="more"]`)?.click());
      return found;
    };
    expect(await entriesOf('cm-r2-0')).toEqual(['copy', 'image', 'edit', 'delete']);
    expect(await entriesOf('cm-r2-3')).toEqual(['copy', 'image', 'image-replies', 'report']);
  });
});

describe('les réponses à joindre à la carte d’une racine', () => {
  test('lues même quand le fil est replié — la caisse les garde pour le dépliage', async () => {
    const replies = await loadCommentRepliesAction('post-text-rank2', 'cm-r2-3');
    expect(replies.map((reply) => reply.id)).toEqual(['cm-r2-3-a', 'cm-r2-3-b']);
  });
});
