import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS } from '@/lib/profile-decor/catalog';

import { Avatar } from './avatar';
import { AvatarRing, AvatarRingFrame, ringBoxSize, ringDecorSpill, ringedAvatarSize } from './avatar-ring';
import { bannerSvgMarkup, ProfileBannerDesign } from './profile-banner-design';

const filet = BUILTIN_RING_PACKS[0]!.items[0]!;
const masque = BUILTIN_RING_PACKS.find((pack) => pack.slug === 'cadres-illustres')!.items.find((item) => item.key === 'masque-felin')!;
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

  test('un cadre illustré (#13960) pose son film ARRIÈRE sous l’avatar et son film AVANT au-dessus, débordant de la boîte sans la grandir', () => {
    for (const html of [
      renderToStaticMarkup(<AvatarRing ring={masque} size={84}><i data-avatar /></AvatarRing>),
      renderToStaticMarkup(<AvatarRingFrame ring={masque} size={84}><i data-avatar /></AvatarRingFrame>),
    ]) {
      const back = html.indexOf('data-ring-decor="back"');
      const avatar = html.indexOf('data-avatar="true"');
      const front = html.indexOf('data-ring-decor="front"');
      expect(back).toBeGreaterThan(-1);
      expect(back).toBeLessThan(avatar);
      expect(front).toBeGreaterThan(avatar);
      expect(html).toContain(`data-lottie-layer="${masque.decor!.back!.src}"`);
      expect(html).toContain(`data-lottie-layer="${masque.decor!.front!.src}"`);
      expect(html.match(/inset:0px/g)).toHaveLength(2);
      expect(html).toContain('z-index:-1');
      expect(html).toContain('isolation:isolate');
    }
    expect(renderToStaticMarkup(<AvatarRing ring={masque} size={84}><i /></AvatarRing>)).toContain('width:100px');
  });

  test('un cadre illustré tient dans la boîte de l’anneau seul : l’avatar et ses films se réduisent ensemble, rien ne déborde (#15157)', () => {
    const html = renderToStaticMarkup(<AvatarRing ring={masque} size={84}><i data-avatar /></AvatarRing>);
    expect(html).toContain('width:100px');
    expect(html.match(/inset:0px/g)).toHaveLength(2);
    expect(html).toContain(`transform:scale(${1 / masque.decor!.reach})`);
    expect(html.indexOf('transform:scale')).toBeLessThan(html.indexOf('data-avatar="true"'));
  });

  test('la place que l’hôte déclare libre se prend, jamais plus que le film ne la demande (#15157)', () => {
    const html = renderToStaticMarkup(<AvatarRing ring={masque} size={84} room={10}><i data-avatar /></AvatarRing>);
    expect(html.match(/inset:-10px/g)).toHaveLength(2);
    expect(html).toContain(`transform:scale(${120 / 140})`);
    const wide = renderToStaticMarkup(<AvatarRingFrame ring={masque} size={100} room={40}><i data-avatar /></AvatarRingFrame>);
    expect(wide.match(/inset:-20px/g)).toHaveLength(2);
    expect(wide).not.toContain('transform:scale');
  });

  test('l’anneau fixe de repli ne se dessine pas sous un film qui s’affiche (#15157)', () => {
    const color = masque.stroke.colors[0]!;
    expect(renderToStaticMarkup(<AvatarRing ring={masque} size={84}><i /></AvatarRing>)).not.toContain(color);
    expect(renderToStaticMarkup(<AvatarRingFrame ring={masque} size={84}><i /></AvatarRingFrame>)).not.toContain(color);
  });

  test('le cadre illustré s’affiche entier à toutes les tailles — liste, bulle, mini-avatar — dans sa boîte (#16114)', () => {
    for (const size of [52, 32, 22, 18]) {
      const html = renderToStaticMarkup(<AvatarRingFrame ring={masque} size={size}><i data-avatar /></AvatarRingFrame>);
      expect(html).toContain('data-ring-decor="front"');
      expect(html.match(/inset:0px/g)).toHaveLength(2);
      expect(html).toContain(`transform:scale(${1 / masque.decor!.reach})`);
    }
    const bubble = renderToStaticMarkup(<Avatar initials="JC" color="#6366F1" size={28} ring={masque} />);
    expect(bubble).toContain('data-ring-decor="front"');
  });

  test('la cellule de frappe retire les films : l’anneau fixe seul, à sa taille (#16114)', () => {
    const html = renderToStaticMarkup(<Avatar initials="JC" color="#6366F1" size={22} ring={masque} ringDecor={false} />);
    expect(html).not.toContain('data-ring-decor');
    expect(html).not.toContain('transform:scale');
    expect(html).toContain('data-avatar-ring="masque-felin"');
    expect(html).toContain(masque.stroke.colors[0]!);
  });

  test('sous « Réduire les animations », aucun film : l’anneau fixe reste l’image, à sa taille (#15157)', () => {
    const host = globalThis as { window?: unknown };
    const original = host.window;
    host.window = { matchMedia: (query: string) => ({ matches: query.includes('reduce'), media: query }) };
    try {
      const html = renderToStaticMarkup(<AvatarRing ring={masque} size={84}><i data-avatar /></AvatarRing>);
      expect(html).not.toContain('data-ring-decor');
      expect(html).not.toContain('transform:scale');
      expect(html).toContain('data-frame-art');
    } finally {
      host.window = original;
    }
  });

  test('l’hôte qui réserve tout le débordement montre le cadre à sa taille, l’avatar intact (profil, rangée des stories — #15157)', () => {
    expect(ringDecorSpill(masque, 100)).toBeCloseTo(20, 9);
    expect(ringDecorSpill(filet, 100)).toBe(0);
    expect(ringDecorSpill(null, 100)).toBe(0);
    const profile = renderToStaticMarkup(<AvatarRing ring={masque} size={84} room={ringDecorSpill(masque, 100)}><i data-avatar /></AvatarRing>);
    expect(profile).not.toContain('transform:scale');
    expect(profile.match(/inset:-20px/g)).toHaveLength(2);
    const tile = renderToStaticMarkup(<Avatar initials="JC" color="#6366F1" size={88} ring={masque} ringRoom={ringDecorSpill(masque, 88)} />);
    expect(tile).not.toContain('transform:scale');
    expect(tile).toContain('data-ring-decor="front"');
  });

  test('un contour sans calques illustrés garde son rendu d’avant, sans enrobage de plus', () => {
    const html = renderToStaticMarkup(<AvatarRing ring={filet} size={90}><i data-avatar /></AvatarRing>);
    expect(html).not.toContain('data-ring-decor');
    expect(html).not.toContain('isolation');
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
