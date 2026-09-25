import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import type { FeedPost } from '@/lib/api/feed-pages';
import { POST_REPOST, POST_SCENE_TEXT } from '@/lib/api/fixtures-feed';
import { resolveFeedCardModel } from '@/lib/feed/card-model';

import { FeedPostCard } from './feed-post-card';

/**
 * LA PUBLICATION CITÉE (#6278 c) — un repost SIMPLE rend l'ORIGINAL en carte
 * imbriquée (`FeedRepostEmbed`), miroir `FeedPostCard.swift:822-910`. Ces
 * témoins mesurent l'EFFET (loi 4) : le rendu du corps cité au Prisme, `lang=`
 * sur un rang ≠ 1, et le clic qui mène à l'original — jamais seulement la
 * présence du bloc.
 */
describe('FeedPostCard — la publication citée d’un repost simple', () => {
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    ensureHappyDomRegistered();
    globals.IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterAll(async () => {
    await act(async () => {});
    delete globals.IS_REACT_ACT_ENVIRONMENT;
    await releaseHappyDomIfRegistered();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const NOW = new Date('2026-09-25T12:00:00.000Z');

  const mount = (post: FeedPost, preferredLanguages: readonly string[] = ['fr', 'es']) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<FeedPostCard model={resolveFeedCardModel(post, { preferredLanguages, now: NOW })} />);
    });
  };

  const post = (partial: Partial<FeedPost>): FeedPost => ({
    id: 'p1',
    type: 'POST',
    createdAt: '2026-09-25T11:55:00.000Z',
    ...partial,
  });

  test('le corps cité, servi à un rang ≠ 1, porte `lang=` sur la langue SERVIE — jamais l’original', () => {
    mount(
      post({
        repostOf: {
          id: 'orig-1',
          type: 'POST',
          content: 'Good morning',
          originalLanguage: 'en',
          translations: { es: { text: 'Buenos días' } },
          author: { id: 'u9', displayName: 'Yann Petit' },
          likeCount: 12,
        },
      }),
    );

    const embed = container.querySelector('[data-feed-repost-embed]');
    expect(embed).not.toBeNull();
    expect(embed?.textContent).toContain('Buenos días');
    expect(embed?.textContent).not.toContain('Good morning');
    const texte = embed?.querySelector('[lang]');
    expect(texte?.getAttribute('lang')).toBe('es');
    expect(embed?.textContent).toContain('Yann Petit');
    expect(embed?.textContent).toContain('12');
  });

  test('la carte citée MÈNE à l’original — un `<a>` distinct de la porte de la republication', () => {
    mount(post({ content: 'Regardez', originalLanguage: 'fr', repostOf: { id: 'orig-2', type: 'POST', author: { id: 'u9' } } }));

    const open = container.querySelector('a[data-feed-repost-embed-open]');
    expect(open).not.toBeNull();
    expect(open?.getAttribute('href')).toContain('orig-2');
  });

  test('sans `id` sur l’original, la carte citée reste NON cliquable — jamais un lien mort', () => {
    mount(post({ repostOf: { type: 'POST', author: { id: 'u9', displayName: 'Compte supprimé' } } }));

    expect(container.querySelector('a[data-feed-repost-embed-open]')).toBeNull();
    expect(container.querySelector('[data-feed-repost-embed]')?.textContent).toContain('Compte supprimé');
  });

  test('la puce nomme le médium cité — STORY et REEL, jamais pour un POST', () => {
    mount(post({ repostOf: { id: 'o1', type: 'STORY', author: { id: 'u1' } } }));
    expect(container.querySelector('[data-feed-repost-embed-chip]')?.textContent).toBe('Story');
  });

  test('sans republication, aucune carte citée dans le DOM', () => {
    mount(post({ content: 'Un post ordinaire', originalLanguage: 'fr' }));
    expect(container.querySelector('[data-feed-repost-embed]')).toBeNull();
  });

  /**
   * `POST_REPOST` — LA FIXTURE À LA FORME RÉELLE de `repostOfInclude` (G3,
   * T3) : original écrit en espagnol, traduit en ANGLAIS seulement (rang 2
   * possible sous `['fr','en']`, jamais le rang 1 — leçon 261/276).
   */
  test('la fixture `POST_REPOST` rend l’original : Yann Petit, corps servi au rang 2, vignette, porte, pastille', () => {
    mount(POST_REPOST, ['fr', 'en']);

    const embed = container.querySelector('[data-feed-repost-embed]');
    expect(embed).not.toBeNull();
    expect(embed?.textContent).toContain('Yann Petit');
    expect(embed?.textContent).toContain('Our sales grew 12% this quarter.');
    expect(embed?.textContent).not.toContain('Nuestras ventas');
    const texte = embed?.querySelector('[lang]');
    expect(texte?.getAttribute('lang')).toBe('en');
    const thumbnail = embed?.querySelector('img[data-feed-repost-embed-thumbnail]');
    expect(thumbnail?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    const open = container.querySelector('a[data-feed-repost-embed-open]');
    expect(open?.getAttribute('href')).toContain('post-repost-original');
    expect(embed?.querySelector('[data-prism-indicator]')).not.toBeNull();
    expect(embed?.querySelector('[data-feed-repost-embed-more]')).toBeNull();
  });

  /**
   * D-99 — une surface de contenu SANS pastille de Prisme est un défaut : le
   * corps cité, résolu par le MÊME Prisme que le corps extérieur, l'annonce
   * exactement comme lui — un `<span>` (jamais un bouton, l'exploration de
   * l'original restant hors tranche).
   */
  test('D-99 — le corps cité TRADUIT porte la pastille du Prisme, en `<span>` jamais un bouton', () => {
    mount(post({ repostOf: { id: 'o1', type: 'POST', content: 'Bonjour', originalLanguage: 'en', translations: { fr: { text: 'Bonjour' } }, author: { id: 'u1' } } }));
    const pastille = container.querySelector('[data-feed-repost-embed] [data-prism-indicator]');
    expect(pastille).not.toBeNull();
    expect(pastille?.tagName).toBe('SPAN');
  });

  test('D-99 — un corps cité dans sa langue d’origine ne porte AUCUNE pastille', () => {
    mount(post({ repostOf: { id: 'o2', type: 'POST', content: 'Bonjour', originalLanguage: 'fr', author: { id: 'u1' } } }));
    expect(container.querySelector('[data-feed-repost-embed] [data-prism-indicator]')).toBeNull();
  });

  /** G8 — la porte de la carte CITÉE se nomme distinctement de la porte de la
   * carte EXTÉRIEURE : un lecteur d'écran ne peut pas les confondre. */
  test('la porte de la carte citée se nomme « Publication originale de X », distincte de la porte extérieure', () => {
    mount(post({ author: { id: 'u-outer', displayName: 'Léa Dupont' }, content: 'Regardez', originalLanguage: 'fr', repostOf: { id: 'orig-9', type: 'POST', author: { id: 'u9', displayName: 'Yann Petit' } } }));

    const outerOpen = container.querySelector('a[data-feed-post-open="heure"], a[data-feed-post-open="corps"]');
    const embedOpen = container.querySelector('a[data-feed-repost-embed-open]');
    expect(embedOpen?.getAttribute('aria-label')).toBe('Publication originale de Yann Petit');
    expect(outerOpen?.getAttribute('aria-label')).not.toBe(embedOpen?.getAttribute('aria-label'));
  });

  /** G10 — la vignette vient de `thumbnailUrl`, sinon d'une IMAGE, jamais
   * d'une vidéo ; « +N » compte ce qui ne tient pas dans la vignette. */
  test('« +N » apparaît sur la vignette dès que l’original porte plusieurs médias', () => {
    mount(
      post({
        repostOf: {
          id: 'orig-multi',
          type: 'POST',
          author: { id: 'u1' },
          media: [
            { id: 'm1', fileUrl: 'a.jpg', thumbnailUrl: 'a-thumb.jpg', mimeType: 'image/jpeg' },
            { id: 'm2', fileUrl: 'b.jpg', mimeType: 'image/jpeg' },
            { id: 'm3', fileUrl: 'c.jpg', mimeType: 'image/jpeg' },
          ],
        },
      }),
    );
    expect(container.querySelector('[data-feed-repost-embed-more]')?.textContent).toBe('+2');
  });

  /**
   * LA PRÉSÉANCE DU CORPS (revue-correction #6278 c) — iOS ne rend JAMAIS la
   * carte citée À CÔTÉ d'un visuel qui la répète (`FeedPostCard.swift:560-678`,
   * échelle `if … else if …`). La passerelle RECOPIE le contenu d'une source
   * éphémère dans le repost (`PostService.repostPost`, `isEphemeralSourceRepost`) :
   * sans cette préséance, une story repartagée se peignait DEUX fois — la scène
   * recopiée, puis la vignette de l'original juste au-dessus.
   */
  test('la carte porte sa PROPRE scène ⇒ la scène seule, aucune carte citée (iOS :560, « priorité sur les branches repost »)', () => {
    mount({ ...POST_SCENE_TEXT, repostOf: { id: 'story-1', type: 'STORY', author: { id: 'u9', displayName: 'Yann Petit' } } }, ['fr', 'en']);

    expect(container.querySelector('[data-feed-scene-box]')).not.toBeNull();
    expect(container.querySelector('[data-feed-repost-embed]')).toBeNull();
  });

  test('une STORY citée sans scène ⇒ la carte citée SEULE, jamais le média recopié à côté (iOS :636-647)', () => {
    const snapshot = { id: 'm-copy', fileUrl: 'story.jpg', thumbnailUrl: 'story-thumb.jpg', mimeType: 'image/jpeg', width: 1080, height: 1920 };
    mount(post({ media: [snapshot], repostOf: { id: 'story-2', type: 'STORY', author: { id: 'u9' }, media: [{ ...snapshot, id: 'm-orig' }] } }));

    expect(container.querySelector('[data-feed-repost-embed]')).not.toBeNull();
    expect(container.querySelector('[data-feed-media]')).toBeNull();
  });

  test('un POST cité ⇒ le visuel de la carte PUIS la carte citée, dans cet ordre (iOS :668-678)', () => {
    mount(
      post({
        content: 'Regardez',
        originalLanguage: 'fr',
        media: [{ id: 'm-own', fileUrl: 'own.jpg', mimeType: 'image/jpeg', width: 800, height: 800 }],
        repostOf: { id: 'orig-own', type: 'POST', author: { id: 'u9' } },
      }),
    );

    const media = container.querySelector('[data-feed-media]');
    const embed = container.querySelector('[data-feed-repost-embed]');
    expect(media).not.toBeNull();
    expect(embed).not.toBeNull();
    expect(media!.compareDocumentPosition(embed!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /** Le compte de « j'aime » de l'original est un CŒUR suivi du chiffre
   * (`FeedPostCard.swift:878-889`, `heart.fill`) — jamais le VERBE « Aimer »
   * peint en toutes lettres, qui se lit comme un bouton que la carte n'offre
   * pas. Le nom accessible reste celui de la rangée d'actions (« Aimer 24 »). */
  test('le compte de « j’aime » cité est un cœur et un chiffre — jamais le verbe peint', () => {
    mount(POST_REPOST, ['fr', 'en']);

    const likes = container.querySelector('[data-feed-repost-embed-likes]');
    expect(likes).not.toBeNull();
    expect(likes?.querySelector('svg')).not.toBeNull();
    expect(likes?.textContent?.trim()).toBe('24');
    expect(likes?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Aimer');
  });

  test('sans vignette dédiée, une vidéo SEULE ne rend aucune image', () => {
    mount(post({ repostOf: { id: 'orig-video', type: 'POST', author: { id: 'u1' }, media: [{ id: 'm1', fileUrl: 'v.mp4', mimeType: 'video/mp4' }] } }));
    expect(container.querySelector('img[data-feed-repost-embed-thumbnail]')).toBeNull();
  });
});
