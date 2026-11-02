import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { FeedCardMedia } from '@/lib/feed/card-model';

import { FeedMediaSurface } from './feed-media-surface';
import ReelImages from './reel-images';

/**
 * #12316 — LE FIL ET LES RÉELS SERVENT LE BON RENDU. Une image du fil porte sa
 * `<source type="image/avif">` avant le `srcset` WebP de son `<img>`, dont le
 * `src` reste l'original HD ; une vidéo HEVC dont le navigateur ne décode pas le
 * codec (aucune sonde ici, comme Firefox) joue son rendu H.264.
 */
const GATE = 'https://gate.meeshy.me/api/v1/attachments/file/';

const media = (partial: Partial<FeedCardMedia>): FeedCardMedia => ({
  id: 'm-1',
  kind: 'image',
  src: `${GATE}photo.jpg`,
  ratio: 1,
  ...partial,
});

describe('FeedMediaSurface — l’image du fil, AVIF puis WebP', () => {
  test('<picture> : la source AVIF, puis l’<img> WebP dont le src reste l’original', () => {
    const html = renderToStaticMarkup(<FeedMediaSurface media={media({ srcSet: `${GATE}p_640w.webp 640w`, avifSrcSet: `${GATE}p_640w.avif 640w` })} />);
    expect(html).toMatch(/<picture><source type="image\/avif" srcSet="[^"]*p_640w\.avif 640w" sizes="[^"]+"\/><img [^>]*src="[^"]*photo\.jpg"/);
    expect(html).toMatch(/<img [^>]*srcSet="[^"]*p_640w\.webp 640w"/);
  });

  test('sans variante : l’<img> d’avant, sans <picture>', () => {
    const html = renderToStaticMarkup(<FeedMediaSurface media={media({})} />);
    expect(html).not.toContain('<picture');
    expect(html).not.toContain('srcSet');
  });
});

describe('FeedMediaSurface — la vidéo HEVC du fil', () => {
  test('sans décodeur HEVC, le rendu H.264 est joué', () => {
    const html = renderToStaticMarkup(
      <FeedMediaSurface media={media({ kind: 'video', src: `${GATE}clip.mov`, compatSrc: `${GATE}clip_h264.mp4`, compatSize: 1, fileSize: 9 })} playable />,
    );
    expect(html).toMatch(/<video [^>]*src="[^"]*clip_h264\.mp4"/);
  });

  test('sans rendu, l’original', () => {
    const html = renderToStaticMarkup(<FeedMediaSurface media={media({ kind: 'video', src: `${GATE}clip.webm` })} playable />);
    expect(html).toMatch(/<video [^>]*src="[^"]*clip\.webm"/);
  });
});

describe('ReelImages — les images d’un réel, AVIF puis WebP', () => {
  test('chaque image porte sa source AVIF', () => {
    const html = renderToStaticMarkup(
      <ReelImages images={[media({ srcSet: `${GATE}p_640w.webp 640w`, avifSrcSet: `${GATE}p_640w.avif 640w` })]} language="fr" />,
    );
    expect(html).toMatch(/<picture class="contents"><source type="image\/avif" srcSet="[^"]*p_640w\.avif 640w"/);
  });
});
