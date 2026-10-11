/**
 * LES REGISTRES DES PACKS OFFICIELS, lus AU DÉMARRAGE (#10148, LP0, § 5.10.4,
 * § 5.11) — et la liste blanche des empreintes que le magasin adressé par
 * contenu (`GET /api/v1/pack-assets/<sha16>.<ext>`, L5) sert, sans aucune
 * lecture de base par requête.
 *
 * Les registres sont des DONNÉES versionnées du dépôt :
 * `packages/shared/design/glory-frames/packs.json` (L3) et
 * `packages/shared/design/call-capture-frames/packs.json` (LC), plus
 * `packages/shared/design/packs/retained.json` (les empreintes qu'une photo
 * gardée peut encore demander après la sortie d'un pack). Un fichier ABSENT
 * vaut un registre VIDE — c'est l'état voulu jusqu'au L3 : le moteur se monte
 * et répond une boutique vide, jamais des données inventées.
 *
 * Fail-closed PAR ENTRÉE (`parsePackIndex`) : une entrée illisible tombe seule
 * et se compte, un fichier illisible tombe entier et se compte.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePackIndex, type PackIndexEntry } from '@meeshy/shared/types/content-pack-index';
import type { PackAssetRef, PackDomain } from '@meeshy/shared/types/content-pack';

export type PackIndex = {
  /** Les entrées d'un domaine, dans l'ordre éditorial (`order`). */
  readonly entries: (domain: PackDomain) => readonly PackIndexEntry[];
  /** Le magasin peut-il servir ce fichier ? `<sha16>.<ext>`, référencé par un registre ou retenu. */
  readonly isServedAsset: (src: string) => boolean;
  /** Ce qui n'a pas été lu : entrées refusées et fichiers illisibles — à journaliser au démarrage. */
  readonly rejected: number;
};

export type PackIndexSources = {
  /** Le contenu brut de chaque registre (déjà `JSON.parse`), un par fichier. */
  readonly registries: readonly unknown[];
  /** Le contenu brut de `retained.json` : une liste de `<sha16>.<ext>`. */
  readonly retained: unknown;
};

const ASSET_SRC = /^[0-9a-f]{16}\.(?:webp|png|json|woff2)$/;

const refsOf = (entry: PackIndexEntry): readonly PackAssetRef[] => [
  entry.cover,
  entry.contract,
  ...(entry.preview === null ? [] : [entry.preview]),
  ...Object.values(entry.strings).filter((ref): ref is PackAssetRef => ref !== undefined),
];

export function buildPackIndex(sources: PackIndexSources): PackIndex {
  const parsed = sources.registries.map((registry) => parsePackIndex(registry));
  const all = parsed.flatMap(({ entries }) => entries);
  const seen = new Set<string>();
  const entries = all.filter((entry) => {
    const key = `${entry.domain}.${entry.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const retained = Array.isArray(sources.retained) ? sources.retained.filter((src): src is string => typeof src === 'string' && ASSET_SRC.test(src)) : [];
  const served = new Set<string>([...entries.flatMap((entry) => refsOf(entry).map((ref) => ref.src)), ...retained]);
  const byDomain = (domain: PackDomain) => entries.filter((entry) => entry.domain === domain).sort((a, b) => a.order - b.order);
  return {
    entries: byDomain,
    isServedAsset: (src) => ASSET_SRC.test(src) && served.has(src),
    rejected: parsed.reduce((sum, { rejected }) => sum + rejected, 0) + (all.length - entries.length),
  };
}

export const EMPTY_PACK_INDEX: PackIndex = buildPackIndex({ registries: [], retained: [] });

const REGISTRY_FILES = ['glory-frames/packs.json', 'call-capture-frames/packs.json'] as const;
const RETAINED_FILE = 'packs/retained.json';

/** Où chercher `packages/shared/design` : la variable d'environnement d'abord, puis le dépôt vu depuis la passerelle. */
export function packDesignDirCandidates(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return [env.MEESHY_PACKS_DESIGN_DIR, join(cwd, '../../packages/shared/design'), join(cwd, 'packages/shared/design')].filter(
    (dir): dir is string => typeof dir === 'string' && dir.length > 0,
  );
}

type ReadResult = { readonly value: unknown; readonly unreadable: boolean };

function readJson(path: string): ReadResult {
  if (!existsSync(path)) return { value: [], unreadable: false };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) as unknown, unreadable: false };
  } catch {
    return { value: [], unreadable: true };
  }
}

/** Lit les registres une fois, au démarrage. Aucun dossier de design trouvé ⇒ registres vides. */
export function loadPackIndex(candidates: readonly string[] = packDesignDirCandidates()): PackIndex {
  const dir = candidates.find((candidate) => existsSync(candidate));
  if (dir === undefined) return EMPTY_PACK_INDEX;
  const registries = REGISTRY_FILES.map((file) => readJson(join(dir, file)));
  const retained = readJson(join(dir, RETAINED_FILE));
  const index = buildPackIndex({ registries: registries.map(({ value }) => value), retained: retained.value });
  const unreadable = [...registries, retained].filter((result) => result.unreadable).length;
  return { ...index, rejected: index.rejected + unreadable };
}
