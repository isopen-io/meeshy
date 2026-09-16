import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { StoryMediaLayer } from './story-parts';

/**
 * `StoryMediaLayer` — UNE STORY VIDÉO SE JOUE (#6801, découpe de #6276).
 *
 * Mesuré avant ce lot : le lecteur ne regardait JAMAIS le `mimeType`. Tout
 * média servi était monté dans un `<img>` ; une story vidéo échouait donc à
 * son `onError`, posait `mediaFailed`, et le lecteur affichait « Média
 * indisponible » — alors que la passerelle sert le fichier correctement.
 * Une story vidéo publiée depuis iOS ou Android était illisible sur le web,
 * et l'échec était SILENCIEUX : aucune erreur console, juste un écran qui
 * affirme une absence.
 *
 * La donnée nécessaire était déjà servie et déclarée :
 * `StoryTrayMedia.mimeType` (`lib/api/stories.ts:41-47`).
 *
 * L'élection se fait par `feedMediaKindOf` (`lib/feed/layout.ts:43`), la loi
 * DÉJÀ partagée par le fil — jamais un second test de préfixe MIME : c'est
 * ainsi qu'on fabrique deux lois qui divergent.
 */
const BACKGROUND = { background: '#112233' };

const props = {
  storyId: 's-1',
  mediaSrc: 'https://gate.meeshy.me/api/v1/attachments/file/media',
  showsMedia: true,
  hasMedia: true,
  background: BACKGROUND,
  caption: null,
  onReady: () => undefined,
  onFailed: () => undefined,
};

describe('StoryMediaLayer — le type du média élit l’élément', () => {
  test('une story VIDÉO monte un `<video>` qui porte sa source, jamais un `<img>`', () => {
    const html = renderToStaticMarkup(
      <StoryMediaLayer {...props} mimeType="video/mp4" mediaSrc="https://gate.meeshy.me/story.mp4" />,
    );

    expect(html).toContain('<video');
    expect(html).toContain('https://gate.meeshy.me/story.mp4');
    expect(html).not.toContain('<img');
  });

  /**
   * MUETTE ET EN BOUCLE, comme iOS — une story s'ouvre sans demander la
   * permission de faire du bruit, et `playsInline` évite que Safari iOS la
   * passe en plein écran natif par-dessus le lecteur.
   */
  test('la vidéo d’une story est muette et lue en ligne', () => {
    const html = renderToStaticMarkup(<StoryMediaLayer {...props} mimeType="video/quicktime" />);

    expect(html).toContain('muted');
    expect(html).toContain('playsInline');
  });

  test('une story IMAGE monte toujours son `<img>` — l’élection ne touche pas l’existant', () => {
    const html = renderToStaticMarkup(<StoryMediaLayer {...props} mimeType="image/jpeg" />);

    expect(html).toContain('<img');
    expect(html).not.toContain('<video');
  });

  /**
   * UN `mimeType` ABSENT RESTE UNE IMAGE — la passerelle sert l'absence en
   * `null`, et le corpus d'avant ce lot n'en porte pas. Retomber sur le repli
   * « indisponible » rendrait illisibles les stories qui marchaient.
   */
  test('un `mimeType` absent se rend en image, jamais en repli', () => {
    const html = renderToStaticMarkup(<StoryMediaLayer {...props} />);

    expect(html).toContain('<img');
  });

  test('un média inexploitable dessine « Média indisponible », jamais un élément vide', () => {
    const html = renderToStaticMarkup(<StoryMediaLayer {...props} showsMedia={false} mimeType="video/mp4" />);

    expect(html).toContain('Média indisponible');
    expect(html).not.toContain('<video');
  });

  test('une story de TEXTE rend sa légende servie, avec sa langue', () => {
    const html = renderToStaticMarkup(
      <StoryMediaLayer {...props} showsMedia={false} hasMedia={false} caption={{ text: 'Bonjour', language: 'fr' }} />,
    );

    expect(html).toContain('Bonjour');
    expect(html).toContain('lang="fr"');
  });
});
