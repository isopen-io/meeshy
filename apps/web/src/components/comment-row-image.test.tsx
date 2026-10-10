import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PostComment } from '@/lib/api/publication-comments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentRow, type CommentGestureHandlers } from './comment-row';

/**
 * LE MENU « … » D'UNE RANGÉE DE COMMENTAIRE (#8693, #8734) — la rangée que
 * partagent le détail d'une publication, la feuille des stories et celle des
 * Réels. « Imager » et « Copier » remettent le texte qu'elle AFFICHE : la
 * traduction servie par le Prisme (rang 2 ici, leçon 261), pas l'original.
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

const baseComment: PostComment = {
  id: 'c-image',
  content: 'Buenos días',
  createdAt: '2026-09-19T11:58:00.000Z',
  author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
  originalLanguage: 'es',
  translations: { en: { text: 'Good morning', translationModel: 'nllb', createdAt: '2026-09-19T11:59:00.000Z' } },
};

type Journal = string[];

const gestures = (journal: Journal, patch: Partial<CommentGestureHandlers> = {}): CommentGestureHandlers => ({
  viewerId: 'u-viewer',
  onLike: () => undefined,
  onEdit: () => undefined,
  onDelete: (id) => journal.push(`delete:${id}`),
  onImage: (target, served, options) => journal.push(`image:${target.id}:${served}:${options.withReplies ? 'replies' : 'alone'}`),
  onCopy: (text) => journal.push(`copy:${text}`),
  onReport: (id, reason) => journal.push(`report:${id}:${reason}`),
  failureOf: () => undefined,
  onRetryGesture: () => undefined,
  busyOf: () => false,
  ...patch,
});

const mount = async (handlers: CommentGestureHandlers, comment: PostComment = baseComment): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <ul>
        <CommentRow comment={comment} language="fr" preferredLanguages={['fr', 'en']} locale="fr-FR" now={new Date('2026-09-19T12:00:00.000Z')} gestures={handlers} />
      </ul>,
    ),
  );
  return container;
};

const openMenu = async (host: HTMLElement) => {
  await act(async () => host.querySelector<HTMLButtonElement>('[data-comment-gesture="more"]')?.click());
};
const item = (gesture: string) => document.querySelector<HTMLButtonElement>(`[data-comment-menu] [data-comment-gesture="${gesture}"]`);
const items = () => [...document.querySelectorAll('[data-comment-menu] [role="menuitem"]')].map((element) => element.getAttribute('data-comment-gesture'));
const pick = async (host: HTMLElement, gesture: string) => {
  await openMenu(host);
  await act(async () => item(gesture)?.click());
};

describe('le « … » d’un commentaire', () => {
  test('le déclencheur s’annonce comme un menu, cible de 44 px', async () => {
    const host = await mount(gestures([]));
    const trigger = host.querySelector<HTMLButtonElement>('[data-comment-gesture="more"]');
    expect(trigger?.getAttribute('aria-label')).toBe('Plus d’options');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger?.className).toContain('size-11');
    await openMenu(host);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-comment-menu]')?.getAttribute('role')).toBe('menu');
  });

  test('le commentaire d’un autre : copier, imager, signaler', async () => {
    const host = await mount(gestures([]));
    await openMenu(host);
    expect(items()).toEqual(['copy', 'image', 'report']);
    expect(item('image')?.textContent).toBe('Imager');
    expect(item('copy')?.textContent).toBe('Copier le texte');
  });

  test('« Imager » remet le commentaire et le texte servi par le Prisme', async () => {
    const journal: Journal = [];
    const host = await mount(gestures(journal));
    await pick(host, 'image');
    expect(journal).toEqual(['image:c-image:Good morning:alone']);
    expect(document.querySelector('[data-comment-menu]')).toBeNull();
  });

  test('« Copier » remet le texte AFFICHÉ, jamais l’original caché derrière', async () => {
    const journal: Journal = [];
    const host = await mount(gestures(journal));
    await pick(host, 'copy');
    expect(journal).toEqual(['copy:Good morning']);
  });

  test('une racine qui a des réponses s’image AVEC elles', async () => {
    const journal: Journal = [];
    const host = await mount(gestures(journal), { ...baseComment, replyCount: 2 });
    await openMenu(host);
    expect(item('image-replies')?.textContent).toBe('Imager avec les réponses');
    await act(async () => item('image-replies')?.click());
    expect(journal).toEqual(['image:c-image:Good morning:replies']);
  });

  test('« Signaler » demande un MOTIF, et c’est le motif qui part', async () => {
    const journal: Journal = [];
    const host = await mount(gestures(journal));
    await pick(host, 'report');
    expect(journal).toEqual([]);
    const reason = document.querySelector<HTMLButtonElement>('[data-report-reason="harassment"]');
    expect(reason).not.toBeNull();
    await act(async () => reason?.click());
    expect(journal).toEqual(['report:c-image:harassment']);
  });

  test('un commentaire FLOUTÉ ne se copie ni ne s’image en clair', async () => {
    const host = await mount(gestures([]), { ...baseComment, effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED, replyCount: 1 });
    await openMenu(host);
    expect(items()).toEqual(['report']);
  });

  test('Échap referme le menu et rend le focus au « … »', async () => {
    const host = await mount(gestures([]));
    await openMenu(host);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(document.querySelector('[data-comment-menu]')).toBeNull();
    expect(document.activeElement?.getAttribute('data-comment-gesture')).toBe('more');
  });

  test('sans rappel, aucune entrée — jamais un contrôle inerte', async () => {
    const { onImage: _image, onCopy: _copy, onReport: _report, ...bare } = gestures([]);
    const host = await mount(bare);
    expect(host.querySelector('[data-comment-gesture="more"]')).toBeNull();
  });
});
