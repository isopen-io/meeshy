import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PostComment } from '@/lib/api/publication-comments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentRow } from './comment-row';

/**
 * #9167 (miroir `CommentMediaView` iOS) — UN COMMENTAIRE MONTRE SES PHOTOS ET
 * SES VIDÉOS sous son texte. L'image d'un sticker n'est pas un média du
 * commentaire : elle reste peinte par le sticker, jamais deux fois.
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

const PHOTO = { id: 'pm-photo', mimeType: 'image/jpeg', fileUrl: 'https://cdn.meeshy.me/c/plage.jpg' };
const VIDEO = { id: 'pm-video', mimeType: 'video/mp4', fileUrl: 'https://cdn.meeshy.me/c/vague.mp4' };

const comment = (patch: Partial<PostComment>): PostComment => ({
  id: 'c-media',
  content: 'Regarde',
  createdAt: '2026-10-02T11:58:00.000Z',
  author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
  ...patch,
});

const mount = async (value: PostComment): Promise<HTMLDivElement> => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <ul>
        <CommentRow comment={value} language="fr" preferredLanguages={['fr']} locale="fr-FR" now={new Date('2026-10-02T12:00:00.000Z')} />
      </ul>,
    ),
  );
  return container;
};

describe('CommentRow — les médias joints (#9167)', () => {
  test('une photo et une vidéo se montrent sous le texte', async () => {
    const el = await mount(comment({ media: [PHOTO, VIDEO] }));
    const strip = el.querySelector('[data-comment-media]');
    expect(strip).not.toBeNull();
    expect(strip?.querySelector('img')?.getAttribute('src')).toBe(PHOTO.fileUrl);
    expect(strip?.querySelector('video')?.getAttribute('src')).toBe(VIDEO.fileUrl);
    expect(el.textContent).toContain('Regarde');
  });

  test('sans média, aucune bande', async () => {
    const el = await mount(comment({}));
    expect(el.querySelector('[data-comment-media]')).toBeNull();
  });

  test('l’image d’un sticker n’est pas reprise comme média', async () => {
    const el = await mount(comment({ content: '', sticker: { emoji: '🔥' }, media: [{ id: 'pm-sticker', mimeType: 'image/png', fileUrl: 'https://cdn.meeshy.me/s/x.png' }] }));
    expect(el.querySelector('[data-comment-media]')).toBeNull();
  });
});
