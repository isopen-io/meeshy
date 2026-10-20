import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACK_LANGUAGES } from '../types/content-pack';
import { APPEARANCE_LIMITS, AppearancePackContractSchema, isDiscreetPattern, parseAppearanceDesign, parseAppearancePackContract, patternInkOpacity } from '../types/appearance-design';
import { AvatarRingPackContractSchema, parseAvatarRingDesign, parseAvatarRingPackContract } from '../types/avatar-ring-design';
import { canUseFrame } from '../types/frame-usage';
import { parsePackIndex } from '../types/content-pack-index';
import { GAMUT_KEYS } from '../design/appearance/gamut';
import { validateLottie } from '../utils/lottie-validate';

const DIR = join(__dirname, '../design/appearance');
const read = (file: string): unknown => JSON.parse(readFileSync(join(DIR, file), 'utf8')) as unknown;

type PackFile = { readonly packs: readonly { readonly slug: string; readonly order: number; readonly installedByDefault: boolean; readonly removable: boolean; readonly usage?: unknown; readonly designs?: readonly unknown[]; readonly rings?: readonly unknown[] }[] };
const wallpapers = read('wallpapers/designs.json') as PackFile;
const banners = read('banners/designs.json') as PackFile;
const rings = read('avatar-rings/rings.json') as PackFile;
const frames = read('banner-frames/frames.json') as PackFile;

const wallpaperDesigns = wallpapers.packs.flatMap((pack) => pack.designs ?? []);
const bannerKeys = banners.packs.flatMap((pack) => pack.designs ?? []).map((design) => (design as { key: string }).key);

describe('le catalogue des 15 modèles de fond (#10632, #10638, § 6)', () => {
  it('compte cinq packs builtin et 15 modèles que le contrat lit tous', () => {
    expect(wallpapers.packs.map((pack) => pack.slug)).toEqual(['essentiels', 'heritages', 'nature-et-ciel', 'illustrations', 'animes']);
    expect(wallpaperDesigns).toHaveLength(15);
    wallpapers.packs.forEach((pack) => {
      const contract = parseAppearancePackContract({ domain: 'wallpaper', designs: pack.designs });
      expect(contract?.designs).toHaveLength(pack.designs?.length ?? -1);
    });
  });

  it('ne réutilise aucune clé, ni dans un pack, ni entre les packs de fonds', () => {
    const keys = wallpaperDesigns.map((design) => (design as { key: string }).key);
    expect(new Set(keys).size).toBe(15);
  });

  it('installe « Essentiels » d’office et le garde ; les quatre autres se retirent', () => {
    expect(wallpapers.packs.map((pack) => [pack.installedByDefault, pack.removable])).toEqual([
      [true, false],
      [false, true],
      [false, true],
      [false, true],
      [true, true],
    ]);
  });

  it('couvre les trois styles', () => {
    const styles = new Set(wallpaperDesigns.map((design) => parseAppearanceDesign(design)?.style));
    expect(styles).toEqual(new Set(['pattern', 'illustration', 'gradient']));
  });

  it('tient le plafond d’opacité : tout motif reste discret (12 % d’encre)', () => {
    const patterns = wallpaperDesigns.map((design) => parseAppearanceDesign(design)).filter((design) => design?.style === 'pattern');
    expect(patterns).toHaveLength(10);
    patterns.forEach((design) => expect(isDiscreetPattern(design!)).toBe(true));
    expect(Math.max(...patterns.map((design) => patternInkOpacity(design!)))).toBeLessThanOrEqual(0.12);
  });

  it('refuse un motif trop dense, un chemin injecté et un bloc de forme qui ne correspond pas au style', () => {
    const [monogramme] = wallpaperDesigns as { tile: { paths: { opacity: number; d: string }[] } }[];
    const dense = structuredClone(monogramme);
    dense.tile.paths[0]!.opacity = 0.4;
    expect(parseAppearanceDesign(dense)).toBeNull();
    expect(parseAppearancePackContract({ domain: 'wallpaper', designs: [dense] })).toBeNull();
    expect(parseAppearancePackContract({ domain: 'banner', designs: [dense] })).toBeNull();
    const atCap = structuredClone(monogramme);
    atCap.tile.paths[0]!.opacity = 0.12;
    expect(parseAppearanceDesign(atCap)).not.toBeNull();
    const injected = structuredClone(monogramme);
    injected.tile.paths[0]!.d = 'M0 0 L1 1"/><script>';
    expect(parseAppearanceDesign(injected)).toBeNull();
    expect(parseAppearanceDesign({ ...(monogramme as object), style: 'illustration' })).toBeNull();
    expect(parseAppearanceDesign({ ...(monogramme as object), palettes: { light: { base: '#fff', ink: '#000', soft: '#eee' }, dark: {} } })).toBeNull();
  });

  it('refuse un contrat de pack à clés dupliquées', () => {
    const [first] = wallpaperDesigns;
    expect(AppearancePackContractSchema.safeParse({ domain: 'wallpaper', designs: [first, first] }).success).toBe(false);
  });
});

describe('les 6 bannières et les 6 contours (#10632, § 6)', () => {
  it('six bannières que le contrat de bannière lit toutes', () => {
    const [pack] = banners.packs;
    expect(pack?.slug).toBe('bannieres-essentielles');
    expect(pack?.designs).toHaveLength(6);
    expect(parseAppearancePackContract({ domain: 'banner', designs: pack?.designs })?.designs).toHaveLength(6);
  });

  it('chaque bannière a son PROPRE dessin (#11165) : « Aurore » et « Aurore vive » ne se confondent plus, même image fixe', () => {
    const drawing = (design: unknown) => {
      const { key: _key, lottie: _lottie, ...rest } = design as { key: string; lottie?: unknown };
      return JSON.stringify(rest);
    };
    const drawings = banners.packs.flatMap((pack) => pack.designs ?? []).map(drawing);
    expect(new Set(drawings).size).toBe(drawings.length);
  });

  it('une bannière à motif se VOIT (#11165) : son encre dépasse le plafond discret d’un fond, sans le plafond de bannière', () => {
    const patterns = banners.packs.flatMap((pack) => pack.designs ?? []).map((design) => parseAppearanceDesign(design, 'banner')).filter((design) => design?.style === 'pattern');
    expect(patterns).toHaveLength(4);
    patterns.forEach((design) => {
      expect(patternInkOpacity(design!)).toBeGreaterThan(APPEARANCE_LIMITS.maxPatternOpacity);
      expect(isDiscreetPattern(design!, 'banner')).toBe(true);
    });
  });

  it('le plafond d’encre dépend de la SURFACE : 12 % sous un fil, 32 % sur une bannière, refus au-delà', () => {
    const [monogramme] = wallpaperDesigns as { tile: { paths: { opacity: number }[] } }[];
    const marked = structuredClone(monogramme);
    marked.tile.paths.forEach((path) => { path.opacity = 0.3; });
    expect(parseAppearanceDesign(marked)).toBeNull();
    expect(parseAppearanceDesign(marked, 'banner')).not.toBeNull();
    expect(parseAppearancePackContract({ domain: 'wallpaper', designs: [marked] })).toBeNull();
    expect(parseAppearancePackContract({ domain: 'banner', designs: [marked] })).not.toBeNull();
    const loud = structuredClone(monogramme);
    loud.tile.paths[0]!.opacity = 0.4;
    expect(parseAppearanceDesign(loud, 'banner')).toBeNull();
    expect(parseAppearancePackContract({ domain: 'banner', designs: [loud] })).toBeNull();
  });

  it('les six contours se lisent, aux clés uniques, et le contrat refuse un index de couleur hors palette', () => {
    const [pack] = rings.packs;
    expect(pack?.slug).toBe('contours-essentiels');
    const contract = parseAvatarRingPackContract({ domain: 'avatar-ring', rings: pack?.rings });
    expect(contract?.rings.map((ring) => ring.key)).toEqual(['filet', 'double-filet', 'perle', 'aurore', 'deco', 'laurier']);
    const laurier = structuredClone(pack?.rings?.[5]) as { ornament: { paths: { color: number }[] } };
    laurier.ornament.paths[0]!.color = 2;
    expect(parseAvatarRingDesign(laurier)).toBeNull();
    expect(AvatarRingPackContractSchema.safeParse({ domain: 'avatar-ring', rings: [pack?.rings?.[0], pack?.rings?.[0]] }).success).toBe(false);
  });

  it('le registre du pack de contours est lisible et ne sert que l’avatar', () => {
    const [pack] = rings.packs;
    const asset = (prefix: string, ext = 'webp') => ({ src: `${prefix}.${ext}`, bytes: 10, sha256: prefix.padEnd(64, '0') });
    const { entries } = parsePackIndex([
      { slug: pack?.slug, domain: 'avatar-ring', origin: 'builtin', version: 1, order: 0, installedByDefault: true, removable: false, hidden: false, contractSchema: 1, cover: asset('a1b2c3d4e5f60718'), preview: null, contract: asset('c1b2c3d4e5f60718', 'json'), strings: {}, downloadBytes: { story: 0, square: null }, names: { fr: { name: 'Contours', description: 'Six contours.' } }, usage: pack?.usage },
    ]);
    expect(entries).toHaveLength(1);
    expect(canUseFrame(entries[0]!.usage!, { kind: 'avatar' })).toBe(true);
    expect(canUseFrame(entries[0]!.usage!, { kind: 'call' })).toBe(false);
  });
});

describe('les noms en sept langues', () => {
  const keysOf = (lang: string) => read(`strings/${lang}.json`) as { packs: object; designs: object; rings: object; frames: object; gamut: object; modes: object; avatarUsage: string };
  const itemKeys = (file: PackFile, field: 'rings' | 'frames') => file.packs.flatMap((pack) => ((pack as Record<string, unknown>)[field] as { key: string }[] | undefined) ?? []).map((item) => item.key).sort();

  it.each(PACK_LANGUAGES.map((lang) => [lang] as const))('%s nomme chaque pack, modèle, contour, cadre de bannière et couleur', (lang) => {
    const strings = keysOf(lang);
    expect(Object.keys(strings.designs).sort()).toEqual([...new Set([...wallpaperDesigns.map((design) => (design as { key: string }).key), ...bannerKeys])].sort());
    expect(Object.keys(strings.rings).sort()).toEqual(itemKeys(rings, 'rings'));
    expect(Object.keys(strings.frames).sort()).toEqual(itemKeys(frames, 'frames'));
    expect(Object.values(strings.frames).every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
    expect(Object.keys(strings.gamut).sort()).toEqual([...GAMUT_KEYS].sort());
    expect(Object.keys(strings.packs).sort()).toEqual([...wallpapers.packs, ...banners.packs, ...rings.packs, ...frames.packs].map((pack) => pack.slug).sort());
    expect(Object.values(strings.designs).every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
  });
});

describe('les couches animées du catalogue (#10638)', () => {
  const animated = [...wallpapers.packs, ...banners.packs].flatMap((pack) => pack.designs ?? []).filter((design) => (design as { lottie?: unknown }).lottie !== undefined);
  const animatedRings = rings.packs.flatMap((pack) => pack.rings ?? []).filter((ring) => (ring as { lottie?: unknown }).lottie !== undefined);

  it('porte au moins un fond, une bannière et un contour animés, que les contrats lisent', () => {
    expect(animated.length).toBeGreaterThanOrEqual(2);
    expect(animatedRings.length).toBeGreaterThanOrEqual(1);
    animated.forEach((design) => expect(parseAppearanceDesign(design)).not.toBeNull());
    animatedRings.forEach((ring) => expect(parseAvatarRingDesign(ring)).not.toBeNull());
  });

  it('chaque couche désigne un fichier adressé par contenu, valide et sous le plafond', () => {
    [...animated, ...animatedRings].forEach((item) => {
      const ref = (item as { lottie: { src: string; bytes: number; sha256: string } }).lottie;
      const bytes = readFileSync(join(DIR, 'lottie', ref.src));
      expect(bytes.length).toBe(ref.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(ref.sha256);
      expect(validateLottie(JSON.parse(bytes.toString('utf8')) as unknown, { bytes: bytes.length }).ok).toBe(true);
    });
  });
});
