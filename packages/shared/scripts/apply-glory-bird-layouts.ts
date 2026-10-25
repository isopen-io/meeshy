/**
 * `bun run glory-frames:bird-layouts` (#10277) — pose sur les contrats VERSIONNÉS des collections les mises en page
 * de Mee et Meo que le détecteur du générateur a validées
 * (`docs/product/cadres-de-gloire/controle/mises-en-page-<collection>.json`, écrit par `node lib/overlap.mjs`) :
 * chaque mise en page, ses ancres, le rectangle du dessin de chaque pose et son verdict. Sans réexport : un réexport
 * complet n'est pas reproductible à l'octet (#10254) et remplacerait toutes les couches pour du bruit ;
 * `import:glory-frames` pose la même table depuis un export neuf (`birds` de l'export).
 *
 * Puis `bun run generate:glory-frames` : les contrats des packs changent, leurs versions montent.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGloryFrame } from '../types/glory-frames.js';
import { GLORY_FRAMES_DIR, REGISTRY_FILE, REPO_ROOT, jsonText, type RegistryEntry } from './generate-glory-frames.js';
import { birdTableOf, type RawBirdTable } from './glory-frames-normalize.js';

export const CONTROLE_DIR = join(REPO_ROOT, 'docs/product/cadres-de-gloire/controle');

export type DeclaredFrame = RawBirdTable & { readonly frame: string };

export type CollectionDocument = { readonly frames: readonly { readonly id: string; readonly formats: { readonly story: Readonly<Record<string, unknown>> } }[] };

/** Le contrat d'une collection, `birds` du format story remplacé par la table déclarée de chaque cadre. */
export function withDeclaredBirds<D extends CollectionDocument>(document: D, records: readonly DeclaredFrame[]): D {
  const byFrame = new Map(records.map((record) => [record.frame, record]));
  const frames = document.frames.map((frame) => {
    const name = frame.id.replace('.', '-');
    const record = byFrame.get(name);
    if (record === undefined) throw new Error(`${name} absent du relevé des mises en page : relancer \`node lib/overlap.mjs\``);
    return { ...frame, formats: { ...frame.formats, story: { ...frame.formats.story, birds: birdTableOf(record) } } };
  });
  return { ...document, frames };
}

/** Les cadres dont le contrat ne porte pas, à l'octet, la table de son relevé : vide quand le contrat égale le relevé. */
export function birdLayoutDrift<D extends CollectionDocument>(document: D, records: readonly DeclaredFrame[]): readonly string[] {
  const expected = withDeclaredBirds(document, records);
  return expected.frames.filter((frame, at) => jsonText(frame) !== jsonText(document.frames[at])).map((frame) => frame.id);
}

/** Les collections du registre, chacune avec son contrat versionné et son relevé de mises en page. */
export function gloryBirdLayoutSlugs(): readonly string[] {
  const registry = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')) as readonly RegistryEntry[];
  return [...new Set(registry.flatMap((entry) => entry.collections.map(({ slug }) => slug)))];
}

export function readCollectionBirdLayouts(slug: string): { readonly text: string; readonly document: CollectionDocument; readonly records: readonly DeclaredFrame[] } {
  const declared = join(CONTROLE_DIR, `mises-en-page-${slug}.json`);
  if (!existsSync(declared)) throw new Error(`${declared} absent : relancer \`node lib/overlap.mjs\` dans le générateur`);
  const text = readFileSync(join(GLORY_FRAMES_DIR, `${slug}.json`), 'utf8');
  return { text, document: JSON.parse(text) as CollectionDocument, records: JSON.parse(readFileSync(declared, 'utf8')) as readonly DeclaredFrame[] };
}

function main(): void {
  for (const slug of gloryBirdLayoutSlugs()) {
    const { text: before, document, records } = readCollectionBirdLayouts(slug);
    const next = withDeclaredBirds(document, records);
    const unreadable = next.frames.filter((frame) => readGloryFrame(frame) === null).map((frame) => frame.id);
    if (unreadable.length > 0) throw new Error(`${slug} : cadre(s) illisible(s) après la pose : ${unreadable.join(', ')}`);
    const after = jsonText(next);
    if (after !== before) writeFileSync(join(GLORY_FRAMES_DIR, `${slug}.json`), after);
    process.stdout.write(`${slug} : ${after === before ? 'inchangé' : 'mises en page posées'}\n`);
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
