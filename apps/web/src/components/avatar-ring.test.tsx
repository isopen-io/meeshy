import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS } from '@/lib/profile-decor/catalog';

import { AvatarRing, ringBoxSize } from './avatar-ring';
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
