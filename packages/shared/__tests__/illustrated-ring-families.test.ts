import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../types/content-pack';
import { parseAvatarRingPackContract } from '../types/avatar-ring-design';
import { validateLottie } from '../utils/lottie-validate';
import { ringsOf } from '../scripts/compose-illustrated-ring-lotties';
import { ILLUSTRATED_PACKS } from '../scripts/illustrated-rings/packs';

/**
 * #13960 — les FAMILLES CULTURELLES de cadres illustrés, une issue chacune : un pack installé d'office
 * et retirable par famille, de trois à quatre cadres qui débordent de l'avatar par un film arrière et un
 * film avant, nommés dans les sept langues.
 */
const DIR = join(__dirname, '../design/appearance');
const read = (file: string): unknown => JSON.parse(readFileSync(join(DIR, file), 'utf8')) as unknown;

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type Ring = { readonly key: string; readonly lottie?: Ref; readonly decor?: { readonly reach: number; readonly back?: Ref; readonly front?: Ref } };
type Pack = {
  readonly slug: string;
  readonly order: number;
  readonly installedByDefault: boolean;
  readonly removable: boolean;
  readonly usage?: { readonly kind: string; readonly surfaces: readonly string[] };
  readonly rings: readonly Ring[];
};
type Strings = { readonly packs: Record<string, { readonly name: string; readonly description: string }>; readonly rings: Record<string, string> };
type Film = { readonly fr: number; readonly ip: number; readonly op: number; readonly w: number; readonly h: number };

const packs = (read('avatar-rings/rings.json') as { packs: readonly Pack[] }).packs;

const FAMILIES = [
  { slug: 'cadres-asiatiques', order: 10, issue: 13962 },
  { slug: 'cadres-africains', order: 11, issue: 13963 },
  { slug: 'cadres-celtes', order: 12, issue: 13964 },
  { slug: 'cadres-nordiques', order: 13, issue: 13965 },
  { slug: 'cadres-egyptiens', order: 14, issue: 13966 },
  { slug: 'cadres-mayas', order: 15, issue: 13967 },
  { slug: 'cadres-indiens', order: 16, issue: 13968 },
  { slug: 'cadres-amerindiens', order: 17, issue: 13969 },
  { slug: 'cadres-australs', order: 18, issue: 13970 },
] as const;

const filmOf = (ref: Ref): { readonly film: Film; readonly bytes: Buffer } => {
  const bytes = readFileSync(join(DIR, 'lottie', ref.src));
  return { film: JSON.parse(bytes.toString('utf8')) as Film, bytes };
};

describe('les familles culturelles de cadres illustrés (#13960)', () => {
  it('suivent la vitrine dans l’ordre de la boutique, une par famille, et le compositeur les rend toutes', () => {
    expect(ILLUSTRATED_PACKS.map((pack) => pack.slug)).toEqual(['cadres-illustres', ...FAMILIES.map((family) => family.slug)]);
    const illustrated = packs.filter((pack) => pack.order >= 9);
    expect(illustrated.map((pack) => pack.slug)).toEqual(['cadres-illustres', ...FAMILIES.map((family) => family.slug)]);
    expect(illustrated.map((pack) => pack.order)).toEqual([9, ...FAMILIES.map((family) => family.order)]);
  });

  it('aucun film n’est partagé entre deux cadres, ni avec une autre couche du catalogue', () => {
    const everyLayer = packs.flatMap((pack) => pack.rings).flatMap((ring) => [ring.lottie, ring.decor?.back, ring.decor?.front]).flatMap((ref) => (ref === undefined ? [] : [ref.src]));
    expect(new Set(everyLayer).size).toBe(everyLayer.length);
    const keys = packs.flatMap((pack) => pack.rings.map((ring) => ring.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe.each(FAMILIES)('la famille $slug (#$issue)', ({ slug, order }) => {
    const pack = packs.find((candidate) => candidate.slug === slug);
    const source = ILLUSTRATED_PACKS.find((candidate) => candidate.slug === slug);

    it('un pack installé d’office, retirable, libre sur l’avatar, de trois à quatre cadres que le contrat lit tous', () => {
      expect(pack?.order).toBe(order);
      expect(pack?.installedByDefault).toBe(true);
      expect(pack?.removable).toBe(true);
      expect(pack?.usage).toEqual({ kind: 'free', surfaces: ['avatar'] });
      const count = pack?.rings.length ?? 0;
      expect({ slug, frames: count >= 3 && count <= 4 }).toEqual({ slug, frames: true });
      expect(parseAvatarRingPackContract({ domain: 'avatar-ring', rings: pack?.rings })?.rings).toHaveLength(count);
    });

    it('chaque cadre déborde par un film ARRIÈRE et un film AVANT, et garde un anneau fixe de repli', () => {
      (pack?.rings ?? []).forEach((ring) => {
        expect({ key: ring.key, reach: ring.decor?.reach }).toEqual({ key: ring.key, reach: 1.4 });
        expect({ key: ring.key, back: ring.decor?.back !== undefined, front: ring.decor?.front !== undefined }).toEqual({ key: ring.key, back: true, front: true });
        expect(ring.lottie).toBeUndefined();
      });
      parseAvatarRingPackContract({ domain: 'avatar-ring', rings: pack?.rings })?.rings.forEach((ring) => {
        expect({ key: ring.key, ornament: (ring.ornament?.paths.length ?? 0) >= 3 }).toEqual({ key: ring.key, ornament: true });
      });
    });

    it('chaque film est un Lottie valide, carré de 140, adressé par son contenu, de moins de 60 Ko, à 30 i/s, en boucle de 4 à 16 secondes', () => {
      (pack?.rings ?? []).flatMap((ring) => [ring.decor?.back, ring.decor?.front]).forEach((ref) => {
        const { film, bytes } = filmOf(ref!);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref!.sha256);
        expect(bytes.length).toBe(ref!.bytes);
        expect(validateLottie(film, { bytes: bytes.length }).ok).toBe(true);
        expect({ src: ref!.src, light: bytes.length < 60 * 1024 }).toEqual({ src: ref!.src, light: true });
        expect([film.w, film.h, film.fr]).toEqual([140, 140, 30]);
        const seconds = (film.op - film.ip) / film.fr;
        expect({ src: ref!.src, loop: seconds >= 4 && seconds <= 16 }).toEqual({ src: ref!.src, loop: true });
      });
    });

    it('la source est celle que le compositeur rend : aucun cadre n’est retouché à la main', () => {
      expect(source).toBeDefined();
      expect(pack?.rings).toEqual(ringsOf(source!));
    });

    it.each(PACK_LANGUAGES.map((lang) => [lang] as const))('%s nomme le pack et chacun de ses cadres', (lang) => {
      const strings = read(`strings/${lang}.json`) as Strings;
      expect(strings.packs[slug]?.name.length ?? 0).toBeGreaterThan(0);
      expect(strings.packs[slug]?.description.length ?? 0).toBeGreaterThan(0);
      (pack?.rings ?? []).forEach((ring) => {
        expect({ key: ring.key, name: strings.rings[ring.key] }).toEqual({ key: ring.key, name: source?.frames.find((frame) => frame.key === ring.key)?.names[lang] });
        expect({ key: ring.key, named: (strings.rings[ring.key]?.length ?? 0) > 0 }).toEqual({ key: ring.key, named: true });
      });
      const names = (pack?.rings ?? []).map((ring) => strings.rings[ring.key]);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
