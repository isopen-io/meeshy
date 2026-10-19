import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { parseBannerFrameDesign, type BannerFrameDesign } from '@meeshy/shared/types/banner-frame-design';
import type { ServedProfileDecor } from '@meeshy/shared/types/profile-decor';

import { loadProfileDecorCatalog } from '@/lib/i18n-profile-decor-catalog';
import { BUILTIN_BANNER_PACKS } from '@/lib/profile-decor/catalog';
import { resolveBannerFrame } from '@/lib/profile-decor/resolve';
import { missingContracts } from '@/lib/profile-decor/use-decor-designs';

import { ProfileHero as OwnHero } from './profile-sections';

await loadProfileDecorCatalog('fr');

/**
 * LE CADRE DE BANNIÈRE SE POSE SUR LA PHOTO (#10935) — il ne remplace jamais ni la
 * photo ni le fond (`bannerPaint`, #10933, reste la seule règle de ce qui se peint
 * DESSOUS) : il se pose PAR-DESSUS, sous les badges du jeu.
 */
const noop = () => undefined;

const frameJson = {
  key: 'haussmannien',
  viewBox: [0, 0, 300, 100],
  palette: ['#DCD2C0', '#B8954F'],
  border: { width: 9.6, color: 0, opacity: 1 },
  reach: { corner: 14 },
};
const frame: BannerFrameDesign = parseBannerFrameDesign(frameJson)!;
const aurore = BUILTIN_BANNER_PACKS[0]!.items[0]!;

const ownHero = (props: Partial<Parameters<typeof OwnHero>[0]>) =>
  renderToStaticMarkup(
    <OwnHero language="fr" profile={{ username: 'ada', displayName: 'Ada', avatar: null, banner: 'media:banner-1' }} editing={false} pending={{}} onPick={noop} onCancelUpload={noop} {...props} />,
  );

const banner = (html: string): string => html.slice(html.indexOf('data-profile-banner'));

describe('le cadre de bannière équipé se pose sur la bannière de mon profil', () => {
  test('au-dessus de la photo, qui reste peinte', () => {
    const html = banner(ownHero({ decor: { ring: null, banner: aurore, bannerFrame: frame }, game: <i data-game-slot /> }));
    expect(html).toContain('<img');
    expect(html).not.toContain('data-banner-design');
    expect(html.indexOf('data-banner-frame="haussmannien"')).toBeGreaterThan(html.indexOf('<img'));
    expect(html.indexOf('data-banner-frame="haussmannien"')).toBeLessThan(html.indexOf('data-game-slot'));
  });

  test('au-dessus du fond quand il n’y a pas de photo', () => {
    const html = banner(ownHero({ profile: { username: 'ada', displayName: 'Ada', avatar: null, banner: null }, decor: { ring: null, banner: aurore, bannerFrame: frame } }));
    expect(html.indexOf('data-banner-frame="haussmannien"')).toBeGreaterThan(html.indexOf('data-banner-design="aurore"'));
  });

  test('sans cadre équipé, la bannière d’avant', () => {
    expect(ownHero({ decor: { ring: null, banner: null } })).not.toContain('data-banner-frame');
    expect(ownHero({ decor: { ring: null, banner: null, bannerFrame: null } })).not.toContain('data-banner-frame');
  });
});

describe('le cadre servi se résout comme les autres côtés du décor', () => {
  const official = { pack: 'cadres-patrimoine', item: 'haussmannien', origin: 'official', contract: '0123456789abcdef.json' } as const;

  test('depuis son contrat adressé par contenu', () => {
    const contracts = new Map<string, unknown>([[official.contract, { domain: 'banner-frame', frames: [frameJson] }]]);
    expect(resolveBannerFrame(official, contracts)?.key).toBe('haussmannien');
  });

  test('un contrat d’un autre domaine, absent ou un cadre inconnu ne peignent rien', () => {
    expect(resolveBannerFrame(official, new Map([[official.contract, { domain: 'avatar-ring', rings: [] }]]))).toBeNull();
    expect(resolveBannerFrame(official, new Map())).toBeNull();
    expect(resolveBannerFrame({ ...official, item: 'inconnu' }, new Map([[official.contract, { domain: 'banner-frame', frames: [frameJson] }]]))).toBeNull();
    expect(resolveBannerFrame(null, new Map())).toBeNull();
  });

  test('son contrat est demandé avec ceux du contour et du fond', () => {
    const decor: ServedProfileDecor = { avatarRing: null, banner: null, bannerFrame: official };
    expect(missingContracts(decor, new Map())).toEqual([official.contract]);
  });
});
