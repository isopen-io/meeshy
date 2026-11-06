import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../types/content-pack';
import { parseAppearanceDesign, patternInkOpacity } from '../types/appearance-design';
import { parseAvatarRingDesign } from '../types/avatar-ring-design';
import { parseBannerFrameDesign } from '../types/banner-frame-design';
import { PackAvailabilitySchema, parsePackIndex } from '../types/content-pack-index';
import { packWindowState } from '../types/pack-availability';
import { validateLottie } from '../utils/lottie-validate';
import { MEESHY_COLLECTION_SLUGS } from '../scripts/compose-meeshy-collections';
import { CHRISTMAS_SLUGS, CHRISTMAS_WALLPAPER_SLUGS } from '../scripts/compose-assorted-banners';
import { SEASONAL_SOURCES, seasonalPacks } from '../scripts/compose-seasonal-offers';
import { upsertPacks } from '../scripts/meeshy-collections/source-packs';
import { CHRISTMAS_EVENT, CHRISTMAS_FRAME_SLUGS, CHRISTMAS_OFFER_SLUGS, NEW_YEAR_EVENT, NEW_YEAR_OFFER_SLUGS, SEASONAL_SLUGS } from '../scripts/seasonal/slugs';

/**
 * #16270 et #16271 — les offres Meeshy de NOËL et du NOUVEL AN : gratuites, signées Meeshy, offertes par la
 * boutique dans leur FENÊTRE, calculée par la règle de #16447 chaque année (#16450) — Noël du 25 octobre au 24 janvier,
 * Nouvel An du 1er novembre au 31 janvier, dans
 * les quatre catégories — contours d'avatar, images de bannière, cadres de bannière, fonds de conversation —
 * chacune statique ET animée. Les nouveaux packs s'ajoutent EN FIN de source : rien de ce qui les précède ne
 * bouge, sinon la fenêtre que les packs de Noël existants reçoivent.
 */
const DIR = join(__dirname, '../design/appearance');
const text = (file: string): string => readFileSync(join(DIR, file), 'utf8');
const read = (file: string): unknown => JSON.parse(text(file)) as unknown;

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type Item = {
  readonly key: string;
  readonly style?: string;
  readonly lottie?: Ref;
  readonly decor?: { readonly back?: Ref; readonly front?: Ref };
  readonly motion?: readonly unknown[];
  readonly tile?: { readonly paths: readonly { readonly opacity: number }[] };
  readonly palettes?: { readonly light: { readonly base: string }; readonly dark: { readonly base: string } };
};
type Pack = {
  readonly slug: string;
  readonly order: number;
  readonly installedByDefault: boolean;
  readonly removable: boolean;
  readonly usage?: unknown;
  readonly availability?: { readonly startsAt?: string; readonly endsAt?: string };
  readonly event?: { readonly id: string; readonly recurrence?: string; readonly year?: number };
  readonly designs?: readonly Item[];
  readonly rings?: readonly Item[];
  readonly frames?: readonly Item[];
};
type Entry = { readonly slug: string; readonly origin: string; readonly price?: number; readonly availability?: unknown; readonly installedByDefault: boolean };

const SOURCES = {
  wallpaper: { file: 'wallpapers/designs.json', registry: 'wallpapers/packs.json', items: 'designs' },
  banner: { file: 'banners/designs.json', registry: 'banners/packs.json', items: 'designs' },
  'avatar-ring': { file: 'avatar-rings/rings.json', registry: 'avatar-rings/packs.json', items: 'rings' },
  'banner-frame': { file: 'banner-frames/frames.json', registry: 'banner-frames/packs.json', items: 'frames' },
} as const;
type Domain = keyof typeof SOURCES;
const DOMAINS = Object.keys(SOURCES) as Domain[];

const packsOf = (domain: Domain): readonly Pack[] => (read(SOURCES[domain].file) as { packs: readonly Pack[] }).packs;
const itemsOf = (domain: Domain, pack: Pack | undefined): readonly Item[] => (pack?.[SOURCES[domain].items] ?? []) as readonly Item[];
const allPacks = DOMAINS.flatMap((domain) => packsOf(domain).map((pack) => ({ domain, pack })));
const find = (slug: string) => allPacks.find((candidate) => candidate.pack.slug === slug);
const strings = Object.fromEntries(
  PACK_LANGUAGES.map((lang) => [lang, read(`strings/${lang}.json`) as { packs: Record<string, { name: string; description: string }>; designs: Record<string, string>; rings: Record<string, string>; frames: Record<string, string> }]),
);
const TABLE: Readonly<Record<Domain, 'designs' | 'rings' | 'frames'>> = { wallpaper: 'designs', banner: 'designs', 'avatar-ring': 'rings', 'banner-frame': 'frames' };

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

const filmsOf = (item: Item): readonly Ref[] => [item.lottie, item.decor?.back, item.decor?.front].flatMap((ref) => (ref === undefined ? [] : [ref]));
const isAnimated = (domain: Domain, item: Item): boolean => (domain === 'banner-frame' ? (item.motion?.length ?? 0) > 0 : filmsOf(item).length > 0);

const CHRISTMAS_WINDOW = { startsAt: '2026-10-25T00:00:00Z', endsAt: '2027-01-25T00:00:00Z' } as const;
const NEW_YEAR_WINDOW = { startsAt: '2026-11-01T00:00:00Z', endsAt: '2027-02-01T00:00:00Z' } as const;

describe('les fenêtres de Noël et du Nouvel An (#16270, #16271), calculées par la règle (#16447) chaque année (#16450)', () => {
  it('Noël et le Nouvel An sont déclarés par leur ÉVÉNEMENT ANNUEL (#16450), sans date écrite ni année', () => {
    expect(CHRISTMAS_EVENT).toEqual({ id: 'christmas', recurrence: 'yearly' });
    expect(NEW_YEAR_EVENT).toEqual({ id: 'new-year', recurrence: 'yearly' });
  });

  it('chaque pack de Noël — existants compris — déclare Noël, chaque pack du Nouvel An le Nouvel An, chaque année, aucun n’écrit de date, et aucun autre pack ne déclare d’événement', () => {
    expect([...CHRISTMAS_SLUGS, ...CHRISTMAS_FRAME_SLUGS, ...CHRISTMAS_WALLPAPER_SLUGS].every((slug) => CHRISTMAS_OFFER_SLUGS.includes(slug))).toBe(true);
    expect(CHRISTMAS_OFFER_SLUGS).toHaveLength(11);
    expect(NEW_YEAR_OFFER_SLUGS).toHaveLength(8);
    allPacks.forEach(({ pack }) => {
      const expected = CHRISTMAS_OFFER_SLUGS.includes(pack.slug) ? CHRISTMAS_EVENT : NEW_YEAR_OFFER_SLUGS.includes(pack.slug) ? NEW_YEAR_EVENT : undefined;
      expect({ slug: pack.slug, event: pack.event, availability: pack.availability }).toEqual({ slug: pack.slug, event: expected, availability: undefined });
    });
  });

  it('les registres servis portent la fenêtre CALCULÉE — Noël du 25 octobre au 25 janvier exclu, Nouvel An du 1er novembre au 1er février exclu —, gratuits, intégrés, à ajouter depuis la boutique, et l’index des packs les accepte', () => {
    [CHRISTMAS_WINDOW, NEW_YEAR_WINDOW].forEach((window) => expect(PackAvailabilitySchema.safeParse(window).success).toBe(true));
    const state = (window: typeof CHRISTMAS_WINDOW, iso: string) => packWindowState(window, new Date(iso));
    expect(['2026-10-24T23:59:00Z', '2026-11-06T12:00:00Z', '2027-01-24T23:59:00Z', '2027-01-25T00:00:00Z'].map((iso) => state(CHRISTMAS_WINDOW, iso))).toEqual(['upcoming', 'open', 'open', 'closed']);
    expect(['2026-10-31T23:59:00Z', '2026-11-01T00:00:00Z', '2027-01-31T23:59:00Z', '2027-02-01T00:00:00Z'].map((iso) => state(NEW_YEAR_WINDOW, iso))).toEqual(['upcoming', 'open', 'open', 'closed']);
    DOMAINS.forEach((domain) => {
      const registry = read(SOURCES[domain].registry) as readonly Entry[];
      const seasonal = registry.filter((entry) => SEASONAL_SLUGS.includes(entry.slug));
      expect(parsePackIndex(seasonal).rejected).toBe(0);
      seasonal.forEach((entry) => {
        const window = CHRISTMAS_OFFER_SLUGS.includes(entry.slug) ? CHRISTMAS_WINDOW : NEW_YEAR_WINDOW;
        expect({ slug: entry.slug, origin: entry.origin, price: entry.price, installed: entry.installedByDefault, availability: entry.availability }).toEqual({ slug: entry.slug, origin: 'builtin', price: undefined, installed: false, availability: window });
      });
      expect(seasonal).toHaveLength(packsOf(domain).filter((pack) => pack.event !== undefined).length);
    });
  });
});

describe('l’offre du Nouvel An (#16271) : quatre catégories, chacune statique ET animée, quatre thèmes', () => {
  const THEMES = ['artifice', 'confettis', 'minuit', 'champagne'];

  it('huit packs, un statique et un animé par catégorie, chacun avec un objet par thème dans l’ordre feux d’artifice, confettis, minuit, champagne', () => {
    const byDomain = DOMAINS.map((domain) => NEW_YEAR_OFFER_SLUGS.map(find).filter((found) => found?.domain === domain).map((found) => found!.pack));
    byDomain.forEach((packs, index) => {
      const domain = DOMAINS[index]!;
      expect({ domain, count: packs.length }).toEqual({ domain, count: 2 });
      const [still, vivant] = packs;
      expect(itemsOf(domain, still).map((item) => isAnimated(domain, item))).toEqual([false, false, false, false]);
      expect(itemsOf(domain, vivant).map((item) => isAnimated(domain, item))).toEqual([true, true, true, true]);
    });
    SEASONAL_SOURCES.newYear.forEach((source) => expect(source.themes).toEqual(THEMES));
  });

  it('chaque thème a SON dessin : aucune forme fixe n’est reprise d’un thème à l’autre', () => {
    DOMAINS.forEach((domain) => {
      NEW_YEAR_OFFER_SLUGS.map(find).filter((found) => found?.domain === domain).forEach((found) => {
        const drawings = itemsOf(domain, found!.pack).map(({ key: _key, lottie: _lottie, decor: _decor, motion: _motion, ...rest }) => JSON.stringify(rest));
        expect({ slug: found!.pack.slug, distinct: new Set(drawings).size }).toEqual({ slug: found!.pack.slug, distinct: drawings.length });
      });
    });
  });
});

describe('l’offre de Noël (#16270) complétée', () => {
  it('un pack d’IMAGES de bannière de Noël : trois statiques puis trois animées, assorties aux trois thèmes', () => {
    const pack = find('noel-bannieres');
    expect(pack?.domain).toBe('banner');
    expect(itemsOf('banner', pack?.pack).map((item) => isAnimated('banner', item))).toEqual([false, false, false, true, true, true]);
  });

  it('chaque thème de Noël a sa paire statique ET animée en contours et en cadres de bannière', () => {
    const stillRings = itemsOf('avatar-ring', find('noel-contours-fixes')?.pack);
    const stillFrames = itemsOf('banner-frame', find('noel-cadres-fixes')?.pack);
    const animatedRings = CHRISTMAS_SLUGS.flatMap((slug) => itemsOf('avatar-ring', find(slug)?.pack));
    const animatedFrames = CHRISTMAS_FRAME_SLUGS.flatMap((slug) => itemsOf('banner-frame', find(slug)?.pack));
    expect(stillRings.map((ring) => ring.key)).toEqual(animatedRings.map((ring) => `${ring.key}-fixe`));
    expect(stillFrames.map((frame) => frame.key)).toEqual(animatedFrames.map((frame) => `${frame.key}-fixe`));
    expect([...stillRings.map((item) => isAnimated('avatar-ring', item)), ...stillFrames.map((item) => isAnimated('banner-frame', item))].every((animated) => !animated)).toBe(true);
    expect([...animatedRings.map((item) => isAnimated('avatar-ring', item)), ...animatedFrames.map((item) => isAnimated('banner-frame', item))].every(Boolean)).toBe(true);
  });
});

describe('les objets des offres saisonnières', () => {
  const seasonal = SEASONAL_SLUGS.filter((slug) => !CHRISTMAS_SLUGS.includes(slug) && !CHRISTMAS_FRAME_SLUGS.includes(slug) && !CHRISTMAS_WALLPAPER_SLUGS.includes(slug)).map((slug) => find(slug)!);

  it('passent le schéma de leur surface', () => {
    expect(seasonal).toHaveLength(11);
    seasonal.forEach(({ domain, pack }) => {
      itemsOf(domain, pack).forEach((item) => {
        const ok = domain === 'avatar-ring' ? parseAvatarRingDesign(item) !== null : domain === 'banner-frame' ? parseBannerFrameDesign(item) !== null : parseAppearanceDesign(item, domain) !== null;
        expect({ key: item.key, ok }).toEqual({ key: item.key, ok: true });
      });
    });
  });

  it('un fond reste SOUS les bulles (bases proches du blanc et du noir, encre de motif entre 6 et 8 %), une bannière à motif se VOIT (encre au-delà de 12 %)', () => {
    seasonal.forEach(({ domain, pack }) => {
      itemsOf(domain, pack).forEach((item) => {
        if (domain === 'wallpaper') {
          expect({ key: item.key, light: luminance(item.palettes!.light.base) > 0.85, dark: luminance(item.palettes!.dark.base) < 0.02 }).toEqual({ key: item.key, light: true, dark: true });
          (item.tile?.paths ?? []).forEach((stroke) => expect({ key: item.key, ink: stroke.opacity >= 0.06 && stroke.opacity <= 0.08 }).toEqual({ key: item.key, ink: true }));
        }
        if (domain === 'banner' && item.style === 'pattern') expect({ key: item.key, seen: patternInkOpacity(parseAppearanceDesign(item, 'banner')!) > 0.12 }).toEqual({ key: item.key, seen: true });
      });
    });
  });

  it('chaque film est adressé par contenu, valide, léger, bouclé à 30 i/s entre 4 et 16 secondes, et bouge', () => {
    const DIMENSIONS: Readonly<Record<Domain, readonly number[] | null>> = { wallpaper: [360, 760], banner: [600, 200], 'avatar-ring': [140, 140], 'banner-frame': null };
    const films = seasonal.flatMap(({ domain, pack }) => itemsOf(domain, pack).flatMap((item) => filmsOf(item).map((ref) => ({ domain, ref }))));
    expect(films.length).toBeGreaterThanOrEqual(19);
    films.forEach(({ domain, ref }) => {
      const bytes = readFileSync(join(DIR, 'lottie', ref.src));
      const film = JSON.parse(bytes.toString('utf8')) as { readonly fr: number; readonly ip: number; readonly op: number; readonly w: number; readonly h: number; readonly layers: readonly unknown[] };
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.sha256);
      expect(bytes.length).toBe(ref.bytes);
      expect({ src: ref.src, ok: validateLottie(film, { bytes: bytes.length }).ok, light: bytes.length < 60 * 1024 }).toEqual({ src: ref.src, ok: true, light: true });
      expect({ src: ref.src, size: [film.w, film.h], fr: film.fr }).toEqual({ src: ref.src, size: DIMENSIONS[domain], fr: 30 });
      const seconds = (film.op - film.ip) / film.fr;
      expect({ src: ref.src, loop: seconds >= 4 && seconds <= 16, moves: JSON.stringify(film.layers).includes('"a":1') }).toEqual({ src: ref.src, loop: true, moves: true });
    });
  });

  it('aucune clé saisonnière n’est reprise dans sa table de noms (fonds et bannières partagent la leur)', () => {
    const own = new Set(seasonal.map(({ pack }) => pack.slug));
    const keysOf = (domains: readonly Domain[], mine: boolean) =>
      domains.flatMap((domain) => packsOf(domain).filter((pack) => own.has(pack.slug) === mine).flatMap((pack) => itemsOf(domain, pack).map((item) => item.key)));
    [['wallpaper', 'banner'], ['avatar-ring'], ['banner-frame']].forEach((domains) => {
      const keys = keysOf(domains as Domain[], true);
      const elsewhere = keysOf(domains as Domain[], false);
      expect({ domains, duplicates: keys.filter((key, index) => keys.indexOf(key) !== index || elsewhere.includes(key)) }).toEqual({ domains, duplicates: [] });
    });
  });

  it.each(PACK_LANGUAGES.map((lang) => [lang] as const))('%s nomme chaque pack saisonnier et chacun de ses objets', (lang) => {
    const table = strings[lang]!;
    seasonal.forEach(({ domain, pack }) => {
      expect({ slug: pack.slug, named: (table.packs[pack.slug]?.description.length ?? 0) > 20 }).toEqual({ slug: pack.slug, named: true });
      itemsOf(domain, pack).forEach((item) => expect({ key: item.key, named: (table[TABLE[domain]][item.key]?.length ?? 0) > 0 }).toEqual({ key: item.key, named: true }));
    });
  });
});

describe('la place des offres dans les sources', () => {
  it('les nouveaux packs ferment chaque source, APRÈS les collections Meeshy, et leur rang suit tous les autres', () => {
    DOMAINS.forEach((domain) => {
      const packs = packsOf(domain);
      const own = packs.filter((pack) => SEASONAL_SOURCES.added.includes(pack.slug));
      if (own.length === 0) return;
      expect(packs.slice(-own.length).map((pack) => pack.slug)).toEqual(own.map((pack) => pack.slug));
      const lastMeeshy = packs.map((pack) => pack.slug).filter((slug) => MEESHY_COLLECTION_SLUGS.includes(slug)).length;
      const others = packs.filter((pack) => !SEASONAL_SOURCES.added.includes(pack.slug)).map((pack) => pack.order);
      expect(own.map((pack) => pack.order)).toEqual(own.map((_, index) => Math.max(...others) + 1 + index));
      expect(lastMeeshy === 0 || packs.findIndex((pack) => MEESHY_COLLECTION_SLUGS.includes(pack.slug)) < packs.length - own.length).toBe(true);
    });
  });

  it('les sources sont celles que le compositeur rend, et le rejouer ne change pas un octet', () => {
    DOMAINS.forEach((domain) => {
      const expected = JSON.parse(JSON.stringify(seasonalPacks(domain, packsOf(domain)))) as readonly Pack[];
      expect(expected.map((pack) => find(pack.slug)?.pack)).toEqual(expected);
      expect(upsertPacks(text(SOURCES[domain].file), expected)).toBe(text(SOURCES[domain].file));
    });
  });
});
