/**
 * `bun run import:glory-frames` (#10154, L3, § 5.3) — l'export du générateur
 * devient le contrat versionné de chaque collection, et ses couches entrent
 * dans le magasin adressé par contenu de la passerelle.
 *
 *   docs/product/cadres-de-gloire/generateur/export/<collection>/   (lib/export.mjs, L1 ; ignoré par git)
 *     ├─ packages/shared/design/glory-frames/<collection>.json       (LE contrat d'une collection)
 *     ├─ packages/shared/design/glory-frames/strings/<collection>/fr.json  (noms et histoires, tirés du manifeste)
 *     └─ services/gateway/assets/packs/<sha16>.webp                  (couches, masques, vignettes)
 *
 * Tourne en local ou dans le job du générateur (Chromium y est) ; jamais en CI
 * de `packages/shared`, qui n'a pas l'export. Chaque fichier copié est vérifié
 * contre l'empreinte que l'export déclare ; un cadre illisible arrête tout :
 * rien n'entre à moitié. Les autres langues des chaînes (L16) ne sont jamais
 * écrasées.
 *
 * Usage : `bun scripts/import-glory-frames.ts [collection…]` (toutes par défaut).
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGloryFrameCollection, type GloryFrameCollection } from '../types/glory-frames.js';
import {
  COLLECTION_ATMOSPHERES,
  DEMO_COLLECTIONS,
  addressedName,
  exportedRefs,
  normalizeFrame,
  type ManifestEntry,
  type RawExportFrame,
} from './glory-frames-normalize.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../..');
export const DESIGN_ROOT = join(REPO_ROOT, 'docs/product/cadres-de-gloire');
export const EXPORT_DIR = join(DESIGN_ROOT, 'generateur/export');
export const MANIFESTS_DIR = join(DESIGN_ROOT, 'manifests');
export const GLORY_FRAMES_DIR = join(REPO_ROOT, 'packages/shared/design/glory-frames');
export const PACK_ASSETS_DIR = join(REPO_ROOT, 'services/gateway/assets/packs');

export const GENERATED_NOTICE = 'GÉNÉRÉ par `bun run import:glory-frames` depuis l’export du générateur — ne pas éditer.';

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function importCollection(collection: string): { readonly frames: number; readonly copied: number } {
  const exported = readJson<{ readonly frames: readonly RawExportFrame[] }>(join(EXPORT_DIR, collection, 'export.json'));
  const manifest = readJson<readonly ManifestEntry[]>(join(MANIFESTS_DIR, `${collection}.json`));
  const entryOf = (frame: string): ManifestEntry => {
    const entry = manifest.find((candidate) => candidate.file === `${frame}.jpg`);
    if (entry === undefined) throw new Error(`${frame} absent du manifeste ${collection}`);
    return entry;
  };
  const ordered = manifest.map((entry) => exported.frames.find((frame) => `${frame.frame}.jpg` === entry.file)).filter((frame): frame is RawExportFrame => frame !== undefined);
  if (ordered.length !== exported.frames.length) throw new Error(`${collection} : l'export et le manifeste ne listent pas les mêmes cadres`);
  const frames = ordered.map((raw) => normalizeFrame(collection, raw, entryOf(raw.frame)));
  const document = { generated: GENERATED_NOTICE, schema: 1, collection, atmosphere: COLLECTION_ATMOSPHERES[collection] ?? null, frames };
  const parsed = parseGloryFrameCollection(document);
  if (parsed === null || parsed.rejected > 0) throw new Error(`${collection} : ${parsed?.rejected ?? 'tous les'} cadre(s) refusé(s) par le schéma`);
  const copied = ordered.flatMap(exportedRefs).reduce((count, ref) => count + copyAsset(join(EXPORT_DIR, collection, ref.src), addressedName(ref), ref.sha256), 0);
  writeFileSync(join(GLORY_FRAMES_DIR, `${collection}.json`), jsonText(document));
  writeFrenchStrings(parsed.collection, ordered.map((raw) => entryOf(raw.frame)));
  return { frames: frames.length, copied };
}

function copyAsset(from: string, name: string, sha256: string): number {
  const digest = createHash('sha256').update(readFileSync(from)).digest('hex');
  if (digest !== sha256) throw new Error(`${from} : empreinte ${digest} ≠ ${sha256} déclarée par l'export`);
  const to = join(PACK_ASSETS_DIR, name);
  if (existsSync(to)) return 0;
  copyFileSync(from, to);
  return 1;
}

function writeFrenchStrings(collection: GloryFrameCollection, entries: readonly ManifestEntry[]): void {
  const dir = join(GLORY_FRAMES_DIR, 'strings', collection.collection);
  mkdirSync(dir, { recursive: true });
  const table = Object.fromEntries(
    collection.frames.flatMap((frame, at) => {
      const entry = entries[at];
      return entry === undefined ? [] : [[frame.i18n.name, entry.name.trim()], ...(frame.i18n.story === undefined ? [] : [[frame.i18n.story, entry.story.trim()]])];
    }),
  );
  writeFileSync(join(dir, 'fr.json'), jsonText(table));
}

export function exportedCollections(): readonly string[] {
  return readdirSync(EXPORT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !DEMO_COLLECTIONS.includes(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function main(argv: readonly string[]): void {
  if (!existsSync(EXPORT_DIR)) throw new Error(`aucun export : lancer d'abord \`node lib/export.mjs --generate\` dans ${join(DESIGN_ROOT, 'generateur')}`);
  mkdirSync(GLORY_FRAMES_DIR, { recursive: true });
  mkdirSync(PACK_ASSETS_DIR, { recursive: true });
  const wanted = argv.length > 0 ? argv : exportedCollections();
  for (const collection of wanted) {
    const { frames, copied } = importCollection(collection);
    process.stdout.write(`${collection} : ${frames} cadres, ${copied} fichier(s) neuf(s) dans le magasin\n`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
