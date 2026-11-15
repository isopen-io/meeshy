import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../types/content-pack';
import { parseAppearancePackContract } from '../types/appearance-design';
import { parseAvatarRingPackContract } from '../types/avatar-ring-design';
import { parseBannerFramePackContract } from '../types/banner-frame-design';
import { parseFrameMotions } from '../types/frame-decor';
import { parsePackIndex } from '../types/content-pack-index';
import { validateLottie } from '../utils/lottie-validate';
import { collectionsOf, sourcePacks } from '../scripts/compose-meeshy-collections';
import { upsertPacks } from '../scripts/meeshy-collections/source-packs';
import { SEASONAL_ADDED_SLUGS } from '../scripts/seasonal/slugs';

/**
 * #15158 — la boutique propose des COLLECTIONS « par Meeshy » : contours d'avatar, fonds de conversation
 * et cadres de bannière, une collection fixe et une animée pour chacun, ajoutées EN FIN de leur source. Les offres
 * saisonnières de #16270 et #16271 se posent APRÈS elles (`seasonal-offers.test.ts`) : ce témoin lit la source
 * qui les précède.
 */
const DIR = join(__dirname, '../design/appearance');
const text = (file: string): string => readFileSync(join(DIR, file), 'utf8');
const read = (file: string): unknown => JSON.parse(text(file)) as unknown;

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type Pack = { readonly slug: string; readonly order: number; readonly installedByDefault: boolean; readonly removable: boolean; readonly usage?: unknown } & Record<string, unknown>;
const packsOf = (file: string): readonly Pack[] => (read(file) as { packs: readonly Pack[] }).packs.filter((pack) => !SEASONAL_ADDED_SLUGS.includes(pack.slug));

const SOURCES = [
  { file: 'avatar-rings/rings.json', itemsKey: 'rings', slugs: ['meeshy-signature', 'meeshy-vivants'], minimum: [6, 6], usage: { kind: 'free', surfaces: ['avatar'] }, table: 'rings' },
  { file: 'wallpapers/designs.json', itemsKey: 'designs', slugs: ['meeshy-fonds', 'meeshy-fonds-vivants'], minimum: [6, 4], usage: undefined, table: 'designs' },
  { file: 'banner-frames/frames.json', itemsKey: 'frames', slugs: ['meeshy-bordures', 'meeshy-bordures-vivantes'], minimum: [6, 4], usage: { kind: 'free', surfaces: ['banner'] }, table: 'frames' },
] as const;

const collections = collectionsOf();
const entriesOf = { 'avatar-rings/rings.json': collections.rings, 'wallpapers/designs.json': collections.wallpapers, 'banner-frames/frames.json': collections.frames } as const;

type Film = { readonly fr: number; readonly ip: number; readonly op: number; readonly w: number; readonly h: number };
const filmOf = (ref: Ref): { readonly film: Film; readonly bytes: Buffer } => {
  const bytes = readFileSync(join(DIR, 'lottie', ref.src));
  return { film: JSON.parse(bytes.toString('utf8')) as Film, bytes };
};

const expectFilm = (ref: Ref, size: readonly [number, number]) => {
  const { film, bytes } = filmOf(ref);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.sha256);
  expect(bytes.length).toBe(ref.bytes);
  expect(validateLottie(film, { bytes: bytes.length }).ok).toBe(true);
  expect({ src: ref.src, light: bytes.length < 60 * 1024 }).toEqual({ src: ref.src, light: true });
  expect([film.w, film.h]).toEqual([...size]);
  expect(film.fr).toBe(30);
  const seconds = (film.op - film.ip) / film.fr;
  expect({ src: ref.src, loop: seconds >= 4 && seconds <= 16 }).toEqual({ src: ref.src, loop: true });
};

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

describe('les collections Meeshy de la boutique (#15158)', () => {
  it.each(SOURCES.map((source) => [source.file, source] as const))('%s : deux collections EN FIN de source, proposées par la boutique, après tous les autres packs', (_file, source) => {
    const packs = packsOf(source.file);
    const others = packs.slice(0, -2);
    expect(packs.slice(-2).map((pack) => pack.slug)).toEqual([...source.slugs]);
    packs.slice(-2).forEach((pack, index) => {
      expect(pack.installedByDefault).toBe(false);
      expect(pack.removable).toBe(true);
      expect(pack.usage).toEqual(source.usage);
      expect(pack.order).toBe(Math.max(...others.map((other) => other.order)) + 1 + index);
      expect((pack[source.itemsKey] as readonly unknown[]).length).toBeGreaterThanOrEqual(source.minimum[index]!);
    });
  });

  it.each(SOURCES.map((source) => [source.file, source] as const))('%s : la source est celle que le compositeur rend, et le rejouer ne change pas un octet', (_file, source) => {
    const packs = packsOf(source.file);
    const expected = sourcePacks(packs, entriesOf[source.file], source.itemsKey, source.usage);
    expect(packs.slice(-2)).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(upsertPacks(text(source.file), expected)).toBe(text(source.file));
  });

  it('les contrats des six collections se lisent EN ENTIER par le schéma de leur surface', () => {
    const [rings, wallpapers, frames] = SOURCES.map((source) => packsOf(source.file).slice(-2).map((pack) => pack[source.itemsKey] as readonly unknown[]));
    rings!.forEach((items) => expect(parseAvatarRingPackContract({ domain: 'avatar-ring', rings: items })?.rings).toHaveLength(items.length));
    wallpapers!.forEach((items) => expect(parseAppearancePackContract({ domain: 'wallpaper', designs: items })?.designs).toHaveLength(items.length));
    frames!.forEach((items) => expect(parseBannerFramePackContract({ domain: 'banner-frame', frames: items })?.frames).toHaveLength(items.length));
  });

  it('contours : les fixes n’ont ni film ni mouvement ; les animés débordent de 1,25 au plus, par des films valides, carrés, légers et bouclés', () => {
    const [signature, vivants] = packsOf('avatar-rings/rings.json').slice(-2);
    type Ring = { readonly key: string; readonly lottie?: Ref; readonly motion?: unknown; readonly decor?: { readonly reach: number; readonly back?: Ref; readonly front?: Ref }; readonly ornament?: { readonly paths: readonly unknown[] } };
    (signature!['rings'] as readonly Ring[]).forEach((ring) => {
      expect({ key: ring.key, lottie: ring.lottie, motion: ring.motion, decor: ring.decor }).toEqual({ key: ring.key, lottie: undefined, motion: undefined, decor: undefined });
      expect((ring.ornament?.paths.length ?? 0) >= 3).toBe(true);
    });
    (vivants!['rings'] as readonly Ring[]).forEach((ring) => {
      expect({ key: ring.key, reach: (ring.decor?.reach ?? 0) > 1 && (ring.decor?.reach ?? 9) <= 1.25 }).toEqual({ key: ring.key, reach: true });
      expect((ring.ornament?.paths.length ?? 0) >= 3).toBe(true);
      const films = [ring.decor?.back, ring.decor?.front].flatMap((ref) => (ref === undefined ? [] : [ref]));
      expect(films.length).toBeGreaterThan(0);
      const side = Math.round(100 * ring.decor!.reach);
      films.forEach((ref) => expectFilm(ref, [side, side]));
    });
  });

  it('fonds : les fixes sont discrets (encre entre 6 et 8 %, le plancher d’Android pour tout trait de motif) ; les animés portent un film valide, léger et bouclé ; clair et sombre restent proches du blanc et du noir', () => {
    const [signature, vivants] = packsOf('wallpapers/designs.json').slice(-2);
    type Design = { readonly key: string; readonly lottie?: Ref; readonly tile?: { readonly paths: readonly { readonly opacity: number }[] }; readonly palettes: { readonly light: { readonly base: string }; readonly dark: { readonly base: string } } };
    const all = [...(signature!['designs'] as readonly Design[]), ...(vivants!['designs'] as readonly Design[])];
    all.forEach((design) => {
      expect({ key: design.key, light: luminance(design.palettes.light.base) > 0.85, dark: luminance(design.palettes.dark.base) < 0.02 }).toEqual({ key: design.key, light: true, dark: true });
      (design.tile?.paths ?? []).forEach((stroke) => expect({ key: design.key, opacity: stroke.opacity >= 0.06 && stroke.opacity <= 0.08 }).toEqual({ key: design.key, opacity: true }));
    });
    (signature!['designs'] as readonly Design[]).forEach((design) => expect(design.lottie).toBeUndefined());
    (vivants!['designs'] as readonly Design[]).forEach((design) => expectFilm(design.lottie!, [360, 760]));
  });

  it('cadres de bannière : à la lisière (bordure ≤ 7, coins ≤ 12, aucun cartouche en bas) ; les animés déclarent des mouvements lisibles, les fixes aucun', () => {
    const [signature, vivants] = packsOf('banner-frames/frames.json').slice(-2);
    type Frame = { readonly key: string; readonly motion?: unknown; readonly lottie?: unknown; readonly border: { readonly width: number }; readonly reach: { readonly corner: number; readonly cartouche?: { readonly edge: string; readonly depth: number } } };
    const all = [...(signature!['frames'] as readonly Frame[]), ...(vivants!['frames'] as readonly Frame[])];
    all.forEach((frame) => {
      expect({ key: frame.key, border: frame.border.width <= 7, corner: frame.reach.corner <= 12, top: (frame.reach.cartouche?.edge ?? 'top') === 'top', depth: (frame.reach.cartouche?.depth ?? 0) <= 8 }).toEqual({ key: frame.key, border: true, corner: true, top: true, depth: true });
      expect(frame.lottie).toBeUndefined();
    });
    (signature!['frames'] as readonly Frame[]).forEach((frame) => expect(frame.motion).toBeUndefined());
    (vivants!['frames'] as readonly Frame[]).forEach((frame) => expect({ key: frame.key, motions: parseFrameMotions(frame.motion).length >= 2 }).toEqual({ key: frame.key, motions: true }));
  });

  it.each(SOURCES.map((source) => [source.file, source] as const))('%s : le registre généré sert les deux collections, que l’index des packs accepte', (_file, source) => {
    const registry = read(source.file.replace(/[^/]+$/, 'packs.json')) as readonly { readonly slug: string; readonly origin: string; readonly price?: number }[];
    const served = registry.filter((entry) => (source.slugs as readonly string[]).includes(entry.slug));
    expect(served.map((entry) => entry.slug)).toEqual([...source.slugs]);
    expect(served.every((entry) => entry.origin === 'builtin' && entry.price === undefined)).toBe(true);
    expect(parsePackIndex(served).rejected).toBe(0);
  });

  it('aucun film n’est partagé avec une autre couche du catalogue', () => {
    const refs = SOURCES.flatMap((source) => packsOf(source.file).flatMap((pack) => pack[source.itemsKey] as readonly { lottie?: Ref; decor?: { back?: Ref; front?: Ref } }[]))
      .flatMap((item) => [item.lottie, item.decor?.back, item.decor?.front])
      .flatMap((ref) => (ref === undefined ? [] : [ref.src]));
    expect(new Set(refs).size).toBe(refs.length);
  });

  it.each(PACK_LANGUAGES.map((lang) => [lang] as const))('%s nomme et décrit chaque collection, et nomme chacun de ses éléments', (lang) => {
    const strings = read(`strings/${lang}.json`) as { packs: Record<string, { name: string; description: string }> } & Record<'rings' | 'designs' | 'frames', Record<string, string>>;
    SOURCES.forEach((source) => {
      entriesOf[source.file].forEach(({ collection }) => {
        expect(strings.packs[collection.slug]).toEqual(collection.names[lang]);
        expect(collection.names[lang].description.length).toBeGreaterThan(20);
        collection.items.forEach((item) => {
          const { key, names } = item as { readonly key: string; readonly names: Record<string, string> };
          expect({ key, name: strings[source.table][key] }).toEqual({ key, name: names[lang] });
          expect((names[lang] ?? '').length).toBeGreaterThan(0);
        });
      });
    });
  });
});
