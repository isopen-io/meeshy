import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS } from '@/lib/profile-decor/catalog';

import { AvatarRing, ringBoxSize, ringedAvatarSize } from './avatar-ring';
import { bannerSvgMarkup, ProfileBannerDesign } from './profile-banner-design';

const filet = BUILTIN_RING_PACKS[0]!.items[0]!;
const aurore = BUILTIN_BANNER_PACKS[0]!.items[0]!;

describe('le contour autour de l’avatar', () => {
  test('sans contour, l’avatar est rendu tel quel : aucun enrobage', () => {
    const html = renderToStaticMarkup(
      <AvatarRing ring={null} size={90}>
        <i data-avatar />
      </AvatarRing>,
    );
    expect(html).toBe('<i data-avatar="true"></i>');
  });

  test('avec un contour, une couche SVG décorative entoure l’avatar sans le modifier', () => {
    const html = renderToStaticMarkup(
      <AvatarRing ring={filet} size={90}>
        <i data-avatar />
      </AvatarRing>,
    );
    expect(html).toContain('data-avatar-ring="filet"');
    expect(html).toContain('<svg');
    expect(html).toContain('#6366F1');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<i data-avatar="true"></i>');
  });

  test('l’avatar occupe le cercle de rayon 42 du contour : la boîte est plus grande que lui', () => {
    expect(ringBoxSize(84)).toBe(100);
    expect(ringBoxSize(90)).toBeGreaterThan(90);
  });
});

describe('la bannière de design', () => {
  test('le SVG est peint depuis le contrat et remplit la boîte en rognant', () => {
    const markup = bannerSvgMarkup({ design: aurore, scheme: 'dark', accent: '#6366F1' });
    expect(markup).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(markup.startsWith('<svg')).toBe(true);
  });

  test('le composant porte la clé du design et reste décoratif', () => {
    const html = renderToStaticMarkup(<ProfileBannerDesign design={aurore} accent="#6366F1" scheme="light" />);
    expect(html).toContain('data-banner-design="aurore"');
    expect(html).toContain('aria-hidden="true"');
  });

  test('le clair et le sombre ne peignent pas pareil', () => {
    const light = renderToStaticMarkup(<ProfileBannerDesign design={aurore} accent="#6366F1" scheme="light" />);
    const dark = renderToStaticMarkup(<ProfileBannerDesign design={aurore} accent="#6366F1" scheme="dark" />);
    expect(light).not.toBe(dark);
  });
});

describe('la couche Lottie du contour et de la bannière (#10638)', () => {
  const halo = BUILTIN_RING_PACKS.flatMap((pack) => pack.items).find((ring) => ring.key === 'halo-or')!;
  const vive = BUILTIN_BANNER_PACKS.flatMap((pack) => pack.items).find((banner) => banner.key === 'aurore-vive')!;

  test('un contour qui déclare lottie porte une couche animée, derrière l’avatar et décorative', () => {
    const html = renderToStaticMarkup(
      <AvatarRing ring={halo} size={90}>
        <i data-avatar />
      </AvatarRing>,
    );
    expect(html).toContain('data-lottie-layer="ec52a7f12af8a193.json"');
    expect(html.indexOf('data-lottie-layer')).toBeLessThan(html.indexOf('data-avatar="true"'));
    expect(html).toContain('<svg');
  });

  test('un contour sans lottie n’ajoute AUCUN nœud', () => {
    const html = renderToStaticMarkup(
      <AvatarRing ring={filet} size={90}>
        <i data-avatar />
      </AvatarRing>,
    );
    expect(html).not.toContain('data-lottie-layer');
  });

  test('une bannière animée superpose sa couche au dessin ; une bannière statique reste identique', () => {
    expect(renderToStaticMarkup(<ProfileBannerDesign design={vive} accent="#6366F1" scheme="dark" />)).toContain('data-lottie-layer="5aff839c02a1cfcb.json"');
    const still = renderToStaticMarkup(<ProfileBannerDesign design={aurore} accent="#6366F1" scheme="dark" />);
    expect(still).not.toContain('data-lottie-layer');
    expect(still.startsWith('<span aria-hidden="true" data-banner-design="aurore"')).toBe(true);
  });
});

describe('le contour dans l’empreinte de l’avatar (#10713, #10714)', () => {
  test('l’avatar rétrécit pour tenir dans le cercle du contour, l’empreinte ne bouge pas', () => {
    expect(ringedAvatarSize(44, false)).toBe(36);
    expect(ringedAvatarSize(80, false)).toBe(67);
  });

  test('avec un anneau de story, l’avatar rétrécit encore : l’anneau reste à l’intérieur du contour', () => {
    expect(ringedAvatarSize(80, true)).toBe(61);
    expect(ringedAvatarSize(80, true) + 6).toBeLessThanOrEqual(Math.floor(80 * 0.84));
  });

  test('un avatar avec contour pose les deux couches, contour dehors et anneau de story dedans', async () => {
    const { Avatar } = await import('./avatar');
    const html = renderToStaticMarkup(<Avatar initials="AB" color="#6366F1" size={80} ring={filet} storyRing={{ entryStoryId: 'p1', unseen: true }} />);
    expect(html).toContain('data-avatar-ring="filet"');
    expect(html).toContain('data-story-ring="unseen"');
    expect(html.indexOf('data-avatar-ring')).toBeLessThan(html.indexOf('data-story-ring'));
    expect(html).toContain('width:80px;height:80px');
  });

  test('l’anneau de story d’un avatar à initiales reste visible à côté du contour : un liseré de surface le sépare de l’avatar (#10739)', async () => {
    const { Avatar } = await import('./avatar');
    const style = (html: string) => /data-story-ring="unseen"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';
    const ringed = style(renderToStaticMarkup(<Avatar initials="AB" color="#7B9FB0" size={44} ring={filet} storyRing={{ entryStoryId: 'p1', unseen: true }} />));
    expect(ringed).toContain('var(--color-ios-surface)');
    const bare = style(renderToStaticMarkup(<Avatar initials="AB" color="#7B9FB0" size={44} storyRing={{ entryStoryId: 'p1', unseen: true }} />));
    expect(bare).not.toContain('var(--color-ios-surface)');
  });

  test('sans contour, l’avatar est inchangé', async () => {
    const { Avatar } = await import('./avatar');
    expect(renderToStaticMarkup(<Avatar initials="AB" color="#6366F1" size={44} ring={null} />)).toBe(renderToStaticMarkup(<Avatar initials="AB" color="#6366F1" size={44} />));
  });
});
