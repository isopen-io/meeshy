import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PostComment } from '@/lib/api/publication-comments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentRow, type CommentGestureHandlers } from './comment-row';

/**
 * « RETIRER » LE COMMENTAIRE D'UN AUTRE (#11150) — l'entrée n'existe que si
 * l'hôte remet `onRemove` (la modération de plateforme) ; elle demande le
 * motif par écrit, et remet le commentaire, le motif nettoyé et sa racine.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const reply: PostComment = {
  id: 'c-r',
  parentId: 'c-root',
  content: 'Insulte',
  createdAt: '2026-09-19T11:58:00.000Z',
  author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
};

const gestures = (journal: string[], patch: Partial<CommentGestureHandlers> = {}): CommentGestureHandlers => ({
  viewerId: 'u-viewer',
  onLike: () => undefined,
  onEdit: () => undefined,
  onDelete: (id) => journal.push(`delete:${id}`),
  onReport: (id, reason) => journal.push(`report:${id}:${reason}`),
  failureOf: () => undefined,
  onRetryGesture: () => undefined,
  busyOf: () => false,
  ...patch,
});

const mount = async (handlers: CommentGestureHandlers): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <ul>
        <CommentRow comment={reply} language="fr" preferredLanguages={['fr']} locale="fr-FR" now={new Date('2026-09-19T12:00:00.000Z')} gestures={handlers} />
      </ul>,
    ),
  );
  return container;
};

const openMenu = async (host: HTMLElement) => {
  await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="more"]')?.click());
};
const items = () => [...document.querySelectorAll('[data-comment-menu] [role="menuitem"]')].map((element) => element.getAttribute('data-comment-gesture'));

describe('CommentRow — « Retirer » (#11150)', () => {
  test('sans `onRemove`, l’entrée n’existe pas', async () => {
    await openMenu(await mount(gestures([])));
    expect(items()).not.toContain('remove');
  });

  test('avec `onRemove` : le motif est demandé, puis remis nettoyé avec la racine de la réponse', async () => {
    const journal: string[] = [];
    const host = await mount(gestures(journal, { onRemove: (id, reason, parentId) => journal.push(`remove:${id}:${reason}:${parentId ?? ''}`) }));
    await openMenu(host);
    expect(items()).toEqual(['remove', 'report']);
    await act(async () => document.querySelector<HTMLButtonElement>('[data-comment-menu] [data-comment-gesture="remove"]')?.click());
    const field = document.querySelector<HTMLTextAreaElement>('[data-content-removal-reason]');
    expect(field).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(field, ' Insulte répétée ');
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => document.querySelector<HTMLButtonElement>('[data-content-removal="confirm"]')?.click());
    expect(journal).toEqual(['remove:c-r:Insulte répétée:c-root']);
  });
});
