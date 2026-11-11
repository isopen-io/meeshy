import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { allFiles } from '../../../scripts/lib/files.mjs';
import { auditKitRegistry, boardViewIds, candidatePaths, kitLotsOf } from '../../../scripts/lib/kit-registry-audit.mjs';

import { MeeshyKitCatalog } from './catalog';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const CAPTURES = join(ROOT, 'docs', 'product', 'kit', 'captures', 'web');

const registry = JSON.parse(readFileSync(join(ROOT, '.claude', 'workflows', 'meeshy-kit-planche.lots.json'), 'utf8')) as { readonly lots: readonly Record<string, unknown>[] };
const lots = kitLotsOf(registry);

const images = (): readonly string[] =>
  existsSync(CAPTURES) ? allFiles(CAPTURES).map((file) => relative(CAPTURES, file).split('\\').join('/')) : [];

describe('le registre du chantier face au catalogue web', () => {
  test('le catalogue porte les clés et les noms du registre, dans l’ordre', () => {
    expect(MeeshyKitCatalog.entries.map((entry) => entry.key)).toEqual(lots.map((lot) => lot.key));
    expect(MeeshyKitCatalog.entries.map((entry) => entry.name)).toEqual(lots.map((lot) => lot.name));
  });

  test('chaque lot est en règle : cible, témoin, vues de la planche et images', () => {
    const planche = readFileSync(join(ROOT, 'docs', 'product', 'composer-vue-finale', 'planche.html'), 'utf8');
    const existing = new Set(candidatePaths(lots).filter((path) => existsSync(join(ROOT, path))));
    const problems = auditKitRegistry({ lots, entries: MeeshyKitCatalog.entries, boardViewIds: boardViewIds(planche), disk: { existing, images: images() } });
    expect(problems).toEqual([]);
  });

  test('la table de la planche porte ses vues', () => {
    const planche = readFileSync(join(ROOT, 'docs', 'product', 'composer-vue-finale', 'planche.html'), 'utf8');
    const ids = boardViewIds(planche);
    for (const view of ['R1', 'R3', 'A2', 'O1', 'S1', 'P1', 'C1', 'I1']) expect(ids.has(view)).toBe(true);
  });

  test('le dossier du kit ne contient que des composants nommés par le registre', () => {
    const named = new Set(lots.map((lot) => lot.target.split('/').pop()));
    const kitDir = join(ROOT, 'apps', 'web', 'src', 'components', 'kit');
    const components = readdirSync(kitDir).filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx') && file !== 'meeshy-kit-catalog.tsx');
    expect(components.filter((file) => !named.has(file))).toEqual([]);
  });
});
