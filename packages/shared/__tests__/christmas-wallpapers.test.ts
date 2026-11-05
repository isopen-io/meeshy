import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../types/content-pack';
import { parseAppearanceDesign, parseAppearancePackContract } from '../types/appearance-design';
import { parsePackIndex } from '../types/content-pack-index';
import { validateLottie } from '../utils/lottie-validate';
import { CHRISTMAS_WALLPAPER_SLUGS, christmasWallpaperPacks } from '../scripts/compose-assorted-banners';
import { CHRISTMAS_RING_PACKS } from '../scripts/christmas/packs';
import { CHRISTMAS_WALLPAPER_PACKS } from '../scripts/christmas/wallpapers';
import { MEESHY_COLLECTION_SLUGS } from '../scripts/compose-meeshy-collections';
import { upsertPacks } from '../scripts/meeshy-collections/source-packs';
import { SEASONAL_ADDED_SLUGS } from '../scripts/seasonal/slugs';

/**
 * #15553 — les FONDS de conversation de Noël : un pack fixe et un pack animé, chacun avec un fond par thème de
 * Noël (enneigé, lumières, atelier du Père Noël), pour habiller avatar, bannière et fond du même thème. Un fond
 * vit SOUS les bulles : bases proches du blanc et du noir, encre de motif entre 6 et 8 %, films légers et
 * discrets ; un fond animé garde un dégradé fixe, l'image de « réduire les animations ».
 */
const DIR = join(__dirname, '../design/appearance');
const text = (file: string): string => readFileSync(join(DIR, file), 'utf8');
const read = (file: string): unknown => JSON.parse(text(file)) as unknown;

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type Design = {
  readonly key: string;
  readonly style: string;
  readonly lottie?: Ref;
  readonly tile?: { readonly paths: readonly { readonly opacity: number; readonly role: string }[] };
  readonly gradient?: unknown;
  readonly palettes: { readonly light: { readonly base: string }; readonly dark: { readonly base: string } };
};
type Pack = { readonly slug: string; readonly order: number; readonly installedByDefault: boolean; readonly removable: boolean; readonly usage?: unknown; readonly designs: readonly Design[] };
type Strings = { readonly packs: Record<string, { readonly name: string; readonly description: string }>; readonly designs: Record<string, string> };

const packs = (read('wallpapers/designs.json') as { packs: readonly Pack[] }).packs;
const pack = (slug: string) => packs.find((candidate) => candidate.slug === slug);
const strings = Object.fromEntries(PACK_LANGUAGES.map((lang) => [lang, read(`strings/${lang}.json`) as Strings]));
const THEMES = CHRISTMAS_RING_PACKS.map((ring) => ring.slug);

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

describe('les fonds de conversation de Noël (#15553)', () => {
  it('un pack FIXE et un pack ANIMÉ, chacun avec un fond par thème de Noël, dans l’ordre des packs d’avatar', () => {
    expect(CHRISTMAS_WALLPAPER_PACKS.map((source) => source.animated)).toEqual([false, true]);
    CHRISTMAS_WALLPAPER_PACKS.forEach((source) => {
      expect(source.items.map((item) => item.theme)).toEqual(THEMES);
      expect(pack(source.slug)?.designs.map((design) => design.key)).toEqual(source.items.map((item) => item.key));
    });
  });

  it('proposés par la boutique, retirables, et le contrat de fond lit chaque modèle', () => {
    CHRISTMAS_WALLPAPER_SLUGS.forEach((slug) => {
      const served = pack(slug);
      expect({ slug, installedByDefault: served?.installedByDefault, removable: served?.removable, usage: served?.usage }).toEqual({ slug, installedByDefault: false, removable: true, usage: undefined });
      expect(parseAppearancePackContract({ domain: 'wallpaper', designs: served?.designs })?.designs).toHaveLength(served?.designs.length ?? -1);
      served?.designs.forEach((design) => expect({ key: design.key, ok: parseAppearanceDesign(design, 'wallpaper') !== null }).toEqual({ key: design.key, ok: true }));
    });
  });

  it('sous les bulles : clair proche du blanc, sombre proche du noir, et l’encre d’un motif entre 6 et 8 %', () => {
    CHRISTMAS_WALLPAPER_SLUGS.flatMap((slug) => pack(slug)?.designs ?? []).forEach((design) => {
      expect({ key: design.key, light: luminance(design.palettes.light.base) > 0.85, dark: luminance(design.palettes.dark.base) < 0.02 }).toEqual({ key: design.key, light: true, dark: true });
      (design.tile?.paths ?? []).forEach((stroke) => expect({ key: design.key, ink: stroke.opacity >= 0.06 && stroke.opacity <= 0.08 }).toEqual({ key: design.key, ink: true }));
    });
  });

  it('le pack fixe peint des MOTIFS sans film ; le pack animé garde un dégradé fixe sous un film valide, léger, bouclé et qui bouge', () => {
    const [still, vivant] = CHRISTMAS_WALLPAPER_SLUGS.map((slug) => pack(slug)?.designs ?? []);
    still!.forEach((design) => expect({ key: design.key, style: design.style, lottie: design.lottie }).toEqual({ key: design.key, style: 'pattern', lottie: undefined }));
    vivant!.forEach((design) => {
      expect({ key: design.key, style: design.style, gradient: design.gradient !== undefined }).toEqual({ key: design.key, style: 'gradient', gradient: true });
      const ref = design.lottie!;
      const bytes = readFileSync(join(DIR, 'lottie', ref.src));
      const film = JSON.parse(bytes.toString('utf8')) as { readonly fr: number; readonly ip: number; readonly op: number; readonly w: number; readonly h: number; readonly layers: readonly unknown[] };
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.sha256);
      expect(bytes.length).toBe(ref.bytes);
      expect(validateLottie(film, { bytes: bytes.length }).ok).toBe(true);
      expect({ src: ref.src, light: bytes.length < 60 * 1024 }).toEqual({ src: ref.src, light: true });
      expect([film.w, film.h, film.fr]).toEqual([360, 760, 30]);
      const seconds = (film.op - film.ip) / film.fr;
      expect({ src: ref.src, loop: seconds >= 4 && seconds <= 16 }).toEqual({ src: ref.src, loop: true });
      expect({ src: ref.src, animated: JSON.stringify(film.layers).includes('"a":1') }).toEqual({ src: ref.src, animated: true });
    });
  });

  it('la source est celle que le compositeur rend, avant les collections Meeshy, et le rejouer ne change pas un octet', () => {
    const expected = JSON.parse(JSON.stringify(christmasWallpaperPacks(packs))) as readonly Pack[];
    expect(packs.filter((candidate) => CHRISTMAS_WALLPAPER_SLUGS.includes(candidate.slug))).toEqual(expected);
    const firstMeeshy = packs.findIndex((candidate) => MEESHY_COLLECTION_SLUGS.includes(candidate.slug));
    expected.forEach((served) => expect(packs.findIndex((candidate) => candidate.slug === served.slug)).toBeLessThan(firstMeeshy));
    expect(packs.filter((candidate) => !SEASONAL_ADDED_SLUGS.includes(candidate.slug)).slice(-2).map((candidate) => candidate.slug)).toEqual(['meeshy-fonds', 'meeshy-fonds-vivants']);
    expect(upsertPacks(text('wallpapers/designs.json'), expected, MEESHY_COLLECTION_SLUGS)).toBe(text('wallpapers/designs.json'));
  });

  it('le registre des fonds sert les deux packs, que l’index des packs accepte', () => {
    const registry = read('wallpapers/packs.json') as readonly { readonly slug: string; readonly origin: string; readonly price?: number }[];
    const served = registry.filter((entry) => CHRISTMAS_WALLPAPER_SLUGS.includes(entry.slug));
    expect(served.map((entry) => entry.slug)).toEqual([...CHRISTMAS_WALLPAPER_SLUGS]);
    expect(served.every((entry) => entry.origin === 'builtin' && entry.price === undefined)).toBe(true);
    expect(parsePackIndex(served).rejected).toBe(0);
  });

  it.each(PACK_LANGUAGES.map((lang) => [lang] as const))('%s nomme chaque pack de fonds de Noël et chacun de ses fonds', (lang) => {
    const table = strings[lang]!;
    CHRISTMAS_WALLPAPER_PACKS.forEach((source) => {
      expect(table.packs[source.slug]).toEqual(source.names[lang]);
      expect(source.names[lang].description.length).toBeGreaterThan(20);
      source.items.forEach((item) => expect({ key: item.key, name: table.designs[item.key] }).toEqual({ key: item.key, name: item.names[lang] }));
    });
  });

  it('les clés de Noël ne sont reprises par aucun autre fond ni aucune bannière (la table des noms de modèles est commune)', () => {
    const banners = (read('banners/designs.json') as { packs: readonly Pack[] }).packs;
    const christmas = CHRISTMAS_WALLPAPER_PACKS.flatMap((source) => source.items.map((item) => item.key));
    const elsewhere = [...packs, ...banners].filter((candidate) => !CHRISTMAS_WALLPAPER_SLUGS.includes(candidate.slug)).flatMap((candidate) => candidate.designs.map((design) => design.key));
    expect(new Set(christmas).size).toBe(christmas.length);
    expect(christmas.filter((key) => elsewhere.includes(key))).toEqual([]);
  });
});
