import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, test } from 'bun:test';

/**
 * **LE WEB NE TIRE JAMAIS `zod` CLASSIQUE PAR UN MODULE PARTAGÉ** (#18924,
 * constat 3 de l'audit adversarial de la passerelle). Le web décode avec
 * `zod/mini` ; un seul import À L'EXÉCUTION d'un module de `@meeshy/shared` qui
 * importe `zod` classique — `types/own-profile-sync.ts`, pour une fonction
 * d'arbitrage de quatre lignes — faisait passer le morceau partagé « zod » de
 * 8,69 à 18,21 Ko gzip, téléchargés à chaque démarrage (#17014 avait déjà payé
 * ce piège, #10904 l'avait réglé pour le jeu par `game-sync-order.ts`).
 *
 * La garde lit les sources : chaque import à l'exécution (statique, `export …
 * from`, `import()`) d'un fichier de `apps/web/src` hors témoins, suivi dans le
 * graphe des imports à l'exécution de `packages/shared`, ne doit jamais
 * atteindre `'zod'`. Les `import type` sont permis : ils ne partent pas dans le
 * paquet (`verbatimModuleSyntax` garde un `import { type X }`, d'où la règle
 * stricte).
 *
 * Seule l'ENTRÉE d'un Worker (`new Worker(new URL('./x.ts', import.meta.url))`)
 * n'est pas lue : Vite la construit à part, son graphe n'est pas celui de la
 * page, et le morceau « zod » que la page partage n'en porte rien — c'est la
 * décision du scellement partagé (#9899), qui valide son enveloppe par le
 * schéma `zod` du contrat. Les modules qu'une entrée importe restent lus.
 */

const WEB_SRC = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SHARED = resolve(WEB_SRC, '../../../packages/shared');

const filesUnder = (root: string): readonly string[] =>
  readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });

const isShippedWebSource = (path: string): boolean =>
  /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts') && !path.includes(join('src', 'test-support'));

const WORKER_ENTRY = /new\s+Worker\(\s*new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;

/** Les entrées de Worker que les sources livrées instancient : chacune est un paquet à part. */
const workerEntriesOf = (files: readonly string[]): ReadonlySet<string> =>
  new Set(files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(WORKER_ENTRY)].map((match) => resolve(dirname(file), match[1] ?? ''))));

const pageSources = (): readonly string[] => {
  const shipped = filesUnder(WEB_SRC).filter(isShippedWebSource);
  const workers = workerEntriesOf(shipped);
  return shipped.filter((file) => !workers.has(file));
};

type RuntimeImport = { readonly specifier: string; readonly line: number };

const STATIC_IMPORT = /(?:^|\n)[ \t]*(?:import|export)[ \t]+(?!type\b)(?:[^'";]*?[\s}*]from[ \t]*)?['"]([^'"\n]+)['"]/g;
const DYNAMIC_IMPORT = /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g;

function runtimeImportsOf(source: string): readonly RuntimeImport[] {
  const lineOf = (index: number): number => source.slice(0, index).split('\n').length;
  const found = (pattern: RegExp): readonly RuntimeImport[] =>
    [...source.matchAll(pattern)].map((match) => ({ specifier: match[1] ?? '', line: lineOf((match.index ?? 0) + match[0].indexOf(match[1] ?? '')) }));
  return [...found(STATIC_IMPORT), ...found(DYNAMIC_IMPORT)];
}

const resolveTs = (base: string): string | undefined => [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((candidate) => existsSync(candidate));

const sharedFileOf = (specifier: string): string | undefined => {
  if (specifier === '@meeshy/shared') return resolveTs(join(SHARED, 'index'));
  if (!specifier.startsWith('@meeshy/shared/')) return undefined;
  return resolveTs(join(SHARED, specifier.slice('@meeshy/shared/'.length).replace(/\.js$/, '')));
};

const isClassicZod = (specifier: string): boolean => specifier === 'zod' || specifier === 'zod/v4' || specifier === 'zod/v3';

/** Le chemin, dans `packages/shared`, par lequel `file` atteint `zod` classique à l'exécution ; `null` s'il ne l'atteint pas. */
function classicZodChain(file: string, memo: Map<string, readonly string[] | null> = new Map()): readonly string[] | null {
  const known = memo.get(file);
  if (known !== undefined || memo.has(file)) return known ?? null;
  memo.set(file, null);
  const imports = runtimeImportsOf(readFileSync(file, 'utf8'));
  const chain = imports.reduce<readonly string[] | null>((reached, { specifier }) => {
    if (reached !== null) return reached;
    if (isClassicZod(specifier)) return [file];
    if (!specifier.startsWith('.')) return null;
    const next = resolveTs(resolve(dirname(file), specifier.replace(/\.js$/, '')));
    const below = next === undefined ? null : classicZodChain(next, memo);
    return below === null ? null : [file, ...below];
  }, null);
  memo.set(file, chain);
  return chain;
}

const repo = (path: string): string => relative(resolve(WEB_SRC, '../../..'), path);

function offendersOf(files: readonly string[]): readonly string[] {
  const memo = new Map<string, readonly string[] | null>();
  return files.flatMap((file) =>
    runtimeImportsOf(readFileSync(file, 'utf8')).flatMap(({ specifier, line }) => {
      if (isClassicZod(specifier)) return [`${repo(file)}:${line} → zod`];
      const shared = sharedFileOf(specifier);
      const chain = shared === undefined ? null : classicZodChain(shared, memo);
      return chain === null ? [] : [`${repo(file)}:${line} → ${chain.map(repo).join(' → ')} → zod`];
    }),
  );
}

describe('le web ne tire jamais zod classique par un module partagé (#18924)', () => {
  test('aucun fichier livré de apps/web/src n’importe à l’exécution un module de @meeshy/shared qui atteint zod classique', () => {
    expect(offendersOf(pageSources())).toEqual([]);
  });

  test('une entrée de Worker est un paquet à part : elle seule n’est pas lue', () => {
    const shipped = filesUnder(WEB_SRC).filter(isShippedWebSource);
    const seal = join(WEB_SRC, 'lib', 'device-translation', 'shared-translation-seal-worker.ts');

    expect(workerEntriesOf(shipped).has(seal)).toBe(true);
    expect(pageSources()).not.toContain(seal);
    expect(pageSources()).toContain(join(WEB_SRC, 'lib', 'device-translation', 'seal-protocol.ts'));
  });

  test('la garde voit un module qui importe zod classique, et ne voit rien dans un import type ni dans zod/mini', () => {
    expect(classicZodChain(join(SHARED, 'types', 'own-profile-sync.ts'))).not.toBeNull();
    expect(runtimeImportsOf("import type { A } from '@meeshy/shared/types/own-profile-sync';\nexport type { B } from 'zod';").map((i) => i.specifier)).toEqual([]);
    expect(
      runtimeImportsOf("import * as z from 'zod/mini';\nimport {\n  a,\n  type B,\n} from '@meeshy/shared/types/x';\nexport * from './y.js';\nconst m = import('./lazy');").map((i) => i.specifier),
    ).toEqual(['zod/mini', '@meeshy/shared/types/x', './y.js', './lazy']);
  });
});
