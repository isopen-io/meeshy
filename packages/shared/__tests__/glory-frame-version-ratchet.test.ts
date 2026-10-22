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
 * - le registre de la BASE (la branche cible) : une version plus basse, ou
 *   égale pour une autre empreinte, est une redescente ou une réutilisation.
 *
 * Ce fichier ne touche pas git : le ROUGE est prouvé sous mutation (version
 * abaissée de 1) contre une base qui est le registre versionné lui-même, et la
 * preuve est la MÊME fonction que la CLI applique (`lowerVersionProofHolds`).
 * La confrontation à la vraie base est l'affaire de la CLI, au job `quality`
 * de la CI (`glory-frames:check-versions --baseline origin/<branche cible>`) —
 * le job `test` fait un checkout à profondeur 1, sans la base, et un témoin qui
 * s'y sauterait en silence ne prouverait rien.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { REGISTRY_FILE, buildGloryFramePacks, readGloryFrameSources, servedFilesOf, type GloryFrameSources, type RegistryEntry } from '../scripts/generate-glory-frames';
import { gloryFrameVersionViolations, lowerVersionProofHolds, lowerVersions, readBaselineRegistry } from '../scripts/glory-frame-version-ratchet';

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

describe('contre la base (la branche cible) — la version ne redescend pas et ne sert pas deux contenus', () => {
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
    expect(() => readBaselineRegistry('origin/main', () => 'pas du json')).toThrow(/origin\/main/);
    expect(() => readBaselineRegistry('origin/main', () => '{"pas":"un tableau"}')).toThrow(/origin\/main/);
  });
});

describe('la preuve de ROUGE : chaque version abaissée de 1 tombe, nommée, contre la base', () => {
  const proof = (registry: readonly RegistryEntry[], retained: GloryFrameSources['retained']) => {
    const violations = gloryFrameVersionViolations({ registry: lowerVersions(registry), retained, baseline: registry, servedFilesOf: filesOf });
    return { violations, holds: lowerVersionProofHolds({ registry, violations }) };
  };

  it('le dépôt, tel qu’il est : la preuve tient', () => {
    expect(lowerVersions(versioned).map((candidate) => candidate.version)).toEqual(versioned.map((candidate) => (candidate.version ?? 1) - 1));
    expect(proof(versioned, sources.retained).holds).toBe(true);
  });

  it('après un bump réel (un pack monté, sa version quittée dans retained.json), la preuve tient encore : la réutilisation nommée en plus ne la défait pas', () => {
    const neon = versioned.find((candidate) => candidate.slug === 'neon') as RegistryEntry;
    const bumped = versioned.map((candidate) => (candidate.slug === 'neon' ? { ...candidate, version: (neon.version ?? 1) + 1 } : candidate));
    const retained = { ...sources.retained, [`glory-frame/neon@${neon.version ?? 1}`]: ['0123456789abcdef.json'] };
    const { violations, holds } = proof(bumped, retained);
    expect(violations).toContainEqual({ kind: 'reuses-retained', slug: 'neon', version: neon.version ?? 1, retained: neon.version ?? 1 });
    expect(holds).toBe(true);
  });

  it('un pack que la mutation ne fait pas tomber, nommé à sa version, défait la preuve', () => {
    const registry = [entry('afrique', 2, 'a'), entry('neon', 2, 'n')];
    const violations = [{ kind: 'below-baseline', slug: 'afrique', version: 1, baseline: 2 }] as const;
    expect(lowerVersionProofHolds({ registry, violations })).toBe(false);
    expect(lowerVersionProofHolds({ registry, violations: [...violations, { kind: 'below-baseline', slug: 'neon', version: 1, baseline: 2 }] })).toBe(true);
    expect(lowerVersionProofHolds({ registry, violations: [...violations, { kind: 'reuses-baseline', slug: 'neon', version: 1 }] })).toBe(false);
  });

  it('le registre versionné ne réutilise aucune version quittée', () => {
    expect(gloryFrameVersionViolations({ registry: versioned, retained: sources.retained, baseline: null, servedFilesOf: filesOf })).toEqual([]);
  });
});

describe('le générateur ne réémet jamais une version quittée', () => {
  const tweaked = (over: Partial<GloryFrameSources>): GloryFrameSources => ({ ...sources, ...over });
  const neon = versioned.find((candidate) => candidate.slug === 'neon') as RegistryEntry;
  const neonOf = (generated: ReturnType<typeof buildGloryFramePacks>) => generated.registry.find((candidate) => candidate.slug === 'neon');

  it('empreinte inchangée mais version déjà retenue (fusion de deux branches) ⇒ la version saute au-dessus', () => {
    const retained = { ...sources.retained, [`glory-frame/neon@${neon.version}`]: ['0123456789abcdef.json'] };
    expect(neonOf(buildGloryFramePacks(tweaked({ registry: versioned, retained })))?.version).toBe((neon.version ?? 1) + 1);
  });

  it('une version quittée déjà retenue garde ses fichiers ET reçoit ceux de l’autre contenu', () => {
    const key = `glory-frame/neon@${neon.version}`;
    const retained = { ...sources.retained, [key]: ['0123456789abcdef.json'] };
    const registry = versioned.map((candidate) => (candidate.slug === 'neon' ? { ...candidate, fingerprint: 'autre' } : candidate));
    const next = buildGloryFramePacks(tweaked({ registry, retained }));
    expect(next.retained[key]).toEqual([...new Set(['0123456789abcdef.json', ...filesOf(neon)])].sort());
    expect(neonOf(next)?.version).toBe((neon.version ?? 1) + 1);
  });

  describe('contre la base : deux branches ont chacune monté neon en v2, chacune a quitté v1 — aucune n’a retenu @2 (la branche porte le contenu courant, la base un autre)', () => {
    const onBranch: RegistryEntry = { ...neon, version: (neon.version ?? 1) + 1 };
    const onBase: RegistryEntry = { ...onBranch, fingerprint: 'empreinte-de-la-base', contract: ref('d') };
    const branchRegistry = versioned.map((candidate) => (candidate.slug === 'neon' ? onBranch : candidate));
    const baseRegistry = versioned.map((candidate) => (candidate.slug === 'neon' ? onBase : candidate));
    const retained = { ...sources.retained, [`glory-frame/neon@${neon.version}`]: filesOf(neon) };

    it('sans base, la régénération garde v2 : seule la confrontation à la base (reuses-baseline) le voit', () => {
      expect(neonOf(buildGloryFramePacks(tweaked({ registry: branchRegistry, retained })))?.version).toBe((neon.version ?? 1) + 1);
    });

    it('avec la base, la régénération part de l’entrée de la base : v3, et les fichiers du v2 de la base entrent dans retained.json', () => {
      const next = buildGloryFramePacks(tweaked({ registry: branchRegistry, retained, baseline: baseRegistry }));
      expect(neonOf(next)?.version).toBe((neon.version ?? 1) + 2);
      expect(next.retained[`glory-frame/neon@${(neon.version ?? 1) + 1}`]).toEqual(filesOf(onBase));
      expect(next.retained[`glory-frame/neon@${neon.version}`]).toEqual(filesOf(neon));
    });

    it('avec la base, le cas nominal ne change pas : une branche montée au-dessus d’une base restée en place garde son numéro', () => {
      const next = buildGloryFramePacks(tweaked({ registry: versioned, retained: sources.retained, baseline: versioned }));
      expect(next.registry.map((candidate) => [candidate.slug, candidate.version])).toEqual(versioned.map((candidate) => [candidate.slug, candidate.version]));
      expect(next.retained).toEqual(sources.retained);
    });

    it('un pack que la base ne connaît pas se régénère depuis sa propre entrée', () => {
      const next = buildGloryFramePacks(tweaked({ registry: branchRegistry, retained, baseline: baseRegistry.filter((candidate) => candidate.slug !== 'neon') }));
      expect(neonOf(next)?.version).toBe((neon.version ?? 1) + 1);
    });
  });
});
