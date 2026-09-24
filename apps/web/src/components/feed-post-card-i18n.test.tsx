import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FeedPost } from '@/lib/api/feed-pages';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';

import { FeedPostCard } from './feed-post-card';

/**
 * LA CARTE DU FIL DANS LA LANGUE D'INTERFACE (#6488) — jusqu'ici écrite en
 * dur en français (« Aimer », « voir plus », « Média suivant », « Réel de
 * <auteur> »…) alors que la coque servait déjà `reels.open` dans la langue
 * résolue sur la MÊME carte. Miroir `typing-roster-cell.test.tsx`.
 */

const NOW = new Date('2026-09-13T12:00:00.000Z');

const modelOf = (post: FeedPost, preferredLanguages: readonly string[] = ['en']) =>
  resolveFeedCardModel(post, { preferredLanguages, now: NOW });

const basePost = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-09-13T11:55:00.000Z',
  ...partial,
});

describe('FeedPostCard — les libellés suivent la langue d’interface', () => {
  beforeAll(async () => {
    ensureHappyDomRegistered();
    await loadInterfaceCatalog('en');
  });

  afterAll(async () => {
    document.documentElement.lang = 'fr';
    await releaseHappyDomIfRegistered();
  });

  test('en : les cinq statistiques du POST s’annoncent en anglais, sans AUCUN libellé français', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(basePost({ content: 'x', originalLanguage: 'en', likeCount: 14, isLikedByMe: true }))}
        onGesture={() => undefined}
        onShare={() => undefined}
      />,
    );
    expect(html).toContain('aria-label="Like"');
    expect(html).toContain('aria-label="Comment"');
    expect(html).toContain('aria-label="Repost"');
    expect(html).toContain('aria-label="Save"');
    expect(html).toContain('aria-label="Share"');
    for (const francais of ['Aimer', 'Commenter', 'Repartager', 'Enregistrer', 'Partager']) {
      expect(html).not.toContain(`aria-label="${francais}"`);
    }
  });

  test('en : « see more » remplace « voir plus » sur un texte tronqué', () => {
    document.documentElement.lang = 'en';
    const long = Array.from({ length: 24 }, (_, i) => `word${i}`).join(' ');
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(basePost({ content: long, originalLanguage: 'en' }))} />);
    expect(html).toContain('see more');
    expect(html).not.toContain('voir plus');
  });

  test('en : le carrousel annonce « Previous media » / « Next media », jamais « Média précédent »/« Média suivant »', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(
          basePost({
            media: [
              { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 },
              { id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', order: 1 },
            ],
          }),
        )}
      />,
    );
    expect(html).toContain('aria-label="Next media"');
    expect(html).not.toContain('Média suivant');
    expect(html).not.toContain('Média précédent');
  });

  test('en : un média vidéo se nomme « Video », un audio « Audio »', () => {
    document.documentElement.lang = 'en';
    const video = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ type: 'REEL', media: [{ id: 'm1', mimeType: 'video/mp4', fileUrl: 'v.mp4' }] }))} />,
    );
    expect(video).toContain('aria-label="Video"');
    expect(video).not.toContain('aria-label="Vidéo"');
  });

  test('en : la puce et le groupe du RÉEL se disent « Reel » / « Reel by <author> »', () => {
    document.documentElement.lang = 'en';
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ type: 'REEL', author: { id: 'u1', displayName: 'Yann Petit' } }))} />,
    );
    expect(html).toContain('>Reel<');
    expect(html).toContain('aria-label="Reel by Yann Petit"');
    expect(html).not.toContain('>Réel<');
    expect(html).not.toContain('Réel de Yann Petit');
  });

  test('fr : les mêmes surfaces restent en français une fois la langue reposée', () => {
    document.documentElement.lang = 'fr';
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ content: 'x', originalLanguage: 'fr', likeCount: 3 }), ['fr'])} />,
    );
    expect(html).toContain('aria-label="Aimer"');
    expect(html).not.toContain('aria-label="Like"');
  });
});
