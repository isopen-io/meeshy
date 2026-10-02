import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PostComment } from '@/lib/api/publication-comments';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentRow } from './comment-row';

/**
 * UN COMMENTAIRE PEUT PORTER UN STICKER (#9080) — dans la MÊME forme que le
 * sticker d'un message : le descripteur (`sticker`, hissé par la passerelle ;
 * `metadata.sticker` sur l'aperçu embarqué d'une publication) et l'image
 * rendue en média joint. La rangée le peint par le MÊME rendu que la bulle
 * (`StickerArtwork`).
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

const STICKER_PNG = { id: '507f1f77bcf86cd799439055', mimeType: 'image/png', fileUrl: 'https://cdn.meeshy.me/s/abc.png' };

const comment = (patch: Partial<PostComment>): PostComment => ({
  id: 'c-sticker',
  content: '',
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

describe('le sticker d’un commentaire', () => {
  test('un sticker de bibliothèque se peint par son image jointe', async () => {
    const host = await mount(comment({ sticker: { stickerId: '507f1f77bcf86cd799439011' }, media: [STICKER_PNG] }));
    const art = host.querySelector('[data-comment-sticker] img');
    expect(art?.getAttribute('src')).toContain('abc.png');
    expect(art?.getAttribute('alt')).toBe('Sticker');
  });

  test('l’aperçu embarqué ne porte que metadata.sticker : il se peint quand même', async () => {
    const host = await mount(comment({ metadata: { sticker: { stickerId: '507f1f77bcf86cd799439011' } }, media: [STICKER_PNG] }));
    expect(host.querySelector('[data-comment-sticker] img')).not.toBeNull();
  });

  test('un sticker emoji sans image se peint en glyphe', async () => {
    const host = await mount(comment({ sticker: { emoji: '🔥' } }));
    expect(host.querySelector('[data-comment-sticker] [data-sticker-emoji]')?.textContent).toBe('🔥');
  });

  test('le texte qui accompagne le sticker reste lu', async () => {
    const host = await mount(comment({ content: 'pour toi', sticker: { emoji: '🔥' } }));
    expect(host.querySelector('[data-comment-sticker]')).not.toBeNull();
    expect(host.textContent).toContain('pour toi');
  });

  test('un commentaire sans sticker n’en peint aucun', async () => {
    const host = await mount(comment({ content: 'bravo', media: [STICKER_PNG] }));
    expect(host.querySelector('[data-comment-sticker]')).toBeNull();
  });
});
