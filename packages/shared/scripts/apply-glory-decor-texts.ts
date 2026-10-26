/**
 * `bun run glory-frames:decor-texts` (#10256) — rejoue le tri des textes de
 * décor (`packages/shared/design/glory-frames/decor-texts.json`) sur les
 * contrats VERSIONNÉS des collections, sans réexport : la clé d'un texte
 * traduit, la donnée d'un texte vivant. Un réexport complet n'est pas
 * reproductible à l'octet (#10254) et remplacerait toutes les couches pour du
 * bruit ; l'import (`import:glory-frames`) pose le même tri sur un export neuf.
 *
 * Puis `bun run generate:glory-frames` : les contrats et les chaînes des packs
 * changent, leurs versions montent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseGloryDecorTextTable, sortGloryDecorTexts, type GloryDecorTextTable } from '../types/glory-frame-decor.js';
import { readGloryFrame, type GloryFrame } from '../types/glory-frames.js';
import { DECOR_TEXTS_FILE, GLORY_FRAMES_DIR, REGISTRY_FILE, jsonText, type RegistryEntry } from './generate-glory-frames.js';

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

/** Le manifeste d'une collection, tri rejoué ; le reste du fichier ne bouge pas, champ pour champ. */
export function sortedCollectionDocument(document: { readonly frames: readonly unknown[] }, table: GloryDecorTextTable): { readonly frames: readonly unknown[] } {
  const frames = document.frames.map((raw) => {
    if (readGloryFrame(raw) === null) throw new Error('cadre illisible : rejouer import:glory-frames');
    return sortGloryDecorTexts(raw as GloryFrame, table);
  });
  return { ...document, frames };
}

function main(): void {
  const table = parseGloryDecorTextTable(readJson(DECOR_TEXTS_FILE));
  if (table === null) throw new Error(`${DECOR_TEXTS_FILE} illisible`);
  const registry = readJson(REGISTRY_FILE) as readonly RegistryEntry[];
  const slugs = [...new Set(registry.flatMap((entry) => entry.collections.map(({ slug }) => slug)))];
  for (const slug of slugs) {
    const file = join(GLORY_FRAMES_DIR, `${slug}.json`);
    const before = readFileSync(file, 'utf8');
    const after = jsonText(sortedCollectionDocument(JSON.parse(before) as { readonly frames: readonly unknown[] }, table));
    if (after !== before) writeFileSync(file, after);
    process.stdout.write(`${slug} : ${after === before ? 'inchangé' : 'tri rejoué'}\n`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
