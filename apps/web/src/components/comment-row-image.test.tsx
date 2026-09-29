import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PostComment } from '@/lib/api/publication-comments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentRow, type CommentGestureHandlers } from './comment-row';

/**
 * « IMAGER » UN COMMENTAIRE (#8693) — la rangée offre le geste quand l'hôte le
 * câble, et remet le texte qu'elle AFFICHE : la traduction servie par le Prisme
 * (rang 2 ici, leçon 261), pas l'original.
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

const comment: PostComment = {
  id: 'c-image',
  content: 'Buenos días',
  createdAt: '2026-09-19T11:58:00.000Z',
  author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
  originalLanguage: 'es',
  translations: { en: { text: 'Good morning', translationModel: 'nllb', createdAt: '2026-09-19T11:59:00.000Z' } },
};

const gestures = (onImage?: CommentGestureHandlers['onImage']): CommentGestureHandlers => ({
  viewerId: 'u-viewer',
  onLike: () => undefined,
  onEdit: () => undefined,
  onDelete: () => undefined,
  failureOf: () => undefined,
  onRetryGesture: () => undefined,
  busyOf: () => false,
  ...(onImage === undefined ? {} : { onImage }),
});

const mount = async (handlers: CommentGestureHandlers): Promise<HTMLDivElement> => {
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

describe('« Imager » un commentaire', () => {
  test('le bouton remet le commentaire et le texte servi par le Prisme', async () => {
    const received: string[] = [];
    const host = await mount(gestures((target, served) => received.push(`${target.id}:${served}`)));
    const button = host.querySelector<HTMLButtonElement>('[data-comment-gesture="image"]');
    expect(button?.textContent).toBe('Imager');
    await act(async () => button?.click());
    expect(received).toEqual(['c-image:Good morning']);
  });

  test('sans rappel, aucun bouton — jamais un contrôle inerte', async () => {
    const host = await mount(gestures());
    expect(host.querySelector('[data-comment-gesture="image"]')).toBeNull();
  });
});
