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
 * vaut un registre VIDE (celui des cadres de capture jusqu'au LC) : le moteur
 * se monte et répond une boutique vide, jamais des données inventées. Le
 * registre des cadres de gloire est publié depuis le L3 (#10154), produit par
 * `generate:glory-frames`.
 *
 * Le registre d'EXEMPLES (`packages/shared/design/packs/samples/glory-frame.json`,
 * demande porteur du 2026-10-11) n'est lu que sous `PACK_SAMPLES=1`, valeur
 * EXACTE : absente, vide ou autre ⇒ jamais lu, donc jamais servi. Le staging
 * la pose ; la production, jamais.
 *
 * La liste blanche porte aussi les fichiers qu'un CONTRAT de pack référence
 * (vignettes, masques, couches et passes de ses cadres) : chaque contrat est lu une fois, au
 * démarrage, depuis le magasin (`services/gateway/assets/packs/`), et vérifié
 * contre son empreinte — un contrat illisible ou altéré n'ouvre rien.
 *
 * Fail-closed PAR ENTRÉE (`parsePackIndex`) : une entrée illisible tombe seule
 * et se compte, un fichier illisible tombe entier et se compte. Une entrée qui
 * reprend une version QUITTÉE — une clé `<domaine>/<slug>@<version>` de
 * `retained.json` — tombe aussi (#10278) : des clients tiennent déjà ce numéro
 * avec un autre contenu, et la servir sous le même ne les mettrait jamais à
 * jour. Ses fichiers retenus restent servis au magasin. MÊME loi que le cliquet
 * de la CI (`packages/shared/scripts/glory-frame-version-ratchet.ts`) : une
 * version égale pour les MÊMES fichiers est une restauration à l'identique,
 * admise — ce que la CI laisse passer ne disparaît pas en silence de la boutique.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePackIndex, type PackIndexEntry } from '@meeshy/shared/types/content-pack-index';
import type { PackAssetRef, PackDomain } from '@meeshy/shared/types/content-pack';
import { parseAppearancePackContract } from '@meeshy/shared/types/appearance-design';
import { parseAvatarRingPackContract } from '@meeshy/shared/types/avatar-ring-design';
import { parseBannerFramePackContract } from '@meeshy/shared/types/banner-frame-design';
import { parseGloryFramePackContract } from '@meeshy/shared/types/glory-frame-pack';
import { gloryFrameAssets, parseGloryFrameContract } from '@meeshy/shared/types/glory-frames';
import { PackRegistryOverrides, overlayPackIndex, type PackRegistryOverridesPrisma } from './PackRegistryOverrides';

export type PackIndex = {
  /** Les entrées d'un domaine, dans l'ordre éditorial (`order`). */
  readonly entries: (domain: PackDomain) => readonly PackIndexEntry[];
  /** Le magasin peut-il servir ce fichier ? `<sha16>.<ext>`, référencé par un registre ou retenu. */
  readonly isServedAsset: (src: string) => boolean;
  /** Le nombre de cadres que le contrat lu et vérifié d'un pack déclare (0 s'il n'a pas été lu). */
  readonly itemCount: (entry: PackIndexEntry) => number;
  /** Les clés des modèles que le contrat lu et vérifié d'un pack de fonds, de bannières ou de contours déclare (vide sinon). */
  readonly itemKeys: (entry: PackIndexEntry) => readonly string[];
  /** Ce qui n'a pas été lu : entrées refusées et fichiers illisibles — à journaliser au démarrage. */
  readonly rejected: number;
};

export type PackIndexSources = {
  /** Le contenu brut de chaque registre (déjà `JSON.parse`), un par fichier. */
  readonly registries: readonly unknown[];
  /** Le contenu brut de `retained.json` : une liste de `<sha16>.<ext>`, ou `{ "<domaine>/<slug>@<version>": [...] }`. */
  readonly retained: unknown;
  /** Les fichiers qu'un contrat de pack référence (vignettes, couches), lus et vérifiés par l'appelant. */
  readonly contractRefs?: (entry: PackIndexEntry) => readonly PackAssetRef[];
  /** Le nombre de cadres du contrat d'un pack, lu et vérifié par l'appelant. */
  readonly contractItemCount?: (entry: PackIndexEntry) => number;
  /** Les clés des modèles du contrat d'un pack d'apparence, lues et vérifiées par l'appelant. */
  readonly contractItemKeys?: (entry: PackIndexEntry) => readonly string[];
};

const ASSET_SRC = /^[0-9a-f]{16}\.(?:webp|png|json|woff2)$/;

const refsOf = (entry: PackIndexEntry): readonly PackAssetRef[] => [
  entry.cover,
  entry.contract,
  ...(entry.preview === null ? [] : [entry.preview]),
  ...Object.values(entry.strings).filter((ref): ref is PackAssetRef => ref !== undefined),
];

const retainedSources = (retained: unknown): readonly unknown[] => {
  if (Array.isArray(retained)) return retained;
  if (typeof retained !== 'object' || retained === null) return [];
  return Object.values(retained).flatMap((list) => (Array.isArray(list) ? list : []));
};

const QUITTED_VERSION_KEY = /^([a-z-]+)\/([a-z0-9-]+)@(\d+)$/;

type QuittedVersion = { readonly version: number; readonly files: readonly string[] };

/** La plus haute version QUITTÉE que `retained.json` nomme (`<domaine>/<slug>@<version>`) par domaine et slug, avec ses fichiers ; la forme liste n'en nomme aucune. */
const quittedVersions = (retained: unknown): ReadonlyMap<string, QuittedVersion> => {
  if (Array.isArray(retained) || typeof retained !== 'object' || retained === null) return new Map();
  return Object.entries(retained).reduce((highest, [key, files]) => {
    const match = QUITTED_VERSION_KEY.exec(key);
    if (match === null) return highest;
    const packKey = `${match[1]}.${match[2]}`;
    const version = Number(match[3]);
    if (version <= (highest.get(packKey)?.version ?? 0)) return highest;
    return highest.set(packKey, { version, files: Array.isArray(files) ? files.filter((src): src is string => typeof src === 'string') : [] });
  }, new Map<string, QuittedVersion>());
};

const sameFiles = (left: readonly string[], right: readonly string[]): boolean => {
  const sortedLeft = [...new Set(left)].sort();
  const sortedRight = [...new Set(right)].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((src, index) => src === sortedRight[index]);
};

/** Une entrée reprend une version quittée si elle est sous la plus haute, ou égale pour d'autres fichiers (égale pour les mêmes : restauration à l'identique). */
const reusesQuittedVersion = (entry: PackIndexEntry, quitted: QuittedVersion | undefined, served: readonly string[]): boolean => {
  if (quitted === undefined) return false;
  if (entry.version < quitted.version) return true;
  return entry.version === quitted.version && !sameFiles(served, quitted.files);
};

export function buildPackIndex(sources: PackIndexSources): PackIndex {
  const parsed = sources.registries.map((registry) => parsePackIndex(registry));
  const quitted = quittedVersions(sources.retained);
  const contractRefs = sources.contractRefs ?? (() => []);
  const servedBy = (entry: PackIndexEntry): readonly string[] => [...refsOf(entry), ...contractRefs(entry)].map((ref) => ref.src);
  const all = parsed.flatMap(({ entries }) => entries);
  const seen = new Set<string>();
  const entries = all.filter((entry) => {
    const key = `${entry.domain}.${entry.slug}`;
    if (reusesQuittedVersion(entry, quitted.get(key), servedBy(entry))) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const retained = retainedSources(sources.retained).filter((src): src is string => typeof src === 'string' && ASSET_SRC.test(src));
  const served = new Set<string>([...entries.flatMap(servedBy), ...retained]);
  const byDomain = (domain: PackDomain) => entries.filter((entry) => entry.domain === domain).sort((a, b) => a.order - b.order);
  const countOf = sources.contractItemCount ?? (() => 0);
  const counts = new Map(entries.map((entry) => [`${entry.domain}.${entry.slug}`, countOf(entry)]));
  const keysOf = sources.contractItemKeys ?? (() => []);
  const keys = new Map(entries.map((entry) => [`${entry.domain}.${entry.slug}`, keysOf(entry)]));
  return {
    entries: byDomain,
    isServedAsset: (src) => ASSET_SRC.test(src) && served.has(src),
    itemCount: (entry) => counts.get(`${entry.domain}.${entry.slug}`) ?? 0,
    itemKeys: (entry) => keys.get(`${entry.domain}.${entry.slug}`) ?? [],
    rejected: parsed.reduce((sum, { rejected }) => sum + rejected, 0) + (all.length - entries.length),
  };
}

export const EMPTY_PACK_INDEX: PackIndex = buildPackIndex({ registries: [], retained: [] });

const REGISTRY_FILES = [
  'glory-frames/packs.json',
  'call-capture-frames/packs.json',
  'appearance/wallpapers/packs.json',
  'appearance/avatar-rings/packs.json',
  'appearance/banners/packs.json',
  'appearance/banner-frames/packs.json',
] as const;
const SAMPLE_REGISTRY_FILES = ['packs/samples/glory-frame.json', 'packs/samples/wallpaper.json'] as const;
const RETAINED_FILE = 'packs/retained.json';

/** Les exemples ne se lisent que sous `PACK_SAMPLES=1`, valeur exacte (fail-closed). */
export const packSamplesEnabled = (env: NodeJS.ProcessEnv): boolean => env.PACK_SAMPLES === '1';

/** Où chercher `packages/shared/design` : la variable d'environnement d'abord, puis le dépôt vu depuis la passerelle. */
export function packDesignDirCandidates(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return [env.MEESHY_PACKS_DESIGN_DIR, join(cwd, '../../packages/shared/design'), join(cwd, 'packages/shared/design')].filter(
    (dir): dir is string => typeof dir === 'string' && dir.length > 0,
  );
}

/** Où chercher le magasin `services/gateway/assets/packs` : la variable d'environnement d'abord, puis l'image (`/app`), puis le dépôt. */
export function packAssetsDirCandidates(cwd: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): readonly string[] {
  return [env.MEESHY_PACK_ASSETS_DIR, join(cwd, 'assets/packs'), join(cwd, 'services/gateway/assets/packs')].filter(
    (dir): dir is string => typeof dir === 'string' && dir.length > 0,
  );
}

export const resolvePackAssetsDir = (candidates: readonly string[] = packAssetsDirCandidates()): string =>
  candidates.find((candidate) => existsSync(candidate)) ?? candidates[candidates.length - 1];

type ReadResult = { readonly value: unknown; readonly unreadable: boolean };

function readJson(path: string): ReadResult {
  if (!existsSync(path)) return { value: [], unreadable: false };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')) as unknown, unreadable: false };
  } catch {
    return { value: [], unreadable: true };
  }
}

type ContractFiles = { readonly refs: readonly PackAssetRef[]; readonly frames: number; readonly keys: readonly string[] };
const NO_CONTRACT: ContractFiles = { refs: [], frames: 0, keys: [] };

type AppearanceItem = { readonly key: string; readonly lottie?: PackAssetRef };

/** Les modèles d'un pack de fonds, de bannières, de contours ou de cadres de bannière. */
function appearanceContractItems(domain: PackDomain, input: unknown): readonly AppearanceItem[] {
  if (domain === 'avatar-ring') return parseAvatarRingPackContract(input)?.rings ?? [];
  if (domain === 'banner-frame') return parseBannerFramePackContract(input)?.frames ?? [];
  const contract = parseAppearancePackContract(input);
  return contract !== null && contract.domain === domain ? contract.designs : [];
}

/**
 * Ce qu'un contrat d'apparence ouvre au magasin : ses clés, et la couche Lottie
 * facultative de chaque modèle (D6, #10638) — le seul fichier qu'un dessin
 * référence, les dessins eux-mêmes étant des DONNÉES.
 */
function appearanceContractFiles(domain: PackDomain, input: unknown): ContractFiles {
  const items = appearanceContractItems(domain, input);
  const keys = items.map((item) => item.key);
  return { refs: items.flatMap((item) => (item.lottie === undefined ? [] : [item.lottie])), frames: keys.length, keys };
}

const APPEARANCE_DOMAINS: readonly PackDomain[] = ['wallpaper', 'banner', 'avatar-ring', 'banner-frame'];

/**
 * Les fichiers du contrat d'un pack, lu dans le magasin et vérifié contre son
 * empreinte. Cadres de gloire : la vignette de chaque cadre et, pour un cadre
 * complet (L3), son masque, ses couches et ses passes. Fonds, bannières et
 * contours : le nombre de modèles et leurs couches Lottie. Contrat illisible ou
 * altéré ⇒ rien.
 */
function contractFiles(assetsDir: string, entry: PackIndexEntry): ContractFiles {
  const appearance = APPEARANCE_DOMAINS.includes(entry.domain);
  if ((entry.domain !== 'glory-frame' && !appearance) || !ASSET_SRC.test(entry.contract.src)) return NO_CONTRACT;
  const path = join(assetsDir, entry.contract.src);
  if (!existsSync(path)) return NO_CONTRACT;
  try {
    const bytes = readFileSync(path);
    if (createHash('sha256').update(bytes).digest('hex') !== entry.contract.sha256) return NO_CONTRACT;
    const input = JSON.parse(bytes.toString('utf8')) as unknown;
    if (appearance) return appearanceContractFiles(entry.domain, input);
    const thumbs = parseGloryFramePackContract(input)?.contract.frames.map((frame) => frame.thumb) ?? [];
    const layers = parseGloryFrameContract(input)?.contract.frames.flatMap(gloryFrameAssets) ?? [];
    return { refs: [...thumbs, ...layers], frames: thumbs.length, keys: [] };
  } catch {
    return NO_CONTRACT;
  }
}

/**
 * Lit les registres une fois, au démarrage. Aucun dossier de design trouvé ⇒
 * registres vides. Le registre d'exemples ne se lit que sous `PACK_SAMPLES=1`.
 */
export function loadPackIndex(
  candidates: readonly string[] = packDesignDirCandidates(),
  env: NodeJS.ProcessEnv = process.env,
  assetsDir: string = resolvePackAssetsDir(),
): PackIndex {
  const dir = candidates.find((candidate) => existsSync(candidate));
  if (dir === undefined) return EMPTY_PACK_INDEX;
  const files = packSamplesEnabled(env) ? [...REGISTRY_FILES, ...SAMPLE_REGISTRY_FILES] : REGISTRY_FILES;
  const registries = files.map((file) => readJson(join(dir, file)));
  const retained = readJson(join(dir, RETAINED_FILE));
  const contracts = new Map<string, ContractFiles>();
  const filesOf = (entry: PackIndexEntry): ContractFiles => {
    const key = `${entry.domain}.${entry.slug}`;
    const known = contracts.get(key) ?? contractFiles(assetsDir, entry);
    contracts.set(key, known);
    return known;
  };
  const index = buildPackIndex({
    registries: registries.map(({ value }) => value),
    retained: retained.value,
    contractRefs: (entry) => filesOf(entry).refs,
    contractItemCount: (entry) => filesOf(entry).frames,
    contractItemKeys: (entry) => filesOf(entry).keys,
  });
  const unreadable = [...registries, retained].filter((result) => result.unreadable).length;
  return { ...index, rejected: index.rejected + unreadable };
}

let startupIndex: PackIndex | undefined;
let liveOverrides: PackRegistryOverrides | undefined;

/** Le registre du DÉPÔT, lu une seule fois au démarrage — sans aucune surcharge d'administration. */
export function startupBasePackIndex(): PackIndex {
  startupIndex ??= loadPackIndex();
  return startupIndex;
}

/**
 * Les surcharges d'administration (#11275), une instance par processus, attachée
 * à la base par la première route qui la demande (l'administration du registre,
 * montée au démarrage, qui les charge avant que le serveur écoute). Tant qu'elles
 * ne sont pas lues, chaque pack du registre est servi masqué (fail-closed).
 */
export function liveRegistryOverrides(prisma: PackRegistryOverridesPrisma): PackRegistryOverrides {
  liveOverrides ??= new PackRegistryOverrides({ prisma });
  return liveOverrides;
}

/**
 * L'index SERVI : le registre du dépôt (toujours chargé) et, par-dessus, les
 * surcharges d'administration courantes (#11275) — masqué, ordre, prix,
 * fenêtre, ciblage. Partagé par la boutique, le magasin et la décoration.
 */
export function startupPackIndex(): PackIndex {
  const base = startupBasePackIndex();
  return overlayPackIndex(base, () => (liveOverrides === undefined ? new Map() : liveOverrides.snapshot()));
}
