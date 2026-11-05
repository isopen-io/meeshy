import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../types/content-pack';
import { parseAvatarRingPackContract } from '../types/avatar-ring-design';
import { parseBannerFrameDesign, parseBannerFramePackContract } from '../types/banner-frame-design';
import { parseFrameMotions } from '../types/frame-decor';
import { parsePackIndex } from '../types/content-pack-index';
import { validateLottie } from '../utils/lottie-validate';
import { ringsOf } from '../scripts/compose-illustrated-ring-lotties';
import { ILLUSTRATED_PACKS } from '../scripts/illustrated-rings/packs';
import { ASSORTED_SLUGS, assortedBannerPacks, christmasRingPacks } from '../scripts/compose-assorted-banners';
import { ASSORTED_BANNER_PACKS } from '../scripts/assorted-banners/packs';
import { CHRISTMAS_RING_PACKS } from '../scripts/christmas/packs';
import { MEESHY_COLLECTION_SLUGS } from '../scripts/compose-meeshy-collections';
import { upsertPacks } from '../scripts/meeshy-collections/source-packs';
import { SEASONAL_ADDED_SLUGS } from '../scripts/seasonal/slugs';

/**
 * #15553 — chaque décoration d'avatar illustrée a sa BANNIÈRE ASSORTIE (même motif, même palette, même nom
 * de pack), et la boutique propose des packs de NOËL animés, avatar et bannière.
 */
const DIR = join(__dirname, '../design/appearance');
const text = (file: string): string => readFileSync(join(DIR, file), 'utf8');
const read = (file: string): unknown => JSON.parse(text(file)) as unknown;

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type Path = { readonly d: string; readonly group?: string };
type Frame = {
  readonly key: string;
  readonly palette: readonly string[];
  readonly border: { readonly width: number };
  readonly reach: { readonly corner: number; readonly cartouche?: { readonly edge: string } };
  readonly pieces?: readonly { readonly paths: readonly Path[] }[];
  readonly friezes?: readonly { readonly paths: readonly Path[] }[];
  readonly motion?: unknown;
  readonly lottie?: unknown;
};
type Ring = { readonly key: string; readonly stroke: { readonly colors: readonly string[] }; readonly lottie?: Ref; readonly decor?: { readonly reach: number; readonly back?: Ref; readonly front?: Ref } };
type Pack<Item> = { readonly slug: string; readonly order: number; readonly installedByDefault: boolean; readonly removable: boolean; readonly usage?: unknown } & Record<'frames' | 'rings', readonly Item[]>;
type Strings = { readonly packs: Record<string, { readonly name: string; readonly description: string }>; readonly rings: Record<string, string>; readonly frames: Record<string, string> };

const ringPacks = (read('avatar-rings/rings.json') as { packs: readonly Pack<Ring>[] }).packs;
const framePacks = (read('banner-frames/frames.json') as { packs: readonly Pack<Frame>[] }).packs;
const strings = Object.fromEntries(PACK_LANGUAGES.map((lang) => [lang, read(`strings/${lang}.json`) as Strings]));

const AVATAR_PACKS = [...ILLUSTRATED_PACKS, ...CHRISTMAS_RING_PACKS];
const ringPack = (slug: string) => ringPacks.find((pack) => pack.slug === slug);
const framePack = (slug: string) => framePacks.find((pack) => pack.slug === slug);
const groupsOf = (frame: Frame): ReadonlySet<string> =>
  new Set([...(frame.pieces ?? []), ...(frame.friezes ?? [])].flatMap((part) => part.paths).flatMap((path) => (path.group === undefined ? [] : [path.group])));

describe('chaque décoration d’avatar illustrée a sa bannière assortie (#15553)', () => {
  it('un pack de bannière par pack d’avatar illustré ou de Noël, dans le même ordre, et aucun en trop', () => {
    expect(ASSORTED_BANNER_PACKS.map((pack) => pack.ringPack)).toEqual(AVATAR_PACKS.map((pack) => pack.slug));
    const slugs = ASSORTED_BANNER_PACKS.map((pack) => pack.slug);
    expect(new Set([...slugs, ...AVATAR_PACKS.map((pack) => pack.slug)]).size).toBe(slugs.length * 2);
  });

  describe.each(ASSORTED_BANNER_PACKS.map((pack) => [pack.slug, pack] as const))('%s', (slug, source) => {
    const banner = framePack(slug);
    const avatar = ringPack(source.ringPack);

    it('reprend un à un les motifs de son pendant d’avatar, sous les mêmes clés, dans la même palette', () => {
      expect(avatar).toBeDefined();
      expect(banner?.frames.map((frame) => frame.key)).toEqual(avatar?.rings.map((ring) => ring.key));
      banner?.frames.forEach((frame, index) => {
        expect({ key: frame.key, palette: frame.palette }).toEqual({ key: frame.key, palette: avatar?.rings[index]?.stroke.colors });
      });
    });

    it('est proposé par la boutique, retirable, libre sur la bannière, et le contrat lit chaque cadre', () => {
      expect(banner?.installedByDefault).toBe(false);
      expect(banner?.removable).toBe(true);
      expect(banner?.usage).toEqual({ kind: 'free', surfaces: ['banner'] });
      expect(parseBannerFramePackContract({ domain: 'banner-frame', frames: banner?.frames })?.frames).toHaveLength(banner?.frames.length ?? -1);
    });

    it('reste en bordure (aucun cartouche en bas) et s’anime par des mouvements déclarés dont chaque cible existe', () => {
      banner?.frames.forEach((frame) => {
        expect(parseBannerFrameDesign(frame)).not.toBeNull();
        expect({ key: frame.key, bottom: frame.reach.cartouche?.edge ?? 'top' }).toEqual({ key: frame.key, bottom: 'top' });
        expect(frame.lottie).toBeUndefined();
        const motions = parseFrameMotions(frame.motion);
        expect({ key: frame.key, animated: motions.length >= 1 }).toEqual({ key: frame.key, animated: true });
        const groups = groupsOf(frame);
        motions.flatMap((motion) => motion.targets).forEach((target) => expect({ key: frame.key, target, drawn: groups.has(target) }).toEqual({ key: frame.key, target, drawn: true }));
      });
    });

    it.each(PACK_LANGUAGES.map((lang) => [lang] as const))('%s : le même nom de pack que l’avatar, une description, et chaque cadre nommé comme son contour', (lang) => {
      const table = strings[lang]!;
      expect(table.packs[slug]?.name).toBe(table.packs[source.ringPack]?.name);
      expect((table.packs[slug]?.description ?? '').length).toBeGreaterThan(20);
      expect(table.packs[slug]?.description).not.toBe(table.packs[source.ringPack]?.description);
      banner?.frames.forEach((frame) => expect({ key: frame.key, name: table.frames[frame.key] }).toEqual({ key: frame.key, name: table.rings[frame.key] }));
    });
  });

  it('la source des cadres est celle que le compositeur rend, avant les collections Meeshy, et le rejouer ne change pas un octet', () => {
    const expected = JSON.parse(JSON.stringify(assortedBannerPacks(framePacks))) as readonly Pack<Frame>[];
    const served = framePacks.filter((pack) => ASSORTED_SLUGS.includes(pack.slug));
    expect(served).toEqual(expected);
    expect(framePacks.filter((pack) => !SEASONAL_ADDED_SLUGS.includes(pack.slug)).slice(-2).map((pack) => pack.slug)).toEqual(['meeshy-bordures', 'meeshy-bordures-vivantes']);
    expect(upsertPacks(text('banner-frames/frames.json'), expected)).toBe(text('banner-frames/frames.json'));
  });

  it('le registre des cadres sert chaque pack assorti, que l’index des packs accepte', () => {
    const registry = read('banner-frames/packs.json') as readonly { readonly slug: string; readonly origin: string; readonly price?: number }[];
    const served = registry.filter((entry) => ASSORTED_BANNER_PACKS.some((pack) => pack.slug === entry.slug));
    expect(served.map((entry) => entry.slug)).toEqual(ASSORTED_BANNER_PACKS.map((pack) => pack.slug));
    expect(served.every((entry) => entry.origin === 'builtin' && entry.price === undefined)).toBe(true);
    expect(parsePackIndex(served).rejected).toBe(0);
  });
});

describe('les packs de Noël (#15553)', () => {
  it('au moins trois, chacun un pack d’avatar ET son pack de bannière', () => {
    expect(CHRISTMAS_RING_PACKS.length).toBeGreaterThanOrEqual(3);
    CHRISTMAS_RING_PACKS.forEach((pack) => {
      expect(ringPack(pack.slug)).toBeDefined();
      expect(ASSORTED_BANNER_PACKS.filter((banner) => banner.ringPack === pack.slug)).toHaveLength(1);
    });
  });

  it.each(CHRISTMAS_RING_PACKS.map((pack) => [pack.slug, pack] as const))('%s : proposé par la boutique, des contours ANIMÉS par des films Lottie valides, légers et bouclés', (slug, source) => {
    const pack = ringPack(slug);
    expect(pack?.installedByDefault).toBe(false);
    expect(pack?.removable).toBe(true);
    expect(pack?.usage).toEqual({ kind: 'free', surfaces: ['avatar'] });
    expect(pack?.rings).toEqual(JSON.parse(JSON.stringify(ringsOf(source))));
    expect(parseAvatarRingPackContract({ domain: 'avatar-ring', rings: pack?.rings })?.rings).toHaveLength(pack?.rings.length ?? -1);
    const films = (pack?.rings ?? []).flatMap((ring) => [ring.decor?.back, ring.decor?.front]).flatMap((ref) => (ref === undefined ? [] : [ref]));
    expect(films.length).toBeGreaterThanOrEqual(pack?.rings.length ?? 99);
    films.forEach((ref) => {
      const bytes = readFileSync(join(DIR, 'lottie', ref.src));
      const film = JSON.parse(bytes.toString('utf8')) as { readonly fr: number; readonly ip: number; readonly op: number; readonly w: number; readonly h: number };
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.sha256);
      expect(bytes.length).toBe(ref.bytes);
      expect(validateLottie(film, { bytes: bytes.length }).ok).toBe(true);
      expect({ src: ref.src, light: bytes.length < 60 * 1024 }).toEqual({ src: ref.src, light: true });
      expect([film.w, film.h, film.fr]).toEqual([140, 140, 30]);
      const seconds = (film.op - film.ip) / film.fr;
      expect({ src: ref.src, loop: seconds >= 4 && seconds <= 16 }).toEqual({ src: ref.src, loop: true });
    });
  });

  it('la source des contours de Noël est celle que le compositeur rend, avant les collections Meeshy', () => {
    const served = ringPacks.filter((pack) => CHRISTMAS_RING_PACKS.some((source) => source.slug === pack.slug));
    expect(served).toEqual(JSON.parse(JSON.stringify(christmasRingPacks(ringPacks))));
    const firstMeeshy = ringPacks.findIndex((pack) => MEESHY_COLLECTION_SLUGS.includes(pack.slug));
    served.forEach((pack) => expect(ringPacks.indexOf(pack)).toBeLessThan(firstMeeshy));
  });

  it.each(PACK_LANGUAGES.map((lang) => [lang] as const))('%s nomme chaque pack de Noël et chacun de ses contours', (lang) => {
    const table = strings[lang]!;
    CHRISTMAS_RING_PACKS.forEach((pack) => {
      expect(table.packs[pack.slug]).toEqual(pack.names[lang]);
      expect(pack.names[lang].description.length).toBeGreaterThan(20);
      pack.frames.forEach((frame) => expect({ key: frame.key, name: table.rings[frame.key] }).toEqual({ key: frame.key, name: frame.names[lang] }));
    });
  });

  it('aucun film n’est partagé, et aucune clé de contour n’est réutilisée', () => {
    const rings = ringPacks.flatMap((pack) => pack.rings);
    const films = rings.flatMap((ring) => [ring.lottie, ring.decor?.back, ring.decor?.front]).flatMap((ref) => (ref === undefined ? [] : [ref.src]));
    expect(new Set(films).size).toBe(films.length);
    expect(new Set(rings.map((ring) => ring.key)).size).toBe(rings.length);
  });
});
