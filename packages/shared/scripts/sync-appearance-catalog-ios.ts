/**
 * Copie le catalogue d'apparence (gamme de 16 couleurs, 14 fonds, bannières,
 * contours, cadres de bannière — #10936 —, noms en 7 langues) dans le SDK iOS (#10631, spec § 8.2) :
 *
 *   cd packages/shared && bun scripts/sync-appearance-catalog-ios.ts
 *
 * Les sources restent `design/appearance/**` et `gamut.ts` ; le SDK ne lit
 * qu'UN fichier embarqué. `__tests__/appearance-catalog-ios-copy.test.ts`
 * exige que la copie committée soit égale à `renderAppearanceCatalog()`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPEARANCE_GAMUT, GAMUT_KEYS } from '../design/appearance/gamut.js';

export const IOS_CATALOG_PATH = 'packages/MeeshySDK/Sources/MeeshySDK/Resources/appearance-catalog.json';
export const IOS_CATALOG_SWIFT_PATH = 'packages/MeeshySDK/Sources/MeeshySDK/Appearance/AppearanceCatalogData.swift';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = resolve(HERE, '../design/appearance');
const LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const;

type PackFile<Item extends 'designs' | 'rings' | 'frames'> = { readonly packs: readonly ({ readonly slug: string; readonly order: number; readonly installedByDefault: boolean; readonly removable: boolean; readonly usage?: unknown } & { readonly [K in Item]: readonly unknown[] })[] };

const readJson = <T>(relative: string): T => JSON.parse(readFileSync(join(SOURCE_DIR, relative), 'utf8')) as T;

export function buildAppearanceCatalog() {
  const wallpapers = readJson<PackFile<'designs'>>('wallpapers/designs.json').packs;
  const banners = readJson<PackFile<'designs'>>('banners/designs.json').packs;
  const rings = readJson<PackFile<'rings'>>('avatar-rings/rings.json').packs;
  const bannerFrames = readJson<PackFile<'frames'>>('banner-frames/frames.json').packs;
  return {
    version: 1,
    gamut: GAMUT_KEYS.map((key) => ({ key, ...APPEARANCE_GAMUT[key] })),
    wallpapers,
    banners,
    rings,
    bannerFrames,
    strings: Object.fromEntries(LANGUAGES.map((lang) => [lang, readJson<unknown>(`strings/${lang}.json`)])),
  };
}

export const renderAppearanceCatalog = (): string => `${JSON.stringify(buildAppearanceCatalog(), null, 2)}\n`;

/**
 * Le JSON embarqué en Swift : une ressource SwiftPM ferait générer `Bundle.module` dans MeeshySDK,
 * ambigu avec celui de MeeshyUI dans tout test qui importe les deux. Le fichier JSON reste la copie
 * lisible ; ce littéral en est le texte exact (chaîne brute, aucune interpolation possible).
 */
export const renderAppearanceCatalogSwift = (): string =>
  `// GÉNÉRÉ — ne pas éditer à la main.\n//\n// Source : packages/shared/scripts/sync-appearance-catalog-ios.ts (\`bun scripts/sync-appearance-catalog-ios.ts\`).\n// Le témoin vitest appearance-catalog-ios-copy.test.ts exige ce fichier identique à la source partagée.\n\nenum AppearanceCatalogData {\n    static let json = #\"\"\"\n${JSON.stringify(buildAppearanceCatalog(), null, 2)}\n\"\"\"#\n}\n`;

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  writeFileSync(resolve(HERE, '../../..', IOS_CATALOG_PATH), renderAppearanceCatalog());
  writeFileSync(resolve(HERE, '../../..', IOS_CATALOG_SWIFT_PATH), renderAppearanceCatalogSwift());
  process.stdout.write(`${IOS_CATALOG_PATH} et ${IOS_CATALOG_SWIFT_PATH} écrits\n`);
}
