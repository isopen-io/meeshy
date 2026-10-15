import { describe, expect, test } from 'bun:test';

import { decodeDesignPackSummary } from '@/lib/profile-decor/pack-summary';

import { WALLPAPER_PACKS } from './wallpaper-catalog';
import { findServedDesign, missingWallpaperContracts, servedWallpaperPacks, withServedNames } from './wallpaper-served';

const SRC = 'aaaaaaaaaaaaaaaa.json';
const decode = decodeDesignPackSummary('wallpaper');
const summary = (over: Record<string, unknown> = {}) =>
  decode({
    slug: 'exemple-prestige',
    name: 'Exemple · Prestige',
    description: 'Un pack payant',
    installed: true,
    owned: true,
    origin: 'official',
    price: 20,
    contract: { src: SRC, bytes: 10, sha256: 'a'.repeat(64) },
    ...over,
  })!;
const design = WALLPAPER_PACKS[0]!.designs[0]!;
const contracts = new Map([[SRC, { domain: 'wallpaper', designs: [design] }]]);

describe('un pack de fonds possédé et installé, non embarqué, se peint depuis son contrat (#10737)', () => {
  test('« Exemple · Prestige » entre dans la feuille avec ses modèles', () => {
    const packs = servedWallpaperPacks([summary()], contracts);
    expect(packs.map((pack) => pack.slug)).toEqual(['exemple-prestige']);
    expect(packs[0]!.designs.map((d) => d.key)).toEqual([design.key]);
  });

  test('un pack tiers (community) suit la même loi', () => {
    expect(servedWallpaperPacks([summary({ origin: 'community', slug: 'tiers' })], contracts).map((pack) => pack.slug)).toEqual(['tiers']);
  });

  test('non possédé, non installé ou builtin : absent', () => {
    expect(servedWallpaperPacks([summary({ owned: false })], contracts)).toEqual([]);
    expect(servedWallpaperPacks([summary({ installed: false })], contracts)).toEqual([]);
    expect(servedWallpaperPacks([summary({ origin: 'builtin' })], contracts)).toEqual([]);
  });

  test('contrat absent, illisible ou d’un autre domaine : le pack tombe seul', () => {
    expect(servedWallpaperPacks([summary()], new Map())).toEqual([]);
    expect(servedWallpaperPacks([summary()], new Map([[SRC, { domain: 'banner', designs: [design] }]]))).toEqual([]);
    expect(servedWallpaperPacks([summary()], new Map([[SRC, { nope: true }]]))).toEqual([]);
  });

  test('demande les contrats manquants, une fois chacun', () => {
    expect(missingWallpaperContracts([summary()], new Map())).toEqual([SRC]);
    expect(missingWallpaperContracts([summary()], contracts)).toEqual([]);
  });

  test('retrouve un modèle servi par pack et clé, pour peindre le fond choisi', () => {
    expect(findServedDesign({ installed: [summary()], contracts, pack: 'exemple-prestige', design: design.key })?.key).toBe(design.key);
    expect(findServedDesign({ installed: [summary()], contracts, pack: 'autre', design: design.key })).toBeUndefined();
  });

  test('le nom du pack vient de sa langue, sinon du résumé', () => {
    const base = { packs: {}, designs: {}, gamut: {} };
    expect(withServedNames(base, [summary()], 'en').packs['exemple-prestige']?.name).toBe('Exemple · Prestige');
    const en = summary({ names: { en: { name: 'Example · Prestige', description: 'A paid pack' } } });
    expect(withServedNames(base, [en], 'en').packs['exemple-prestige']?.name).toBe('Example · Prestige');
  });
});
