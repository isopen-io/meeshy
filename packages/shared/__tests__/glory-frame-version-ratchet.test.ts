/**
 * Cliquet : la version d'un pack de cadres de gloire ne redescend jamais et ne
 * sert jamais deux contenus (#10278).
 *
 * `generate:glory-frames` dérive la version de la valeur COMMITÉE (+1 quand
 * l'empreinte change) : le témoin de fraîcheur reste vert si on abaisse la
 * version à la main, et ne voit rien quand deux branches montent chacune v1 en
 * v2 avec deux contenus — la fusion garde un v2, l'autre a été publié en staging
 * sous le même numéro, et un client qui tient v2 ne se met jamais à jour.
 *
 * Deux références, deux refus :
 * - `retained.json` (`glory-frame/<slug>@<n>` = une version QUITTÉE) : une
 *   version courante ≤ n pour d'autres fichiers est une réutilisation ;
 * - le registre de `origin/dev` (la base) : une version plus basse, ou égale
 *   pour une autre empreinte, est une redescente ou une réutilisation.
 *
 * Le ROUGE est prouvé sous mutation (version abaissée de 1) contre une base qui
 * est le registre versionné lui-même — sans git. La CI rejoue la même preuve
 * contre `origin/dev` (`glory-frames:check-versions`).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGISTRY_FILE, REPO_ROOT, buildGloryFramePacks, readGloryFrameSources, servedFilesOf, type GloryFrameSources, type RegistryEntry } from '../scripts/generate-glory-frames';
import { GLORY_FRAME_REGISTRY_PATH, gloryFrameVersionViolations, lowerVersions, readBaselineRegistry } from '../scripts/glory-frame-version-ratchet';

const sources = readGloryFrameSources();
const versioned = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')) as readonly RegistryEntry[];
const filesOf = (entry: RegistryEntry): readonly string[] => servedFilesOf(entry, sources.readStoredJson);

const ref = (seed: string) => ({ src: `${seed.repeat(16).slice(0, 16)}.json`, bytes: 10, sha256: seed.repeat(64).slice(0, 64) });
const entry = (slug: string, version: number, fingerprint: string, files: readonly string[] = ['a']): RegistryEntry => ({
  slug,
  collections: [{ slug }],
  version,
  fingerprint,
  contract: ref(files[0] ?? 'a'),
  strings: Object.fromEntries(files.slice(1).map((file) => [`l${file}`, ref(file)])),
});
const fixtureFiles = (candidate: RegistryEntry): readonly string[] => [candidate.contract, ...Object.values(candidate.strings ?? {})].flatMap((asset) => (asset === undefined ? [] : [asset.src])).sort();

const baselineRef = ((): readonly RegistryEntry[] | null => {
  try {
    return readBaselineRegistry('origin/dev', (reference) => execFileSync('git', ['show', `${reference}:${GLORY_FRAME_REGISTRY_PATH}`], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
})();

describe('contre retained.json — une version quittée ne se réutilise pas', () => {
  const quitted = { [`glory-frame/neon@2`]: ['b'.repeat(16) + '.json'] };

  it('version égale à une version retenue, pour d’autres fichiers ⇒ réutilisation', () => {
    const registry = [entry('neon', 2, 'f2', ['a'])];
    expect(gloryFrameVersionViolations({ registry, retained: quitted, baseline: null, servedFilesOf: fixtureFiles })).toEqual([{ kind: 'reuses-retained', slug: 'neon', version: 2, retained: 2 }]);
  });

  it('version plus basse qu’une version retenue ⇒ réutilisation, quels que soient les fichiers', () => {
    const registry = [entry('neon', 1, 'f1', ['b'])];
    expect(gloryFrameVersionViolations({ registry, retained: quitted, baseline: null, servedFilesOf: fixtureFiles })).toEqual([{ kind: 'reuses-retained', slug: 'neon', version: 1, retained: 2 }]);
  });

  it('version égale pour les MÊMES fichiers (restauration à l’identique) ou plus haute ⇒ rien', () => {
    expect(gloryFrameVersionViolations({ registry: [entry('neon', 2, 'f2', ['b'])], retained: quitted, baseline: null, servedFilesOf: fixtureFiles })).toEqual([]);
    expect(gloryFrameVersionViolations({ registry: [entry('neon', 3, 'f3', ['a'])], retained: quitted, baseline: null, servedFilesOf: fixtureFiles })).toEqual([]);
  });

  it('une clé retenue d’un autre domaine ou sans version entière ne concerne pas les cadres', () => {
    const retained = { 'banner/neon@2': ['x'], 'glory-frame/neon@1-avant-11165': ['y'] };
    expect(gloryFrameVersionViolations({ registry: [entry('neon', 1, 'f1')], retained, baseline: null, servedFilesOf: fixtureFiles })).toEqual([]);
  });
});

describe('contre la base (origin/dev) — la version ne redescend pas et ne sert pas deux contenus', () => {
  const baseline = [entry('afrique', 2, 'base')];

  it('version plus basse que la base ⇒ redescente', () => {
    expect(gloryFrameVersionViolations({ registry: [entry('afrique', 1, 'base')], retained: {}, baseline, servedFilesOf: fixtureFiles })).toEqual([{ kind: 'below-baseline', slug: 'afrique', version: 1, baseline: 2 }]);
  });

  it('même version, autre empreinte ⇒ deux contenus sous un numéro (le cas des deux branches fusionnées)', () => {
    expect(gloryFrameVersionViolations({ registry: [entry('afrique', 2, 'autre')], retained: {}, baseline, servedFilesOf: fixtureFiles })).toEqual([{ kind: 'reuses-baseline', slug: 'afrique', version: 2 }]);
  });

  it('même version et même empreinte, version montée, ou pack neuf ⇒ rien', () => {
    expect(gloryFrameVersionViolations({ registry: [entry('afrique', 2, 'base')], retained: {}, baseline, servedFilesOf: fixtureFiles })).toEqual([]);
    expect(gloryFrameVersionViolations({ registry: [entry('afrique', 3, 'autre')], retained: {}, baseline, servedFilesOf: fixtureFiles })).toEqual([]);
    expect(gloryFrameVersionViolations({ registry: [entry('nouveau', 1, 'n')], retained: {}, baseline, servedFilesOf: fixtureFiles })).toEqual([]);
  });

  it('une base illisible est refusée, jamais lue comme vide', () => {
    expect(() => readBaselineRegistry('origin/dev', () => 'pas du json')).toThrow(/origin\/dev/);
    expect(() => readBaselineRegistry('origin/dev', () => '{"pas":"un tableau"}')).toThrow(/origin\/dev/);
  });
});

describe('le dépôt, tel qu’il est', () => {
  it('le registre versionné ne réutilise aucune version quittée', () => {
    expect(gloryFrameVersionViolations({ registry: versioned, retained: sources.retained, baseline: null, servedFilesOf: filesOf })).toEqual([]);
  });

  it.skipIf(baselineRef === null)('le registre versionné ne redescend pas sous origin/dev', () => {
    expect(gloryFrameVersionViolations({ registry: versioned, retained: sources.retained, baseline: baselineRef, servedFilesOf: filesOf })).toEqual([]);
  });

  it('ROUGE prouvé : chaque version abaissée de 1 tombe, nommée, contre la base', () => {
    const lowered = lowerVersions(versioned);
    expect(lowered.map((candidate) => candidate.version)).toEqual(versioned.map((candidate) => (candidate.version ?? 1) - 1));
    const violations = gloryFrameVersionViolations({ registry: lowered, retained: sources.retained, baseline: versioned, servedFilesOf: filesOf });
    expect(violations.map((violation) => `${violation.kind}:${violation.slug}`)).toEqual(versioned.map((candidate) => `below-baseline:${candidate.slug}`));
  });
});

describe('le générateur ne réémet jamais une version quittée', () => {
  const tweaked = (over: Partial<GloryFrameSources>): GloryFrameSources => ({ ...sources, ...over });
  const neon = versioned.find((candidate) => candidate.slug === 'neon') as RegistryEntry;

  it('empreinte inchangée mais version déjà retenue (fusion de deux branches) ⇒ la version saute au-dessus', () => {
    const retained = { ...sources.retained, [`glory-frame/neon@${neon.version}`]: ['0123456789abcdef.json'] };
    const after = buildGloryFramePacks(tweaked({ registry: versioned, retained })).registry.find((candidate) => candidate.slug === 'neon');
    expect(after?.version).toBe((neon.version ?? 1) + 1);
  });

  it('une version quittée déjà retenue garde ses fichiers ET reçoit ceux de l’autre contenu', () => {
    const key = `glory-frame/neon@${neon.version}`;
    const retained = { ...sources.retained, [key]: ['0123456789abcdef.json'] };
    const registry = versioned.map((candidate) => (candidate.slug === 'neon' ? { ...candidate, fingerprint: 'autre' } : candidate));
    const next = buildGloryFramePacks(tweaked({ registry, retained }));
    expect(next.retained[key]).toEqual([...new Set(['0123456789abcdef.json', ...filesOf(neon)])].sort());
    expect(next.registry.find((candidate) => candidate.slug === 'neon')?.version).toBe((neon.version ?? 1) + 1);
  });
});
