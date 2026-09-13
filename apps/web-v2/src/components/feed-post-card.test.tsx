import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { FeedPostCard } from './feed-post-card';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import type { FeedPost } from '@/lib/api/feed-pages';

const NOW = new Date('2026-09-13T12:00:00.000Z');

const modelOf = (post: FeedPost, preferredLanguages: readonly string[] = ['fr']) =>
  resolveFeedCardModel(post, { preferredLanguages, now: NOW });

const basePost = (partial: Partial<FeedPost>): FeedPost => ({
  id: 'p1',
  type: 'POST',
  createdAt: '2026-09-13T11:55:00.000Z',
  ...partial,
});

describe('FeedPostCard — le POST', () => {
  test('un texte court ⇒ AUCUN bouton « voir plus », le texte entier est rendu', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ content: 'Bonjour à tous !', originalLanguage: 'fr', author: { id: 'u1', displayName: 'Léa' } }))} />,
    );
    expect(html).toContain('Bonjour à tous !');
    expect(html).not.toContain('voir plus');
  });

  test('un texte de plus de 20 mots ⇒ TRONQUÉ à l’affichage, avec « voir plus »', () => {
    const long = Array.from({ length: 24 }, (_, i) => `mot${i}`).join(' ');
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ content: long, originalLanguage: 'fr' }))} />,
    );
    expect(html).toContain('voir plus');
    expect(html).not.toContain('mot23'); // le 24ᵉ mot est hors de la troncature à 20
    expect(html).toContain('mot19...');
  });

  /** TÉMOIN DE RANG ≠ 1 (leçon 261) — `lang="en"` doit apparaître, jamais `lang="es"` ni aucun `fr`. */
  test('un texte servi à un rang ≠ 1 porte `lang` sur la langue SERVIE', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(
          basePost({ content: 'Buenos días a todos', originalLanguage: 'es', translations: { en: { text: 'Good morning everyone' } } }),
          ['fr', 'en'],
        )}
      />,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain('Good morning everyone');
    expect(html).not.toContain('Buenos días');
  });

  test('les cinq statistiques sont des `<span>` STATIQUES, jamais des `<button>` (D-6, lecture seule)', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ content: 'x', originalLanguage: 'fr', likeCount: 14, commentCount: 2 }))} />,
    );
    expect(html).toContain('data-feed-actions');
    expect(html).not.toContain('<button');
  });

  /**
   * LE NOM ACCESSIBLE EST PORTÉ PAR UN ÉLÉMENT QUI ADMET UN NOM
   * (revue-correction #5893) — un `<span>` nu est de rôle `generic`, qui
   * n'admet PAS de nom d'auteur : `aria-label` y est ignoré, et un compte
   * `aria-hidden` à côté rendait les cinq statistiques totalement muettes.
   * Le témoin regarde donc les DEUX moitiés : un `role="img"` nommé pour le
   * glyphe, et le chiffre resté LISIBLE.
   */
  test('chaque statistique est ANNONÇABLE : glyphe nommé (role="img") + compte non masqué', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ content: 'x', originalLanguage: 'fr', likeCount: 14, commentCount: 2 }))} />,
    );
    expect(html).toContain('aria-label="Aimer"');
    expect(html).toContain('aria-label="Commenter"');
    expect(html).toContain('role="img"');
    // Le compte n'est PAS masqué aux technologies d'assistance.
    expect(html).not.toContain('aria-hidden="true" class="text-check font-medium"');
    expect(html).toContain('>14<');
  });

  /** Le texte d'accessibilité SERVI atteint le `alt` ; la légende, elle, est
   * déjà rendue en texte visible et ne s'y répète pas (revue-correction #5893). */
  test('une image porte le `alt` SERVI par la passerelle, jamais sa légende visible', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(
          basePost({
            media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', alt: 'Un marché couvert', caption: 'Le marché' }],
          }),
        )}
      />,
    );
    expect(html).toContain('alt="Un marché couvert"');
    expect(html).not.toContain('alt="Le marché"');
  });

  test('une image SANS texte d’accessibilité servi est décorative (`alt=""`), jamais nommée par son URL', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }] }))} />,
    );
    expect(html).toContain('alt=""');
  });

  test('un seul média ⇒ AUCUN compteur de page, aucune flèche', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(basePost({ media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', width: 100, height: 100 }] }))}
      />,
    );
    expect(html).not.toContain('data-feed-media-counter');
    expect(html).not.toContain('Média suivant');
  });

  test('un carrousel de trois médias ⇒ compteur "1 / 3" et la flèche SUIVANTE seule (première page)', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(
          basePost({
            media: [
              { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 },
              { id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', order: 1 },
              { id: 'm3', mimeType: 'image/jpeg', fileUrl: 'c.jpg', order: 2 },
            ],
          }),
        )}
      />,
    );
    expect(html).toContain('1 / 3');
    expect(html).toContain('Média suivant');
    expect(html).not.toContain('Média précédent');
  });

});

describe('FeedPostCard — le RÉEL, affiche immobile plein cadre', () => {
  test('un média vidéo se rend en repli (`fillPlay`), jamais en `<video>` — la lecture reste hors tranche', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(basePost({ type: 'REEL', media: [{ id: 'm1', mimeType: 'video/mp4', fileUrl: 'v.mp4', width: 1080, height: 1920 }] }))}
      />,
    );
    expect(html).not.toContain('<video');
  });

  /** Un réel dont la pièce de tête est une IMAGE (la moitié du corpus de
   * staging) ne se distingue d'un post que par sa puce, tant que la lecture
   * reste hors tranche (§ 1.5 de la spécification). */
  test('porte la puce « Réel », y compris quand sa pièce de tête est une image', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(basePost({ type: 'REEL', media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }] }))}
      />,
    );
    expect(html).toContain('data-feed-reel-chip');
    expect(html).toContain('>Réel<');
  });

  test('un POST ne porte JAMAIS la puce « Réel »', () => {
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(basePost({ content: 'x', originalLanguage: 'fr' }))} />);
    expect(html).not.toContain('data-feed-reel-chip');
  });

  test('porte un `role="group"` étiqueté « Réel de <auteur> »', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ type: 'REEL', author: { id: 'u1', displayName: 'Yann Petit' } }))} />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Réel de Yann Petit"');
  });

  /**
   * DÉFAUT BLOQUANT relevé À LA CAPTURE (#5893) — un poster `data:image/svg+xml`
   * référençant son propre dégradé par `fill="url(#g)"` porte un `)` NON
   * échappé (`encodeURIComponent` n'échappe pas les parenthèses, MDN). Sans
   * guillemets autour de l'URL CSS, ce `)` interne clôt `url(...)`
   * prématurément et le navigateur REJETTE toute la valeur en silence — le
   * repli plein cadre restait BLANC, aucune erreur console.
   */
  test('le poster d’un réel vidéo/audio est guillemeté dans `url("...")` — jamais `url(...)` nu', () => {
    const posterWithParens = 'data:image/svg+xml;utf8,%3Csvg%3E%3Crect%20fill%3D%22url(%23g)%22%2F%3E%3C%2Fsvg%3E';
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(
          basePost({
            type: 'REEL',
            media: [{ id: 'm1', mimeType: 'video/mp4', fileUrl: 'v.mp4', thumbnailUrl: posterWithParens, width: 1080, height: 1920 }],
          }),
        )}
      />,
    );
    expect(html).toContain(`url(&quot;${posterWithParens}&quot;)`);
  });

  test('un réel AUDIO se rend en repli waveform, pas en image', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(basePost({ type: 'REEL', media: [{ id: 'm1', mimeType: 'audio/mpeg', fileUrl: 'a.mp3' }] }))}
      />,
    );
    expect(html).not.toContain('<img');
  });
});
