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

  test('SANS hôte qui écrit (`onGesture` absent), les cinq statistiques restent des `<span>` — aucun bouton sans effet (loi 4)', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ content: 'x', originalLanguage: 'fr', likeCount: 14, commentCount: 2 }))} />,
    );
    expect(html).toContain('data-feed-actions');
    expect(html).not.toContain('<button');
  });

  /** #6278 — aimer et enregistrer ont un effet dès qu'un hôte les porte ;
   * commenter, repartager et partager n'en ont pas ENCORE, ils restent donc
   * des statistiques et ne se déguisent pas en contrôles. */
  test('AVEC un hôte, « Aimer » et « Enregistrer » deviennent des boutons à bascule ; les trois autres restent des statistiques', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(basePost({ content: 'x', originalLanguage: 'fr', likeCount: 14, isLikedByMe: true, isBookmarkedByMe: false }))}
        onGesture={() => undefined}
      />,
    );
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('data-feed-gesture="like" aria-pressed="true"');
    expect(html).toContain('data-feed-gesture="bookmark" aria-pressed="false"');
    expect(html).toContain('aria-label="Commenter"');
    expect(html).toContain('>14<');
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

  /**
   * LE REPLI SUR LE CONTENU DU POST (#6864) NE SE PEINT QU'UNE FOIS — un
   * média seul sans légende propre reçoit le contenu du post comme légende
   * (`resolveMedia`) ; le corps du post, lui, ne se peint alors PAS en plus
   * au-dessus de la carte, sous peine d'afficher deux fois la même phrase.
   */
  test('un média seul sans légende propre : le contenu du post se peint UNE fois, comme légende — jamais aussi comme corps', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(
          basePost({
            content: 'Vue depuis le sommet',
            originalLanguage: 'fr',
            media: [{ id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg' }],
          }),
        )}
      />,
    );
    expect(html.match(/Vue depuis le sommet/g)).toHaveLength(1);
  });

  /** À plusieurs médias, le repli ne s'applique jamais : le corps du post
   * reste peint au-dessus de la carte, comme sans média. */
  test('à plusieurs médias, le corps du post reste peint au-dessus de la carte', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(
          basePost({
            content: 'Deux photos du voyage',
            originalLanguage: 'fr',
            media: [
              { id: 'm1', mimeType: 'image/jpeg', fileUrl: 'a.jpg', order: 0 },
              { id: 'm2', mimeType: 'image/jpeg', fileUrl: 'b.jpg', order: 1 },
            ],
          }),
        )}
      />,
    );
    expect(html.match(/Deux photos du voyage/g)).toHaveLength(1);
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

  /** La légende porte l'attribut `lang` DE LA LANGUE SERVIE (#6280) — un
   * lecteur d'écran qui prononce une traduction française avec une voix
   * anglaise est le défaut du cycle 122 (CLAUDE.md § Prisme), rendu
   * audible sur une légende de média. */
  test('la légende traduite porte `lang` dans la langue SERVIE, pas la langue source', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={modelOf(
          basePost({
            media: [
              {
                id: 'm1',
                mimeType: 'image/jpeg',
                fileUrl: 'a.jpg',
                caption: 'The morning market',
                captionLanguage: 'en',
                captionTranslations: {
                  fr: { text: 'Le marché du matin', translationModel: 'nllb-200', createdAt: '2026-09-14T00:00:00.000Z' },
                },
              },
            ],
          }),
          ['fr'],
        )}
      />,
    );
    expect(html).toContain('lang="fr"');
    expect(html).toContain('Le marché du matin');
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

/**
 * L'AGENCEMENT CHOISI PAR L'AUTEUR (#6514) — iOS (#6502) laisse choisir, au
 * moment de publier, entre carrousel, défilement continu, hero, vague et
 * sinusoïde ; le choix voyage dans `storyEffects.layout` (document canvas v3).
 * Les cotes attendues sont celles de `MosaicLayout.swift`, en pourcentage de
 * la boîte.
 */
describe('FeedPostCard — l’agencement choisi par l’auteur (#6514)', () => {
  const photos = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `m${i + 1}`, mimeType: 'image/jpeg', fileUrl: `${i + 1}.jpg`, order: i }));

  test('trois photos en `hero` ⇒ la disposition hero : une grande tuile de 62 %, deux satellites en colonne', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ media: photos(3), storyEffects: { v: 3, scenes: [], layout: 'hero' } }))} />,
    );
    expect(html).toContain('data-feed-layout="hero"');
    expect(html.match(/data-feed-mosaic-tile=/g)).toHaveLength(3);
    expect(html).toContain('style="left:0%;top:0%;width:62%;height:100%"');
    expect(html).toContain('style="left:63.4%;top:0%;width:36.6%;height:49.3%"');
    expect(html).toContain('style="left:63.4%;top:50.7%;width:36.6%;height:49.3%"');
    expect(html).not.toContain('data-feed-media-counter');
  });

  test('`layout` ABSENT ⇒ le carrousel, le rendu d’avant', () => {
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(basePost({ media: photos(3), storyEffects: { v: 3, scenes: [] } }))} />);
    expect(html).toContain('data-feed-layout="carousel"');
    expect(html).toContain('1 / 3');
    expect(html).not.toContain('data-feed-mosaic-tile');
  });

  test('aucun `storyEffects` servi ⇒ le carrousel', () => {
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(basePost({ media: photos(2) }))} />);
    expect(html).toContain('data-feed-layout="carousel"');
  });

  test('`layout` INCONNU ⇒ le carrousel, jamais une carte vide', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ media: photos(3), storyEffects: { v: 3, layout: 'spiral' } }))} />,
    );
    expect(html).toContain('data-feed-layout="carousel"');
    expect(html).toContain('1 / 3');
  });

  test('six photos en `wave` ⇒ quatre tuiles, et « +2 » sur la dernière seule', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ media: photos(6), storyEffects: { v: 3, layout: 'wave' } }))} />,
    );
    expect(html).toContain('data-feed-layout="wave"');
    expect(html.match(/data-feed-mosaic-tile=/g)).toHaveLength(4);
    expect(html.match(/data-feed-mosaic-overflow/g)).toHaveLength(1);
    expect(html).toContain('>+2<');
  });

  test('`sine` ⇒ une tuile en haut, une en bas', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ media: photos(2), storyEffects: { v: 3, layout: 'sine' } }))} />,
    );
    expect(html).toContain('data-feed-layout="sine"');
    expect(html).toContain('style="left:0%;top:0%;width:49.3%;height:62%"');
    expect(html).toContain('style="left:50.7%;top:38%;width:49.3%;height:62%"');
  });

  /** Le défilement continu DÉFILE : un conteneur qu'on ne peut pas atteindre au
   * clavier cacherait ses tuiles 2 et 3 à qui n'a pas de doigt. */
  test('`reel` ⇒ un défilement horizontal, focalisable et nommé, dont le contenu déborde la boîte', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ media: photos(3), storyEffects: { v: 3, layout: 'reel' } }))} />,
    );
    expect(html).toContain('data-feed-layout="reel"');
    expect(html).toMatch(/data-feed-layout="reel"[^>]*tabindex="0"/);
    expect(html).toContain('aria-label="Mosaïque de 3 médias"');
    expect(html).toContain('width:185.6%');
  });

  test('la grande tuile d’un `hero` porte sa légende ; ses satellites, non', () => {
    const media = photos(3).map((m, i) => ({ ...m, caption: `Légende ${i + 1}` }));
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(basePost({ media, storyEffects: { v: 3, layout: 'hero' } }))} />);
    expect(html).toContain('Légende 1');
    expect(html).not.toContain('Légende 2');
    expect(html).not.toContain('Légende 3');
  });

  test('une seule photo, même en `hero`, n’est pas une mosaïque', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ media: photos(1), storyEffects: { v: 3, layout: 'hero' } }))} />,
    );
    expect(html).not.toContain('data-feed-mosaic-tile');
    expect(html).toContain('data-feed-media');
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

  /** « en touchant un réel on ouvre le feed de réel » (porteur, 2026-09-14) —
   * `ReelsPresenter.present(posts:startId:)` : le lecteur démarre SUR le réel
   * touché. Un lien (et non un `onClick`) : adresse, retour, nouvel onglet. */
  test('toucher le réel ouvre le lecteur des Réels SUR CE RÉEL, par un lien nommé', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ id: 'reel-42', type: 'REEL', author: { id: 'u1', displayName: 'Yann Petit' } }))} />,
    );
    expect(html).toContain('href="/reels?seed=reel-42"');
    expect(html).toContain('aria-label="Regarder le réel de Yann Petit"');
    expect(html).toMatch(/<a[^>]*draggable="false"/);
  });

  test('les gestes du réel restent au-dessus du lien : aimer ne l’ouvre pas', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard model={modelOf(basePost({ id: 'reel-42', type: 'REEL' }))} onGesture={() => undefined} />,
    );
    const link = html.indexOf('href="/reels?seed=reel-42"');
    const like = html.indexOf('data-feed-gesture="like"');
    expect(link).toBeGreaterThan(-1);
    expect(like).toBeGreaterThan(link);
    expect(html).toMatch(/pointer-events-auto[^>]*>\s*<div[^>]*data-feed-actions/);
  });

  test('un POST ne mène jamais aux Réels', () => {
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(basePost({ content: 'x', originalLanguage: 'fr' }))} />);
    expect(html).not.toContain('/reels');
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

/**
 * LE TEXTE DU POST NE DESCEND JAMAIS DANS LA SCÈNE (revue-correction #6898,
 * `FeedPostCard.swift:378-382`, `SceneCaption.resolve(carrierFallback: false)`).
 *
 * `resolveMedia` prête le contenu du post à un média SEUL sans légende
 * (#6864, `captionOrigin: 'post'`) — c'est juste pour `FeedMediaCarousel`, qui
 * le peint en bandeau ET dont la carte s'abstient alors de le répéter. Sur une
 * carte à SCÈNE, aucun `FeedMediaCarousel` n'est rendu : la première forme
 * masquait donc le texte AU-DESSUS (même chaîne que la légende prêtée) et le
 * peignait EN BANDEAU dans la scène, étiqueté `media` — le cas nominal d'un
 * post vidéo à une scène.
 */
describe('FeedPostCard — le texte du post reste AU-DESSUS de la scène', () => {
  const scenePostWithSoleMedia = basePost({
    content: 'Le texte du post',
    originalLanguage: 'fr',
    media: [{ id: 'm1', mimeType: 'video/webm', fileUrl: 'a.webm', order: 0 }],
    storyEffects: {
      v: 3,
      scenes: [
        {
          id: 's1',
          objects: [
            { id: 'bg', kind: 'media', anchor: { t: 'free', x: 0.5, y: 0.5 }, plane: 'bg', z: 0, transform: {}, payload: { postMediaId: 'm1', mediaType: 'video/webm' } },
          ],
        },
      ],
    },
  });

  test('un post à scène et à média SEUL sans légende rend son texte au-dessus', () => {
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(scenePostWithSoleMedia)} />);
    expect(html).toMatch(/<p class="whitespace-pre-wrap text-bubble"[^>]*>Le texte du post<\/p>/);
  });

  test('… et jamais en bandeau de légende dans la scène', () => {
    const html = renderToStaticMarkup(<FeedPostCard model={modelOf(scenePostWithSoleMedia)} />);
    expect(html).not.toContain('data-feed-scene-caption');
  });
});
