import { describe, expect, test } from 'bun:test';

import { BUILTIN_BANNER_FRAME_PACKS, BUILTIN_BANNER_PACKS, BUILTIN_RING_PACKS, appearanceNames, builtinBannerDesign, builtinBannerFrameDesign, builtinRingDesign } from './catalog';

describe('le catalogue embarqué du décor de profil', () => {
  test('38 contours et neuf bannières, tous lisibles par le contrat partagé', () => {
    expect(BUILTIN_RING_PACKS.flatMap((pack) => pack.items.map((item) => item.key)).slice(0, 9)).toEqual(['filet', 'double-filet', 'perle', 'aurore', 'deco', 'laurier', 'halo-or', 'prisme-vivant', 'onde']);
    expect(BUILTIN_RING_PACKS.flatMap((pack) => pack.items)).toHaveLength(38);
    expect(BUILTIN_RING_PACKS.find((pack) => pack.slug === 'cadres-illustres')?.items.map((item) => item.decor?.reach)).toEqual([1.4, 1.4, 1.4, 1.4, 1.4, 1.4]);
    const families = BUILTIN_RING_PACKS.filter((pack) => pack.slug.startsWith('cadres-') && pack.slug !== 'cadres-illustres');
    expect(families.length).toBeGreaterThanOrEqual(3);
    families.forEach((pack) => {
      expect({ slug: pack.slug, frames: pack.items.length >= 3 && pack.items.length <= 4 }).toEqual({ slug: pack.slug, frames: true });
      expect(pack.items.every((item) => item.decor?.reach === 1.4 && item.decor.back !== undefined && item.decor.front !== undefined)).toBe(true);
    });
    expect(BUILTIN_BANNER_PACKS.flatMap((pack) => pack.items.map((item) => item.key))).toEqual(['aurore', 'maille', 'constellation', 'art-deco', 'bogolan', 'topographie', 'aurore-vive', 'maree', 'braises']);
  });

  test('les 14 cadres de bannière des sept styles (#10936), fixe et animé, lisibles en entier', () => {
    const styles = ['haussmannien', 'arabe', 'grec', 'ancestral', 'technologique', 'rituel', 'celte'];
    expect(BUILTIN_BANNER_FRAME_PACKS.map((pack) => pack.slug)).toEqual(styles.map((style) => `cadres-${style}`));
    expect(BUILTIN_BANNER_FRAME_PACKS.map((pack) => pack.items.map((item) => item.key))).toEqual(styles.map((style) => [style, `${style}-anime`]));
    expect(BUILTIN_BANNER_FRAME_PACKS.every((pack) => pack.removable)).toBe(true);
    expect(BUILTIN_BANNER_FRAME_PACKS.filter((pack) => pack.installedByDefault).map((pack) => pack.slug)).toEqual(['cadres-haussmannien', 'cadres-ancestral']);
    expect(builtinBannerFrameDesign({ pack: 'cadres-celte', item: 'celte-anime' })?.motion?.length).toBeGreaterThan(0);
    expect(builtinBannerFrameDesign({ pack: 'cadres-celte', item: 'grec' })).toBeNull();
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
