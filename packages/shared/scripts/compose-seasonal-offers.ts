/**
 * Compose les OFFRES SAISONNIÈRES de la boutique (#16270, #16271) en données pures :
 *
 *   cd packages/shared && bun scripts/compose-seasonal-offers.ts
 *
 * - Noël complété : un pack d'images de bannière (trois fixes, trois animées) et la paire FIXE des contours et
 *   des cadres de bannière de Noël ;
 * - le Nouvel An : contours d'avatar, images de bannière, cadres de bannière et fonds de conversation, chacun en
 *   pack statique et en pack animé, sur quatre thèmes (feux d'artifice, confettis, minuit, champagne doré).
 *
 * Chaque film est adressé par contenu dans `design/appearance/lottie/<sha16>.json` (`validateLottie`,
 * `MAX_FILM_BYTES`, 30 i/s) ; chaque objet passe le schéma de sa surface. Les packs se posent À LA FIN de leur
 * source, après les collections Meeshy, remplacés à leur place s'ils y sont déjà : rien de ce qui les précède ne
 * bouge d'un octet. Ils portent la fenêtre de leur offre (`seasonal/slugs.ts`), ne s'installent pas d'office et se
 * retirent. Les packs de Noël antérieurs reçoivent la leur de leur propre compositeur (`compose-assorted-banners.ts`).
 * Ensuite : la passerelle (`services/gateway/scripts/generate-appearance-packs.ts`) et les copies iOS et Android
 * (`sync-appearance-catalog-{ios,android}.ts`). Idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAppearanceDesign } from '../types/appearance-design.js';
import { parseAvatarRingDesign } from '../types/avatar-ring-design.js';
import { parseBannerFrameDesign } from '../types/banner-frame-design.js';
import { renderFilm } from './compose-illustrated-ring-lotties.js';
import { REACH } from './illustrated-rings/kit.js';
import { upsertPacks } from './meeshy-collections/source-packs.js';
import { CHRISTMAS_SOURCES, LANGUAGES, NEW_YEAR_SOURCES, type SeasonalSource } from './seasonal/packs.js';
import { SEASONAL_ADDED_SLUGS, availabilityOf } from './seasonal/slugs.js';

type Write = (src: string, bytes: Buffer) => void;
type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type SourcePack = { readonly slug: string; readonly order: number };
export type SeasonalDomain = SeasonalSource['domain'];

/** Les sources de l'offre, dans l'ordre où elles ferment leur fichier : Noël, puis le Nouvel An. */
export const SEASONAL_SOURCES = { christmas: CHRISTMAS_SOURCES, newYear: NEW_YEAR_SOURCES, added: SEASONAL_ADDED_SLUGS } as const;
const ALL: readonly SeasonalSource[] = [...CHRISTMAS_SOURCES, ...NEW_YEAR_SOURCES];

if (ALL.map((source) => source.slug).join() !== SEASONAL_ADDED_SLUGS.join()) throw new Error('les sources de l’offre saisonnière et `SEASONAL_ADDED_SLUGS` divergent');

const film = (build: () => unknown, label: string, write: Write): Ref => {
  const { bytes, ref } = renderFilm(build, label);
  write(ref.src, bytes);
  return ref;
};

const checked = <T extends { readonly key: string }>(item: T, ok: (item: T) => boolean): T => {
  if (!ok(item)) throw new Error(`${item.key} : l'objet ne passe pas le schéma de sa surface`);
  return item;
};

function itemsOf(source: SeasonalSource, write: Write): { readonly field: 'rings' | 'designs' | 'frames'; readonly items: readonly unknown[] } {
  if (source.domain === 'avatar-ring') {
    const stills = source.stills.map(({ names: _names, ...ring }) => checked(ring, (candidate) => parseAvatarRingDesign(candidate) !== null));
    const animated = source.animated.map((frame) => {
      const side = (name: 'back' | 'front') => {
        const build = frame[name];
        return build === undefined ? {} : { [name]: film(build, `${frame.key}/${name}`, write) };
      };
      return checked({ key: frame.key, ...frame.still, decor: { reach: REACH, ...side('back'), ...side('front') } }, (candidate) => parseAvatarRingDesign(candidate) !== null);
    });
    return { field: 'rings', items: [...stills, ...animated] };
  }
  if (source.domain === 'banner-frame') {
    return { field: 'frames', items: source.frames.map(({ names: _names, ...frame }) => checked(frame, (candidate) => parseBannerFrameDesign(candidate) !== null)) };
  }
  const surface = source.domain;
  return {
    field: 'designs',
    items: source.items.map(({ design, film: build }) => {
      const served = build === undefined ? design : { ...design, lottie: film(build, design.key, write) };
      return checked(served, (candidate) => parseAppearanceDesign(candidate, surface) !== null);
    }),
  };
}

const USAGE: Readonly<Partial<Record<SeasonalDomain, { readonly kind: 'free'; readonly surfaces: readonly string[] }>>> = {
  'avatar-ring': { kind: 'free', surfaces: ['avatar'] },
  'banner-frame': { kind: 'free', surfaces: ['banner'] },
};

/** Les packs de l'offre pour une source : rangés après TOUS les autres packs, dans l'ordre déclaré. */
export function seasonalPacks(domain: SeasonalDomain, existing: readonly SourcePack[], write: Write = () => undefined) {
  const after = Math.max(...existing.filter((pack) => !SEASONAL_ADDED_SLUGS.includes(pack.slug)).map((pack) => pack.order));
  return ALL.filter((source) => source.domain === domain).map((source, index) => {
    const { field, items } = itemsOf(source, write);
    const usage = USAGE[domain];
    return {
      slug: source.slug,
      order: after + 1 + index,
      installedByDefault: false,
      removable: true,
      ...(usage === undefined ? {} : { usage }),
      availability: availabilityOf(source.slug),
      [field]: items,
    };
  });
}

const FILES: Readonly<Record<SeasonalDomain, string>> = {
  'avatar-ring': 'avatar-rings/rings.json',
  wallpaper: 'wallpapers/designs.json',
  banner: 'banners/designs.json',
  'banner-frame': 'banner-frames/frames.json',
};

const TABLES: Readonly<Record<SeasonalDomain, 'rings' | 'designs' | 'frames'>> = { 'avatar-ring': 'rings', wallpaper: 'designs', banner: 'designs', 'banner-frame': 'frames' };

const namedItems = (source: SeasonalSource): readonly { readonly key: string; readonly names: Readonly<Record<string, string>> }[] => {
  if (source.domain === 'avatar-ring') return [...source.stills, ...source.animated];
  if (source.domain === 'banner-frame') return source.frames;
  return source.items.map((item) => ({ key: item.design.key, names: item.names }));
};

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const design = resolve(dirname(fileURLToPath(import.meta.url)), '../design/appearance');
  const write: Write = (src, bytes) => writeFileSync(join(design, 'lottie', src), bytes);
  for (const [domain, file] of Object.entries(FILES) as [SeasonalDomain, string][]) {
    const path = join(design, file);
    const text = readFileSync(path, 'utf8');
    writeFileSync(path, upsertPacks(text, seasonalPacks(domain, (JSON.parse(text) as { packs: readonly SourcePack[] }).packs, write)));
  }
  for (const language of LANGUAGES) {
    const stringsPath = join(design, `strings/${language}.json`);
    const strings = JSON.parse(readFileSync(stringsPath, 'utf8')) as { packs: Record<string, unknown> } & Record<'rings' | 'designs' | 'frames', Record<string, string>>;
    for (const source of ALL) {
      strings.packs[source.slug] = source.names[language];
      for (const item of namedItems(source)) strings[TABLES[source.domain]][item.key] = item.names[language]!;
    }
    writeFileSync(stringsPath, `${JSON.stringify(strings, null, 2)}\n`);
  }
  process.stdout.write(`${SEASONAL_ADDED_SLUGS.join(', ')} écrits\n`);
}
