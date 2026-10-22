/**
 * `bun run glory-frames:check-versions [--baseline <réf git>] [--mutate lower-version]`
 * (#10278) — le cliquet des versions des packs de cadres de gloire.
 *
 * `generate:glory-frames` dérive la version de la valeur COMMITÉE : le témoin
 * de fraîcheur ne voit ni une version abaissée à la main, ni deux branches qui
 * montent chacune v1 en v2 avec deux contenus (la fusion garde un v2, l'autre a
 * été publié en staging sous le même numéro ; un client qui tient v2 ne se met
 * jamais à jour). Ce cliquet confronte le registre à DEUX références :
 *
 * - `retained.json` : une clé `glory-frame/<slug>@<n>` est une version QUITTÉE.
 *   Une version courante inférieure à n, ou égale pour d'autres fichiers, la
 *   réutilise (`reuses-retained`).
 * - la BASE (`--baseline origin/dev`, le registre tel que `dev` le sert) : une
 *   version plus basse redescend (`below-baseline`) ; une version égale pour
 *   une autre empreinte sert deux contenus sous un numéro (`reuses-baseline`).
 *
 * `--mutate lower-version` abaisse chaque version de 1 avant de vérifier : la
 * CI s'en sert pour prouver que le cliquet rougit. Sortie 1 sur violation,
 * 2 sur base illisible — jamais lue comme vide.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGISTRY_FILE, REPO_ROOT, readGloryFrameSources, servedFilesOf, type RegistryEntry } from './generate-glory-frames.js';

export const GLORY_FRAME_REGISTRY_PATH = 'packages/shared/design/glory-frames/packs.json';

export type VersionViolation =
  | { readonly kind: 'reuses-retained'; readonly slug: string; readonly version: number; readonly retained: number }
  | { readonly kind: 'below-baseline'; readonly slug: string; readonly version: number; readonly baseline: number }
  | { readonly kind: 'reuses-baseline'; readonly slug: string; readonly version: number };

export type VersionRatchetInput = {
  /** Le registre candidat (la branche). */
  readonly registry: readonly RegistryEntry[];
  readonly retained: Readonly<Record<string, readonly string[]>>;
  /** Le registre de référence (`origin/dev`) ; `null` quand il n'est pas confronté. */
  readonly baseline: readonly RegistryEntry[] | null;
  /** Les fichiers qu'une entrée sert, pour distinguer une restauration à l'identique d'une réutilisation. */
  readonly servedFilesOf: (entry: RegistryEntry) => readonly string[];
};

const RETAINED_KEY = /^glory-frame\/([a-z0-9-]+)@(\d+)$/;

/** Les versions quittées d'un slug, lues dans les clés de `retained.json`. */
export const retainedVersions = (retained: Readonly<Record<string, readonly string[]>>, slug: string): readonly { readonly version: number; readonly files: readonly string[] }[] =>
  Object.entries(retained).flatMap(([key, files]) => {
    const match = RETAINED_KEY.exec(key);
    return match !== null && match[1] === slug ? [{ version: Number(match[2]), files }] : [];
  });

const sameFiles = (left: readonly string[], right: readonly string[]): boolean => {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.length === sortedRight.length && sortedLeft.every((file, index) => file === sortedRight[index]);
};

const versionOf = (entry: RegistryEntry): number => entry.version ?? 1;

function retainedViolations(entry: RegistryEntry, input: VersionRatchetInput): readonly VersionViolation[] {
  const version = versionOf(entry);
  return retainedVersions(input.retained, entry.slug)
    .filter((quitted) => version < quitted.version || (version === quitted.version && !sameFiles(input.servedFilesOf(entry), quitted.files)))
    .map((quitted) => ({ kind: 'reuses-retained', slug: entry.slug, version, retained: quitted.version }));
}

function baselineViolations(entry: RegistryEntry, baseline: readonly RegistryEntry[] | null): readonly VersionViolation[] {
  const reference = baseline?.find((candidate) => candidate.slug === entry.slug);
  if (reference === undefined) return [];
  const version = versionOf(entry);
  const base = versionOf(reference);
  if (version < base) return [{ kind: 'below-baseline', slug: entry.slug, version, baseline: base }];
  if (version === base && entry.fingerprint !== reference.fingerprint) return [{ kind: 'reuses-baseline', slug: entry.slug, version }];
  return [];
}

/** Toutes les violations du registre candidat, dans l'ordre du registre ; vide ⇒ le cliquet tient. */
export const gloryFrameVersionViolations = (input: VersionRatchetInput): readonly VersionViolation[] =>
  input.registry.flatMap((entry) => [...retainedViolations(entry, input), ...baselineViolations(entry, input.baseline)]);

/** La mutation de preuve : chaque version abaissée de 1. */
export const lowerVersions = (registry: readonly RegistryEntry[]): readonly RegistryEntry[] => registry.map((entry) => ({ ...entry, version: versionOf(entry) - 1 }));

/** Lit le registre d'une référence git ; une base illisible est une erreur, jamais un registre vide. */
export function readBaselineRegistry(reference: string, show: (reference: string) => string): readonly RegistryEntry[] {
  const parsed = ((): unknown => {
    try {
      return JSON.parse(show(reference)) as unknown;
    } catch (error) {
      throw new Error(`base ${reference} illisible : ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
  if (!Array.isArray(parsed)) throw new Error(`base ${reference} : ${GLORY_FRAME_REGISTRY_PATH} n'est pas un tableau`);
  return parsed as readonly RegistryEntry[];
}

export const describeViolation = (violation: VersionViolation): string => {
  if (violation.kind === 'reuses-retained') return `${violation.slug}@${violation.version} réutilise une version quittée (retained.json tient ${violation.slug}@${violation.retained})`;
  if (violation.kind === 'below-baseline') return `${violation.slug}@${violation.version} redescend sous la base (${violation.slug}@${violation.baseline})`;
  return `${violation.slug}@${violation.version} porte une autre empreinte que la base sous le même numéro : régénérer sur la base (generate:glory-frames)`;
};

const argumentAfter = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const gitShow = (reference: string): string => execFileSync('git', ['show', `${reference}:${GLORY_FRAME_REGISTRY_PATH}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function main(): void {
  const sources = readGloryFrameSources();
  const versioned = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')) as readonly RegistryEntry[];
  const reference = argumentAfter('--baseline');
  const baseline = ((): readonly RegistryEntry[] | null => {
    if (reference === undefined) return null;
    try {
      return readBaselineRegistry(reference, gitShow);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(2);
    }
  })();
  const mutation = argumentAfter('--mutate');
  if (mutation !== undefined && mutation !== 'lower-version') throw new Error(`mutation inconnue : ${mutation}`);
  const registry = mutation === 'lower-version' ? lowerVersions(versioned) : versioned;
  const violations = gloryFrameVersionViolations({ registry, retained: sources.retained, baseline, servedFilesOf: (entry) => servedFilesOf(entry, sources.readStoredJson) });
  violations.forEach((violation) => process.stderr.write(`${describeViolation(violation)}\n`));
  process.stdout.write(`${registry.length} pack(s) vérifié(s) contre retained.json${reference === undefined ? '' : ` et ${reference}`}${mutation === undefined ? '' : ` (mutation ${mutation})`} : ${violations.length} violation(s)\n`);
  process.exit(violations.length === 0 ? 0 : 1);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
