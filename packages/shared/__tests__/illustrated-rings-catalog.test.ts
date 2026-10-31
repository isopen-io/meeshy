import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../types/content-pack';
import { RING_AVATAR_RADIUS, parseAvatarRingPackContract } from '../types/avatar-ring-design';
import { validateLottie } from '../utils/lottie-validate';
import { ringsOf } from '../scripts/compose-illustrated-ring-lotties';
import { ILLUSTRATED_PACKS } from '../scripts/illustrated-rings/packs';

/**
 * #13960 — les CADRES ILLUSTRÉS : un contour qui n'est plus un anneau seul, mais un anneau fixe de
 * repli et deux films qui débordent, l'un derrière l'avatar, l'autre au-dessus.
 */
const DIR = join(__dirname, '../design/appearance');
const read = (file: string): unknown => JSON.parse(readFileSync(join(DIR, file), 'utf8')) as unknown;

type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type Ring = { readonly key: string; readonly lottie?: Ref; readonly decor?: { readonly reach: number; readonly back?: Ref; readonly front?: Ref } };
type Pack = { readonly slug: string; readonly order: number; readonly installedByDefault: boolean; readonly removable: boolean; readonly rings: readonly Ring[] };
const packs = (read('avatar-rings/rings.json') as { packs: readonly Pack[] }).packs;

const VITRINE = ['masque-felin', 'toile-araignee', 'ailes-ange', 'cercle-runique', 'griffes-os', 'ailes-demon'] as const;
const FRENCH: Readonly<Record<string, string>> = {
  'masque-felin': 'Masque félin',
  'toile-araignee': 'Toile d’araignée',
  'ailes-ange': 'Ailes d’ange',
  'cercle-runique': 'Cercle runique',
  'griffes-os': 'Griffes d’os',
  'ailes-demon': 'Ailes de démon',
};

type Film = { readonly fr: number; readonly ip: number; readonly op: number; readonly w: number; readonly h: number };
const filmOf = (ref: Ref): { readonly film: Film; readonly bytes: Buffer } => {
  const bytes = readFileSync(join(DIR, 'lottie', ref.src));
  return { film: JSON.parse(bytes.toString('utf8')) as Film, bytes };
};

describe('la vitrine des cadres illustrés (#13960)', () => {
  const pack = packs.find((candidate) => candidate.slug === 'cadres-illustres');

  it('un pack installé d’office et retirable, après tous les autres, qui porte six cadres que le contrat lit tous', () => {
    expect(pack?.rings.map((ring) => ring.key)).toEqual([...VITRINE]);
    expect(pack?.installedByDefault).toBe(true);
    expect(pack?.removable).toBe(true);
    expect(pack?.order).toBe(Math.max(...packs.map((candidate) => candidate.order)));
    expect(parseAvatarRingPackContract({ domain: 'avatar-ring', rings: pack?.rings })?.rings).toHaveLength(VITRINE.length);
  });

  it('chaque cadre déborde du contour par un film arrière ET un film avant, distincts de toute autre couche du catalogue', () => {
    const rings = pack?.rings ?? [];
    rings.forEach((ring) => {
      expect({ key: ring.key, reach: ring.decor?.reach }).toEqual({ key: ring.key, reach: 1.4 });
      expect({ key: ring.key, both: ring.decor?.back !== undefined && ring.decor?.front !== undefined }).toEqual({ key: ring.key, both: true });
      expect(ring.lottie).toBeUndefined();
    });
    const everyLayer = packs.flatMap((candidate) => candidate.rings).flatMap((ring) => [ring.lottie, ring.decor?.back, ring.decor?.front]).flatMap((ref) => (ref === undefined ? [] : [ref.src]));
    expect(new Set(everyLayer).size).toBe(everyLayer.length);
  });

  it('chaque film est un Lottie valide, carré, adressé par son contenu, de moins de 60 Ko, à 30 images par seconde, en boucle de 4 à 16 secondes', () => {
    (pack?.rings ?? []).flatMap((ring) => [ring.decor?.back, ring.decor?.front]).forEach((ref) => {
      const { film, bytes } = filmOf(ref!);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref!.sha256);
      expect(bytes.length).toBe(ref!.bytes);
      expect(validateLottie(film, { bytes: bytes.length }).ok).toBe(true);
      expect({ src: ref!.src, light: bytes.length < 60 * 1024 }).toEqual({ src: ref!.src, light: true });
      expect(film.w).toBe(film.h);
      expect(film.w).toBe(140);
      expect(film.fr).toBe(30);
      const seconds = (film.op - film.ip) / film.fr;
      expect({ src: ref!.src, loop: seconds >= 4 && seconds <= 16 }).toEqual({ src: ref!.src, loop: true });
    });
  });

  it('l’anneau fixe de repli tient dans la boîte du contour, autour de l’avatar', () => {
    const contract = parseAvatarRingPackContract({ domain: 'avatar-ring', rings: pack?.rings });
    contract?.rings.forEach((ring) => {
      expect({ key: ring.key, ornament: (ring.ornament?.paths.length ?? 0) >= 3 }).toEqual({ key: ring.key, ornament: true });
      expect(RING_AVATAR_RADIUS).toBe(42);
    });
  });

  it('la source est celle que le compositeur rend : aucun cadre n’est retouché à la main', () => {
    ILLUSTRATED_PACKS.forEach((illustrated) => {
      expect(packs.find((candidate) => candidate.slug === illustrated.slug)?.rings).toEqual(ringsOf(illustrated));
    });
  });

  it.each(PACK_LANGUAGES.map((lang) => [lang] as const))('%s nomme le pack et ses six cadres', (lang) => {
    const strings = read(`strings/${lang}.json`) as { packs: Record<string, { name: string; description: string }>; rings: Record<string, string> };
    expect(strings.packs['cadres-illustres']?.name.length).toBeGreaterThan(0);
    expect(strings.packs['cadres-illustres']?.description.length).toBeGreaterThan(0);
    VITRINE.forEach((key) => {
      expect({ key, named: (strings.rings[key]?.length ?? 0) > 0 }).toEqual({ key, named: true });
      if (lang === 'fr') expect(strings.rings[key]).toBe(FRENCH[key]);
    });
  });
});
