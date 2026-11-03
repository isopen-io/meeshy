/**
 * Compose les BANNIÈRES ASSORTIES et les packs de NOËL (#15553) en données pures :
 *
 *   cd packages/shared && bun scripts/compose-assorted-banners.ts
 *
 * - les contours d'avatar de Noël (`christmas/packs.ts`) : films adressés par contenu dans
 *   `design/appearance/lottie/<sha16>.json` (même chaîne que les cadres illustrés : `validateLottie`,
 *   `MAX_FILM_BYTES`, 30 i/s), packs posés dans `avatar-rings/rings.json` ;
 * - un pack de cadres de bannière par pack de contours illustrés ou de Noël (`assorted-banners/packs.ts`),
 *   posé dans `banner-frames/frames.json` ; chaque cadre passe le schéma partagé ;
 * - leurs noms dans `design/appearance/strings/<langue>.json` — les cadres de bannière portent le nom de
 *   leur contour, le pack celui du pack d'avatar.
 *
 * Proposés par la boutique (jamais installés d'office), retirables, rangés APRÈS les packs existants et
 * AVANT les collections Meeshy (#15158), qui restent les dernières. Ensuite, dans cet ordre :
 * `compose-meeshy-collections.ts` (renumérote les collections), la passerelle
 * (`services/gateway/scripts/generate-appearance-packs.ts`) et les copies iOS et Android
 * (`sync-appearance-catalog-{ios,android}.ts`). Idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBannerFrameDesign } from '../types/banner-frame-design.js';
import { ASSORTED_BANNER_PACKS } from './assorted-banners/packs.js';
import { CHRISTMAS_RING_PACKS } from './christmas/packs.js';
import { ringsOf } from './compose-illustrated-ring-lotties.js';
import { LANGUAGES } from './illustrated-rings/packs.js';
import { MEESHY_COLLECTION_SLUGS } from './compose-meeshy-collections.js';
import { upsertPacks } from './meeshy-collections/source-packs.js';

type SourcePack = { readonly slug: string; readonly order: number };
type Write = (src: string, bytes: Buffer) => void;

export const ASSORTED_SLUGS: readonly string[] = ASSORTED_BANNER_PACKS.map((pack) => pack.slug);
export const CHRISTMAS_SLUGS: readonly string[] = CHRISTMAS_RING_PACKS.map((pack) => pack.slug);

/** Le rang après tous les packs qui ne sont ni des collections Meeshy, ni ceux que ce compositeur pose. */
const after = (existing: readonly SourcePack[], own: readonly string[]): number =>
  Math.max(...existing.filter((pack) => !MEESHY_COLLECTION_SLUGS.includes(pack.slug) && !own.includes(pack.slug)).map((pack) => pack.order));

export function assortedBannerPacks(existing: readonly SourcePack[]) {
  const first = after(existing, ASSORTED_SLUGS) + 1;
  return ASSORTED_BANNER_PACKS.map((pack, index) => ({
    slug: pack.slug,
    order: first + index,
    installedByDefault: false,
    removable: true,
    usage: { kind: 'free', surfaces: ['banner'] },
    frames: pack.frames.map((frame) => {
      if (parseBannerFrameDesign(frame) === null) throw new Error(`${pack.slug}/${frame.key} : le cadre ne passe pas le schéma partagé`);
      return frame;
    }),
  }));
}

export function christmasRingPacks(existing: readonly SourcePack[], write: Write = () => undefined) {
  const first = after(existing, CHRISTMAS_SLUGS) + 1;
  return CHRISTMAS_RING_PACKS.map((pack, index) => ({
    slug: pack.slug,
    order: first + index,
    installedByDefault: false,
    removable: true,
    usage: { kind: 'free', surfaces: ['avatar'] },
    rings: ringsOf(pack, write),
  }));
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const design = resolve(dirname(fileURLToPath(import.meta.url)), '../design/appearance');
  const write: Write = (src, bytes) => writeFileSync(join(design, 'lottie', src), bytes);
  const place = (file: string, build: (existing: readonly SourcePack[]) => readonly { readonly slug: string }[]) => {
    const path = join(design, file);
    const text = readFileSync(path, 'utf8');
    writeFileSync(path, upsertPacks(text, build((JSON.parse(text) as { packs: readonly SourcePack[] }).packs), MEESHY_COLLECTION_SLUGS));
  };
  place('avatar-rings/rings.json', (existing) => christmasRingPacks(existing, write));
  place('banner-frames/frames.json', assortedBannerPacks);
  for (const language of LANGUAGES) {
    const stringsPath = join(design, `strings/${language}.json`);
    const strings = JSON.parse(readFileSync(stringsPath, 'utf8')) as { packs: Record<string, unknown>; rings: Record<string, string>; frames: Record<string, string> };
    for (const pack of CHRISTMAS_RING_PACKS) {
      strings.packs[pack.slug] = pack.names[language];
      for (const frame of pack.frames) strings.rings[frame.key] = frame.names[language];
    }
    for (const pack of ASSORTED_BANNER_PACKS) {
      strings.packs[pack.slug] = pack.names[language];
      for (const frame of pack.frames) {
        const name = strings.rings[frame.key];
        if (name === undefined) throw new Error(`${frame.key} : le contour assorti n'a pas de nom en ${language}`);
        strings.frames[frame.key] = name;
      }
    }
    writeFileSync(stringsPath, `${JSON.stringify(strings, null, 2)}\n`);
  }
  process.stdout.write(`${[...CHRISTMAS_SLUGS, ...ASSORTED_SLUGS].join(', ')} écrits\n`);
}
