/**
 * Compose les COLLECTIONS MEESHY de la boutique (#15158) — contours d'avatar, fonds de conversation et
 * cadres de bannière, une collection FIXE et une ANIMÉE pour chacun — en données pures :
 *
 *   cd packages/shared && bun scripts/compose-meeshy-collections.ts
 *
 * Écrit chaque film adressé par contenu dans `design/appearance/lottie/<sha16>.json`, pose les packs de
 * `meeshy-collections/packs.ts` À LA FIN de leur source (remplacés à leur place s'ils y sont déjà, rien
 * d'autre ne bouge d'un octet) et leurs noms dans `design/appearance/strings/<langue>.json`. Chaque film
 * passe `validateLottie`, pèse moins de `MAX_FILM_BYTES` et boucle à 30 images par seconde ; chaque forme
 * fixe passe le schéma de sa surface. Ensuite : la passerelle (`services/gateway/scripts/generate-appearance-packs.ts`)
 * et les copies iOS et Android (`sync-appearance-catalog-{ios,android}.ts`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAppearanceDesign } from '../types/appearance-design.js';
import { parseAvatarRingDesign } from '../types/avatar-ring-design.js';
import { parseBannerFrameDesign } from '../types/banner-frame-design.js';
import { renderFilm } from './compose-illustrated-ring-lotties.js';
import { FRAMES_SIGNATURE, FRAMES_VIVANTS, LANGUAGES, RINGS_SIGNATURE, RINGS_VIVANTS, WALLPAPERS_SIGNATURE, WALLPAPERS_VIVANTS, type Collection } from './meeshy-collections/packs.js';
import { VIVANT_REACH } from './meeshy-collections/rings-vivants.js';
import { upsertPacks } from './meeshy-collections/source-packs.js';
import { SEASONAL_ADDED_SLUGS } from './seasonal/slugs.js';

type Write = (src: string, bytes: Buffer) => void;
type Ref = { readonly src: string; readonly bytes: number; readonly sha256: string };
type SourcePack = { readonly slug: string; readonly order: number };

const film = (build: () => unknown, label: string, write: Write): Ref => {
  const { bytes, ref } = renderFilm(build, label);
  write(ref.src, bytes);
  return ref;
};

const checked = <T>(item: T, parse: (input: unknown) => unknown, key: string): T => {
  if (parse(item) === null) throw new Error(`${key} : la forme fixe ne passe pas le schéma partagé`);
  return item;
};

export function signatureRings(): readonly unknown[] {
  return RINGS_SIGNATURE.items.map(({ names: _names, ...ring }) => checked(ring, parseAvatarRingDesign, ring.key));
}

export function vivantRings(write: Write = () => undefined): readonly unknown[] {
  return RINGS_VIVANTS.items.map(({ names: _names, back, front, ...still }) => {
    const decor = {
      reach: VIVANT_REACH,
      ...(back === undefined ? {} : { back: film(back, `${still.key}/back`, write) }),
      ...(front === undefined ? {} : { front: film(front, `${still.key}/front`, write) }),
    };
    return checked({ ...still, decor }, parseAvatarRingDesign, still.key);
  });
}

export function signatureWallpapers(): readonly unknown[] {
  return WALLPAPERS_SIGNATURE.items.map(({ names: _names, ...design }) => checked(design, (input) => parseAppearanceDesign(input, 'wallpaper'), design.key));
}

export function vivantWallpapers(write: Write = () => undefined): readonly unknown[] {
  return WALLPAPERS_VIVANTS.items.map(({ names: _names, film: build, ...design }) =>
    checked({ ...design, lottie: film(build, design.key, write) }, (input) => parseAppearanceDesign(input, 'wallpaper'), design.key),
  );
}

export function signatureFrames(collection: Collection<unknown> = FRAMES_SIGNATURE): readonly unknown[] {
  return collection.items.map((item) => {
    const { names: _names, ...frame } = item as { readonly names: unknown; readonly key: string };
    return checked(frame, parseBannerFrameDesign, frame.key);
  });
}

/** Les collections de chaque source, dans leur ordre de boutique. */
export function collectionsOf(write: Write = () => undefined) {
  return {
    rings: [
      { collection: RINGS_SIGNATURE, items: signatureRings() },
      { collection: RINGS_VIVANTS, items: vivantRings(write) },
    ],
    wallpapers: [
      { collection: WALLPAPERS_SIGNATURE, items: signatureWallpapers() },
      { collection: WALLPAPERS_VIVANTS, items: vivantWallpapers(write) },
    ],
    frames: [
      { collection: FRAMES_SIGNATURE, items: signatureFrames(FRAMES_SIGNATURE) },
      { collection: FRAMES_VIVANTS, items: signatureFrames(FRAMES_VIVANTS) },
    ],
  };
}

export const MEESHY_COLLECTION_SLUGS: readonly string[] = [RINGS_SIGNATURE, RINGS_VIVANTS, WALLPAPERS_SIGNATURE, WALLPAPERS_VIVANTS, FRAMES_SIGNATURE, FRAMES_VIVANTS].map((c) => c.slug);

/** Les packs de source : après TOUS les packs qui ne sont ni des collections Meeshy ni les offres saisonnières posées après elles (#16270), dans l'ordre déclaré. */
export function sourcePacks(
  existing: readonly SourcePack[],
  entries: readonly { readonly collection: Collection<unknown>; readonly items: readonly unknown[] }[],
  itemsKey: 'rings' | 'designs' | 'frames',
  usage?: { readonly kind: 'free'; readonly surfaces: readonly string[] },
) {
  const after = Math.max(...existing.filter((pack) => !MEESHY_COLLECTION_SLUGS.includes(pack.slug) && !SEASONAL_ADDED_SLUGS.includes(pack.slug)).map((pack) => pack.order));
  return entries.map(({ collection, items }, index) => ({
    slug: collection.slug,
    order: after + 1 + index,
    installedByDefault: false,
    removable: true,
    ...(usage === undefined ? {} : { usage }),
    [itemsKey]: items,
  }));
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const design = resolve(dirname(fileURLToPath(import.meta.url)), '../design/appearance');
  const collections = collectionsOf((src, bytes) => writeFileSync(join(design, 'lottie', src), bytes));
  const sources = [
    { file: 'avatar-rings/rings.json', entries: collections.rings, itemsKey: 'rings', usage: { kind: 'free', surfaces: ['avatar'] } },
    { file: 'wallpapers/designs.json', entries: collections.wallpapers, itemsKey: 'designs', usage: undefined },
    { file: 'banner-frames/frames.json', entries: collections.frames, itemsKey: 'frames', usage: { kind: 'free', surfaces: ['banner'] } },
  ] as const;
  for (const source of sources) {
    const path = join(design, source.file);
    const text = readFileSync(path, 'utf8');
    const existing = (JSON.parse(text) as { packs: readonly SourcePack[] }).packs;
    writeFileSync(path, upsertPacks(text, sourcePacks(existing, source.entries, source.itemsKey, source.usage)));
  }
  const tables = { rings: 'rings', wallpapers: 'designs', frames: 'frames' } as const;
  for (const language of LANGUAGES) {
    const stringsPath = join(design, `strings/${language}.json`);
    const strings = JSON.parse(readFileSync(stringsPath, 'utf8')) as { packs: Record<string, unknown> } & Record<'rings' | 'designs' | 'frames', Record<string, string>>;
    for (const [kind, table] of Object.entries(tables) as [keyof typeof tables, (typeof tables)[keyof typeof tables]][]) {
      for (const { collection } of collections[kind]) {
        strings.packs[collection.slug] = collection.names[language];
        for (const item of collection.items as readonly { readonly key: string; readonly names: Record<string, string> }[]) strings[table][item.key] = item.names[language]!;
      }
    }
    writeFileSync(stringsPath, `${JSON.stringify(strings, null, 2)}\n`);
  }
  process.stdout.write(`${MEESHY_COLLECTION_SLUGS.join(', ')} écrits\n`);
}
