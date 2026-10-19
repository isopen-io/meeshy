import { describe, expect, it } from 'vitest';
import { PACK_DOMAINS, isPackOwned, packChoiceKey, parsePackChoiceKey } from '../content-pack';
import { PackIndexEntrySchema, parsePackIndex } from '../content-pack-index';

const sha = (prefix: string): string => prefix.padEnd(64, '0');
const asset = (prefix: string, ext = 'webp') => ({ src: `${prefix}.${ext}`, bytes: 1200, sha256: sha(prefix) });

const entry = (over: Record<string, unknown> = {}) => ({
  slug: 'heritages',
  domain: 'wallpaper',
  origin: 'official',
  version: 1,
  order: 1,
  installedByDefault: false,
  removable: true,
  hidden: false,
  contractSchema: 1,
  cover: asset('a1b2c3d4e5f60718'),
  preview: null,
  contract: asset('c1b2c3d4e5f60718', 'json'),
  strings: {},
  downloadBytes: { story: 0, square: null },
  names: { fr: { name: 'Héritages', description: 'Des motifs venus de loin.' } },
  ...over,
});

const ring = (over: Record<string, unknown> = {}) =>
  entry({ slug: 'contours', domain: 'avatar-ring', usage: { kind: 'free', surfaces: ['avatar'] }, ...over });

describe('les trois domaines de la boutique unifiée', () => {
  it('PACK_DOMAINS gagne wallpaper, avatar-ring, banner, puis banner-frame (#10932)', () => {
    expect([...PACK_DOMAINS]).toEqual(['sticker', 'glory-frame', 'capture-frame', 'wallpaper', 'avatar-ring', 'banner', 'banner-frame']);
  });

  it('les clés de choix des nouveaux domaines se préfixent et se relisent', () => {
    expect(packChoiceKey('wallpaper', 'heritages')).toBe('wallpaper.heritages');
    expect(parsePackChoiceKey('avatar-ring.contours')).toEqual({ domain: 'avatar-ring', slug: 'contours' });
    expect(parsePackChoiceKey('banner.essentielles')).toEqual({ domain: 'banner', slug: 'essentielles' });
    expect(packChoiceKey('banner-frame', 'heritages')).toBe('banner-frame.heritages');
    expect(parsePackChoiceKey('banner-frame.heritages')).toEqual({ domain: 'banner-frame', slug: 'heritages' });
  });
});

describe('le prix d’un pack', () => {
  it('un pack sans prix est gratuit, un prix de 1 à 10 000 Meeshes se lit', () => {
    expect(PackIndexEntrySchema.safeParse(entry()).success).toBe(true);
    expect(PackIndexEntrySchema.safeParse(entry({ price: 1 })).success).toBe(true);
    expect(PackIndexEntrySchema.safeParse(entry({ price: 10_000 })).success).toBe(true);
  });

  it.each([0, -3, 10_001, 2.5, '5'])('le prix %s est refusé', (price) => {
    expect(PackIndexEntrySchema.safeParse(entry({ price })).success).toBe(false);
  });

  it('un pack intégré n’a jamais de prix', () => {
    const builtin = { origin: 'builtin', installedByDefault: true, removable: false };
    expect(PackIndexEntrySchema.safeParse(entry({ ...builtin })).success).toBe(true);
    expect(PackIndexEntrySchema.safeParse(entry({ ...builtin, price: 50 })).success).toBe(false);
  });
});

describe('l’usage d’un pack de contours', () => {
  it('exige l’usage libre sur la seule surface avatar', () => {
    expect(PackIndexEntrySchema.safeParse(ring()).success).toBe(true);
    expect(PackIndexEntrySchema.safeParse(ring({ usage: undefined })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(ring({ usage: { kind: 'free', surfaces: ['avatar', 'call'] } })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(ring({ usage: { kind: 'free', surfaces: ['photo'] } })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(ring({ usage: { kind: 'prestige' } })).success).toBe(false);
  });

  it('un pack de capture ne déclare jamais la surface avatar', () => {
    const capture = (usage: unknown) => entry({ slug: 'cap', domain: 'capture-frame', usage });
    expect(PackIndexEntrySchema.safeParse(capture({ kind: 'free', surfaces: ['photo', 'video'] })).success).toBe(true);
    expect(PackIndexEntrySchema.safeParse(capture({ kind: 'free', surfaces: ['photo', 'avatar'] })).success).toBe(false);
  });

  it('un pack de fonds ou de bannières ne porte aucun usage', () => {
    expect(PackIndexEntrySchema.safeParse(entry({ usage: { kind: 'free', surfaces: ['avatar'] } })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(entry({ domain: 'banner', usage: { kind: 'free', surfaces: ['avatar'] } })).success).toBe(false);
  });

  it('un pack de cadres de bannière exige l’usage libre sur la seule surface bannière (#10932)', () => {
    const frame = (over: Record<string, unknown> = {}) => entry({ slug: 'cadres', domain: 'banner-frame', usage: { kind: 'free', surfaces: ['banner'] }, ...over });
    expect(PackIndexEntrySchema.safeParse(frame()).success).toBe(true);
    expect(PackIndexEntrySchema.safeParse(frame({ usage: undefined })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(frame({ usage: { kind: 'free', surfaces: ['banner', 'avatar'] } })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(frame({ usage: { kind: 'free', surfaces: ['avatar'] } })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(frame({ usage: { kind: 'prestige' } })).success).toBe(false);
  });

  it('aucun autre domaine ne déclare la surface bannière', () => {
    expect(PackIndexEntrySchema.safeParse(ring({ usage: { kind: 'free', surfaces: ['banner'] } })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(entry({ slug: 'cap', domain: 'capture-frame', usage: { kind: 'free', surfaces: ['photo', 'banner'] } })).success).toBe(false);
    expect(PackIndexEntrySchema.safeParse(entry({ domain: 'banner', usage: { kind: 'free', surfaces: ['banner'] } })).success).toBe(false);
  });

  it('le registre tombe entrée par entrée', () => {
    expect(parsePackIndex([entry(), ring({ usage: undefined }), ring()]).entries.map((e) => e.domain)).toEqual(['wallpaper', 'avatar-ring']);
  });
});

describe('la possession', () => {
  const owned = new Set([packChoiceKey('wallpaper', 'premium')]);

  it('un pack gratuit est possédé par tout compte inscrit', () => {
    expect(isPackOwned({ domain: 'wallpaper', slug: 'heritages', price: undefined }, owned)).toBe(true);
    expect(isPackOwned({ domain: 'wallpaper', slug: 'heritages', price: null }, new Set())).toBe(true);
  });

  it('un pack payant n’est possédé que s’il a sa ligne de possession', () => {
    expect(isPackOwned({ domain: 'wallpaper', slug: 'premium', price: 40 }, owned)).toBe(true);
    expect(isPackOwned({ domain: 'wallpaper', slug: 'autre', price: 40 }, owned)).toBe(false);
    expect(isPackOwned({ domain: 'banner', slug: 'premium', price: 40 }, owned)).toBe(false);
  });
});
