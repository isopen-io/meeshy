import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { FeedCardMedia } from '@/lib/feed/card-model';

import { FeedMediaSurface } from './feed-media-surface';

/**
 * `FeedMediaSurface` — LA LECTURE D'UNE VIDÉO ET D'UN SON DANS LE FIL (#6800).
 *
 * Jusqu'ici, D-42 laissait la surface peindre une AFFICHE IMMOBILE pour
 * `kind === 'video' | 'audio'` : un `background-image` CSS et un glyphe
 * `fillPlay`/`waveform`, jamais d'élément média. Un post vidéo du fil montrait
 * donc un bouton de lecture qui ne lisait RIEN — un contrôle sans effet
 * (loi 4), la forme la plus trompeuse : il AFFIRME une capacité qu'il n'a pas.
 *
 * MAIS LES DEUX USAGES SONT DISTINCTS, et le dernier témoin de ce fichier
 * l'ancre : l'affiche d'un RÉEL ne lit pas — toucher la carte ouvre le lecteur
 * des Réels, qui possède la lecture (#6457). C'est `playable` qui sépare les
 * deux, et son défaut est `false` : une surface ne lit que si son hôte le
 * demande.
 *
 * `renderToStaticMarkup` (motif `attachment-blocks.test.tsx`) : ces témoins
 * interrogent ce que la surface REND, jamais comment elle le tient.
 */
const media = (partial: Partial<FeedCardMedia>): FeedCardMedia => ({
  id: 'm-1',
  kind: 'image',
  src: 'https://gate.meeshy.me/api/v1/attachments/file/photo.jpeg',
  ratio: 1,
  ...partial,
});

describe('FeedMediaSurface — une vidéo du fil se lit dans le fil', () => {
  test('un média VIDÉO monte un élément `<video>` qui porte sa source', () => {
    const html = renderToStaticMarkup(
      <FeedMediaSurface
        media={media({ kind: 'video', src: 'https://gate.meeshy.me/api/v1/attachments/file/clip.webm' })}
        playable
      />,
    );

    expect(html).toContain('<video');
    expect(html).toContain('https://gate.meeshy.me/api/v1/attachments/file/clip.webm');
  });

  test('un média AUDIO monte un élément `<audio>` qui porte sa source', () => {
    const html = renderToStaticMarkup(
      <FeedMediaSurface
        media={media({ kind: 'audio', src: 'https://gate.meeshy.me/api/v1/attachments/file/voix.webm' })}
        playable
      />,
    );

    expect(html).toContain('<audio');
    expect(html).toContain('https://gate.meeshy.me/api/v1/attachments/file/voix.webm');
  });

  /**
   * L'AFFICHE RESTE — `poster` est ce que le navigateur peint AVANT la
   * première image décodée ; la retirer ferait clignoter un cadre noir à
   * l'ouverture du fil, exactement ce que le repli CSS évitait.
   */
  test('la vignette servie devient le `poster` de la vidéo, jamais un fond perdu', () => {
    const html = renderToStaticMarkup(
      <FeedMediaSurface
        media={media({ kind: 'video', src: 'https://gate.meeshy.me/clip.webm', thumbnailSrc: 'https://gate.meeshy.me/vignette.jpeg' })}
        playable
      />,
    );

    expect(html).toContain('poster="https://gate.meeshy.me/vignette.jpeg"');
  });

  /** Une IMAGE ne change pas de rendu — la tranche vidéo ne la touche pas. */
  test('un média IMAGE rend toujours son `<img>`, sans élément de lecture', () => {
    const html = renderToStaticMarkup(<FeedMediaSurface media={media({ kind: 'image' })} playable />);

    expect(html).toContain('<img');
    expect(html).not.toContain('<video');
    expect(html).not.toContain('<audio');
  });

  /**
   * LA DÉCISION DU RÉEL, ANCRÉE ICI (#6457) — ce témoin existe parce que la
   * première version de cette tranche l'a CASSÉE : monter la lecture dans la
   * surface sans distinguer l'usage faisait décoder une piste entière pour une
   * vignette qu'on quitte au premier tap, et contredisait frontalement
   * `feed-post-card.test.tsx` § « le RÉEL, affiche immobile plein cadre ».
   *
   * Sans `playable`, la surface AFFICHE. C'est le défaut, et il est gardé ici
   * autant que chez l'hôte.
   */
  test('SANS `playable`, une vidéo reste une affiche immobile — la lecture appartient au lecteur des Réels', () => {
    const html = renderToStaticMarkup(
      <FeedMediaSurface media={media({ kind: 'video', src: 'https://gate.meeshy.me/clip.webm', thumbnailSrc: 'https://gate.meeshy.me/v.jpeg' })} />,
    );

    expect(html).not.toContain('<video');
    expect(html).toContain('url(&quot;https://gate.meeshy.me/v.jpeg&quot;)');
  });
});
