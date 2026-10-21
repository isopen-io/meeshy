/**
 * `bun run generate:glory-frames` (#10154, L3, § 5.3) — sans navigateur : les
 * contrats des collections, le registre éditorial et les chaînes deviennent
 * les fichiers SERVIS de chaque pack `glory-frame`.
 *
 *   packages/shared/design/glory-frames/<collection>.json     (import:glory-frames)
 *   packages/shared/design/glory-frames/strings/<collection>/<langue>.json
 *   packages/shared/design/glory-frames/packs.json            (l'éditorial, écrit à la main)
 *     ├─ services/gateway/assets/packs/<sha16>.json           (contrat de chaque pack, chaînes par langue)
 *     ├─ packs.json, champs CALCULÉS seulement                (cover, contract, strings, downloadBytes, version, fingerprint)
 *     └─ packages/shared/design/packs/retained.json           (« glory-frame/<slug>@<version> » → fichiers encore servis)
 *
 * `version` porte sur l'empreinte de l'ENSEMBLE des références d'un pack
 * (contrat, chaînes de chaque langue, couverture, atlas) : elle monte de un
 * quand cette empreinte change, et ne descend jamais. Les fichiers de la
 * version quittée entrent dans `retained.json`, pour qu'une photo gardée les
 * relise. Le témoin de fraîcheur (`__tests__/glory-frames-generated.test.ts`)
 * rejoue `buildGloryFramePacks` en mémoire et exige l'égalité avec le dépôt.
 *
 * Le socle iOS (`apps/ios/Meeshy/Resources/Packs/`) et la fixture de
 * géométrie suivent au lot qui les branche : rien ne s'écrit qu'un lecteur ne lit.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_LANGUAGES, type PackAssetRef, type PackLanguage } from '../types/content-pack.js';
import { parsePackIndex } from '../types/content-pack-index.js';
import { gloryFrameAssets, parseGloryFrameCollection, parseGloryFrameContract, type GloryFrame, type GloryFrameCollection } from '../types/glory-frames.js';
import { parsePackStrings, type PackStrings } from '../types/glory-frame-pack.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../../..');
export const GLORY_FRAMES_DIR = join(REPO_ROOT, 'packages/shared/design/glory-frames');
export const REGISTRY_FILE = join(GLORY_FRAMES_DIR, 'packs.json');
export const RETAINED_FILE = join(REPO_ROOT, 'packages/shared/design/packs/retained.json');
export const SAMPLE_REGISTRY_FILE = join(REPO_ROOT, 'packages/shared/design/packs/samples/glory-frame.json');
export const PACK_ASSETS_DIR = join(REPO_ROOT, 'services/gateway/assets/packs');

/** L'entrée éditoriale d'un pack, telle que `packs.json` la porte (les champs calculés sont réécrits). */
export type RegistryEntry = Readonly<Record<string, unknown>> & {
  readonly slug: string;
  readonly collections: readonly { readonly slug: string }[];
  readonly coverFrame?: string;
  readonly version?: number;
  readonly fingerprint?: string;
  readonly contract?: PackAssetRef;
  readonly cover?: PackAssetRef;
  readonly strings?: Readonly<Record<string, PackAssetRef>>;
};

export type GloryFrameSources = {
  readonly registry: readonly RegistryEntry[];
  readonly collections: ReadonlyMap<string, GloryFrameCollection>;
  readonly strings: ReadonlyMap<string, Partial<Record<PackLanguage, PackStrings>>>;
  readonly retained: Readonly<Record<string, readonly string[]>>;
  /** Le contrat d'une version QUITTÉE, relu dans le magasin pour en retenir les fichiers ; `null` s'il est introuvable. */
  readonly readStoredJson: (src: string) => unknown;
};

export type GeneratedPacks = {
  readonly registry: readonly Readonly<Record<string, unknown>>[];
  /** `<sha16>.json` → contenu : contrats et chaînes des packs. */
  readonly files: ReadonlyMap<string, string>;
  readonly retained: Readonly<Record<string, readonly string[]>>;
};

export const sha256 = (bytes: string | Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Un fichier adressé par contenu : son nom EST son empreinte. */
export function addressedJson(value: unknown): { readonly ref: PackAssetRef; readonly text: string } {
  const text = JSON.stringify(value);
  const digest = sha256(text);
  return { ref: { src: `${digest.slice(0, 16)}.json`, bytes: Buffer.byteLength(text), sha256: digest }, text };
}

const framesOf = (entry: RegistryEntry, collections: GloryFrameSources['collections']): readonly GloryFrame[] =>
  entry.collections.flatMap(({ slug }) => {
    const collection = collections.get(slug);
    if (collection === undefined) throw new Error(`le pack ${entry.slug} cite la collection ${slug}, absente`);
    return collection.frames;
  });

const stringsOf = (entry: RegistryEntry, strings: GloryFrameSources['strings']): Partial<Record<PackLanguage, PackStrings>> =>
  Object.fromEntries(
    PACK_LANGUAGES.flatMap((language) => {
      const tables = entry.collections.map(({ slug }) => strings.get(slug)?.[language]);
      if (tables.some((table) => table === undefined)) return [];
      return [[language, Object.assign({}, ...tables) as PackStrings]];
    }),
  );

const uniqueBytes = (refs: readonly PackAssetRef[]): number => [...new Map(refs.map((ref) => [ref.src, ref.bytes])).values()].reduce((sum, bytes) => sum + bytes, 0);

/** Tous les fichiers qu'une entrée publiée engage : ceux du registre et ceux de son contrat relu. */
function servedFilesOf(entry: RegistryEntry, readStoredJson: GloryFrameSources['readStoredJson']): readonly string[] {
  const own = [entry.contract, entry.cover, ...Object.values(entry.strings ?? {})].filter((ref): ref is PackAssetRef => ref !== undefined);
  const contract = entry.contract === undefined ? null : parseGloryFrameContract(readStoredJson(entry.contract.src));
  const frames = contract?.contract.frames.flatMap(gloryFrameAssets) ?? [];
  return [...new Set([...own, ...frames].map((ref) => ref.src))].sort();
}

const computedKeys = new Set(['version', 'cover', 'preview', 'contract', 'strings', 'downloadBytes', 'fingerprint']);

/** Régénère, en mémoire, tout ce que `packs.json` et le magasin portent de calculé. */
export function buildGloryFramePacks(sources: GloryFrameSources): GeneratedPacks {
  const files = new Map<string, string>();
  const retained: Record<string, readonly string[]> = { ...sources.retained };
  const registry = sources.registry.map((entry) => {
    const frames = framesOf(entry, sources.collections);
    const coverFrame = frames.find((frame) => frame.id === entry.coverFrame) ?? frames[0];
    if (coverFrame === undefined) throw new Error(`le pack ${entry.slug} n'a aucun cadre`);
    const contract = addressedJson({ schema: 1, frames });
    const strings = Object.entries(stringsOf(entry, sources.strings)).map(([language, table]) => [language, addressedJson(table)] as const);
    const cover = coverFrame.thumb;
    files.set(contract.ref.src, contract.text);
    strings.forEach(([, file]) => files.set(file.ref.src, file.text));
    const fingerprint = sha256(JSON.stringify({ contract: contract.ref.sha256, strings: strings.map(([language, file]) => [language, file.ref.sha256]), cover: cover.sha256, preview: null }));
    const previous = entry.version ?? 1;
    const changed = entry.fingerprint !== undefined && entry.fingerprint !== fingerprint;
    if (changed) retained[`glory-frame/${entry.slug}@${previous}`] = servedFilesOf(entry, sources.readStoredJson);
    const downloadBytes = uniqueBytes([contract.ref, cover, ...strings.map(([, file]) => file.ref), ...frames.flatMap(gloryFrameAssets)]);
    const editorial = Object.fromEntries(Object.entries(entry).filter(([key]) => !computedKeys.has(key)));
    return {
      ...editorial,
      version: changed ? previous + 1 : previous,
      cover,
      preview: null,
      contract: contract.ref,
      strings: Object.fromEntries(strings.map(([language, file]) => [language, file.ref])),
      downloadBytes: { story: downloadBytes, square: null },
      fingerprint,
    };
  });
  return { registry, files, retained };
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

export const jsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Les sources versionnées du dépôt. */
export function readGloryFrameSources(): GloryFrameSources {
  const registry = readJson(REGISTRY_FILE) as readonly RegistryEntry[];
  const slugs = [...new Set(registry.flatMap((entry) => entry.collections.map(({ slug }) => slug)))];
  const collections = new Map(
    slugs.map((slug) => {
      const parsed = parseGloryFrameCollection(readJson(join(GLORY_FRAMES_DIR, `${slug}.json`)));
      if (parsed === null || parsed.rejected > 0) throw new Error(`collection ${slug} illisible (${parsed?.rejected ?? 'enveloppe'})`);
      return [slug, parsed.collection] as const;
    }),
  );
  const strings = new Map(
    slugs.map((slug) => {
      const dir = join(GLORY_FRAMES_DIR, 'strings', slug);
      const present = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.json')) : [];
      const tables = present
        .map((file) => file.slice(0, -5))
        .filter((language): language is PackLanguage => (PACK_LANGUAGES as readonly string[]).includes(language))
        .map((language) => [language, parsePackStrings(readJson(join(dir, `${language}.json`)))] as const);
      return [slug, Object.fromEntries(tables) as Partial<Record<PackLanguage, PackStrings>>] as const;
    }),
  );
  const retained = existsSync(RETAINED_FILE) ? (readJson(RETAINED_FILE) as Record<string, readonly string[]>) : {};
  const readStoredJson = (src: string): unknown => {
    const path = join(PACK_ASSETS_DIR, src);
    return existsSync(path) ? readJson(path) : null;
  };
  return { registry, collections, strings, retained, readStoredJson };
}

function main(): void {
  const generated = buildGloryFramePacks(readGloryFrameSources());
  const parsed = parsePackIndex(generated.registry);
  if (parsed.rejected > 0) throw new Error(`${parsed.rejected} entrée(s) du registre refusée(s) par PackIndexEntrySchema`);
  generated.files.forEach((text, src) => writeFileSync(join(PACK_ASSETS_DIR, src), text));
  writeFileSync(REGISTRY_FILE, jsonText(generated.registry));
  writeFileSync(RETAINED_FILE, jsonText(generated.retained));
  for (const entry of parsed.entries) process.stdout.write(`${entry.slug}@${entry.version} : ${(entry.downloadBytes.story / 1_048_576).toFixed(2)} Mo\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
