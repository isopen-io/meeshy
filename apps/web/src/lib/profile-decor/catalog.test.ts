import { describe, expect, test } from 'bun:test';

import { BUILTIN_BANNER_FRAME_PACKS, BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS, appearanceNames, builtinBannerDesign, builtinBannerFrameDesign, builtinRingDesign } from './catalog';

/** #15553 — chaque pack de contours illustrés ou de Noël et son pack de cadres de bannière assorti. */
const ASSORTED: readonly (readonly [string, string])[] = [
  ['cadres-illustres', 'bannieres-illustrees'],
  ['cadres-asiatiques', 'bannieres-asiatiques'],
  ['cadres-africains', 'bannieres-africaines'],
  ['cadres-celtes', 'bannieres-celtes'],
  ['cadres-nordiques', 'bannieres-nordiques'],
  ['cadres-egyptiens', 'bannieres-egyptiennes'],
  ['cadres-mayas', 'bannieres-mayas'],
  ['cadres-indiens', 'bannieres-indiennes'],
  ['cadres-amerindiens', 'bannieres-amerindiennes'],
  ['cadres-australs', 'bannieres-australes'],
  ['noel-enneige', 'bannieres-noel-enneige'],
  ['lumieres-de-noel', 'bannieres-lumieres-noel'],
  ['atelier-du-pere-noel', 'bannieres-atelier-noel'],
];

/** #16270, #16271 — les offres de Noël et du Nouvel An se posent APRÈS les collections Meeshy ; les comptes ci-dessous portent sur ce qui les précède. */
const SEASONAL: readonly string[] = ['noel-bannieres', 'noel-contours-fixes', 'noel-cadres-fixes', 'nouvel-an-contours', 'nouvel-an-contours-vifs', 'nouvel-an-images', 'nouvel-an-images-vives', 'nouvel-an-cadres', 'nouvel-an-cadres-vifs', 'nouvel-an-fonds', 'nouvel-an-fonds-vifs'];
const beforeSeasonal = <T extends { readonly slug: string }>(packs: readonly T[]): readonly T[] => packs.filter((pack) => !SEASONAL.includes(pack.slug));

describe('le catalogue embarqué du décor de profil', () => {
  test('91 contours, dont 77 avant les offres saisonnières (#16270, #16271), et neuf bannières avant elles, tous lisibles par le contrat partagé — dont les packs de Noël (#15553) et les deux collections Meeshy (#15158), qui débordent de 1,2 au plus', () => {
    expect(BUILTIN_RING_PACKS.flatMap((pack) => pack.items.map((item) => item.key)).slice(0, 9)).toEqual(['filet', 'double-filet', 'perle', 'aurore', 'deco', 'laurier', 'halo-or', 'prisme-vivant', 'onde']);
    expect(BUILTIN_RING_PACKS.flatMap((pack) => pack.items)).toHaveLength(91);
    expect(beforeSeasonal(BUILTIN_RING_PACKS).flatMap((pack) => pack.items)).toHaveLength(77);
    expect(beforeSeasonal(BUILTIN_RING_PACKS).slice(-2).map((pack) => [pack.slug, pack.items.length])).toEqual([['meeshy-signature', 6], ['meeshy-vivants', 6]]);
    expect(beforeSeasonal(BUILTIN_RING_PACKS).at(-2)?.items.every((item) => item.decor === undefined)).toBe(true);
    expect(beforeSeasonal(BUILTIN_RING_PACKS).at(-1)?.items.map((item) => item.decor?.reach)).toEqual([1.2, 1.2, 1.2, 1.2, 1.2, 1.2]);
    expect(BUILTIN_RING_PACKS.find((pack) => pack.slug === 'cadres-illustres')?.items.map((item) => item.decor?.reach)).toEqual([1.4, 1.4, 1.4, 1.4, 1.4, 1.4]);
    const families = BUILTIN_RING_PACKS.filter((pack) => pack.slug.startsWith('cadres-') && pack.slug !== 'cadres-illustres');
    expect(families.length).toBeGreaterThanOrEqual(3);
    families.forEach((pack) => {
      expect({ slug: pack.slug, frames: pack.items.length >= 3 && pack.items.length <= 4 }).toEqual({ slug: pack.slug, frames: true });
      expect(pack.items.every((item) => item.decor?.reach === 1.4 && item.decor.back !== undefined && item.decor.front !== undefined)).toBe(true);
    });
    expect(beforeSeasonal(BUILTIN_BANNER_PACKS).flatMap((pack) => pack.items.map((item) => item.key))).toEqual(['aurore', 'maille', 'constellation', 'art-deco', 'bogolan', 'topographie', 'aurore-vive', 'maree', 'braises']);
  });

  test('les 14 cadres de bannière des sept styles (#10936), fixe et animé, lisibles en entier, puis les bannières assorties (#15553), les deux collections Meeshy (#15158) et les offres saisonnières (#16270, #16271)', () => {
    const styles = ['haussmannien', 'arabe', 'grec', 'ancestral', 'technologique', 'rituel', 'celte'];
    expect(BUILTIN_BANNER_FRAME_PACKS.map((pack) => pack.slug)).toEqual([...styles.map((style) => `cadres-${style}`), ...ASSORTED.map(([, banner]) => banner), 'meeshy-bordures', 'meeshy-bordures-vivantes', 'noel-cadres-fixes', 'nouvel-an-cadres', 'nouvel-an-cadres-vifs']);
    expect(BUILTIN_BANNER_FRAME_PACKS.slice(0, styles.length).map((pack) => pack.items.map((item) => item.key))).toEqual(styles.map((style) => [style, `${style}-anime`]));
    expect(beforeSeasonal(BUILTIN_BANNER_FRAME_PACKS).slice(-2).map((pack) => pack.items.length)).toEqual([6, 4]);
    expect(beforeSeasonal(BUILTIN_BANNER_FRAME_PACKS).at(-1)?.items.every((item) => (item.motion?.length ?? 0) >= 2)).toBe(true);
    expect(BUILTIN_BANNER_FRAME_PACKS.every((pack) => pack.removable)).toBe(true);
    expect(BUILTIN_BANNER_FRAME_PACKS.filter((pack) => pack.installedByDefault).map((pack) => pack.slug)).toEqual(['cadres-haussmannien', 'cadres-ancestral']);
    expect(builtinBannerFrameDesign({ pack: 'cadres-celte', item: 'celte-anime' })?.motion?.length).toBeGreaterThan(0);
    expect(builtinBannerFrameDesign({ pack: 'cadres-celte', item: 'grec' })).toBeNull();
  });

  test('chaque décoration d’avatar illustrée ou de Noël a sa bannière assortie : mêmes clés, même palette, même nom de pack, animée (#15553)', async () => {
    const names = await appearanceNames('fr');
    ASSORTED.forEach(([ringSlug, bannerSlug]) => {
      const rings = BUILTIN_RING_PACKS.find((pack) => pack.slug === ringSlug);
      const banners = BUILTIN_BANNER_FRAME_PACKS.find((pack) => pack.slug === bannerSlug);
      expect(banners?.items.map((item) => item.key)).toEqual(rings?.items.map((item) => item.key));
      banners?.items.forEach((frame, index) => {
        expect(frame.palette).toEqual(rings!.items[index]!.stroke.colors);
        expect((frame.motion?.length ?? 0) > 0).toBe(true);
        expect(builtinBannerFrameDesign({ pack: bannerSlug, item: frame.key })?.key).toBe(frame.key);
      });
      expect(names.packs[bannerSlug]?.name).toBe(names.packs[ringSlug]?.name);
      expect(banners?.installedByDefault).toBe(false);
    });
  });

  test('une référence se résout dans son pack, jamais dans un autre', () => {
    expect(builtinRingDesign({ pack: 'contours-essentiels', item: 'filet' })?.key).toBe('filet');
    expect(builtinRingDesign({ pack: 'bannieres-essentielles', item: 'filet' })).toBeNull();
    expect(builtinBannerDesign({ pack: 'bannieres-essentielles', item: 'aurore' })?.key).toBe('aurore');
    expect(builtinBannerDesign({ pack: 'bannieres-essentielles', item: 'inconnue' })).toBeNull();
  });

  test('les noms viennent des chaînes partagées dans la langue demandée', async () => {
    const english = await appearanceNames('en');
    expect(english.rings['double-filet']).toBe('Double hairline');
    const french = await appearanceNames('fr');
    expect(french.designs['art-deco']).toBe('Art déco');
    expect(french.avatarUsage).toBe('Contour de profil');
    expect(french.frames['rituel-anime']).toBe('Africain rituel animé');
    expect((await appearanceNames('ar')).frames.celte).toBe('سلتي');
  });
});
