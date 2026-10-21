// packages/shared/__tests__/ci/sdk-tests-shared-inputs.test.ts
//
// #11209 — un miroir Swift qui RELIT un fichier de `packages/shared` ne garde
// la parité que si `sdk-tests.yml` se déclenche quand ce fichier change.
// `sdk-tests.yml` filtre ses déclenchements par chemins : une PR qui ne touche
// que le TypeScript (une loi régénérée, une hiérarchie de rôles renumérotée)
// fusionne dans `dev` sans que le miroir rejoue, et la divergence ne rougit
// qu'à la PR SDK suivante, chez quelqu'un qui ne l'a pas causée.
//
// Ce garde ne RECOPIE aucune liste : il énumère les chemins `packages/shared/…`
// que les tests du SDK lisent, puis exige que les DEUX filtres (`push` et
// `pull_request`) les couvrent. Un témoin Swift neuf qui relit un fichier
// partagé le fait rougir le jour où il est écrit. Placement : la suite
// `shared` tourne sur CHAQUE PR — c'est la seule qui puisse constater
// l'absence, puisque `sdk-tests.yml`, par construction, ne tourne pas.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const WORKFLOW = readFileSync(join(REPO, '.github/workflows/sdk-tests.yml'), 'utf8');
const SDK_TESTS = join(REPO, 'packages/MeeshySDK/Tests');

const withoutComment = (line: string): string => line.replace(/\s+#.*$/, '');

/** Les entrées `paths:` du déclencheur `trigger` (`push`, `pull_request`), commentaires retirés. */
const pathsOf = (trigger: string): readonly string[] => {
  const lines = WORKFLOW.split('\n').filter((line) => !/^\s*#/.test(line)).map(withoutComment);
  const start = lines.findIndex((line) => line === `  ${trigger}:`);
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /^ {0,2}\S/.test(line));
  const block = lines.slice(start + 1, end < 0 ? lines.length : end);
  const pathsAt = block.findIndex((line) => /^ {4}paths:\s*$/.test(line));
  if (pathsAt < 0) return [];
  const after = block.slice(pathsAt + 1);
  const stop = after.findIndex((line) => !/^ {6}-\s/.test(line) && line.trim() !== '');
  return (stop < 0 ? after : after.slice(0, stop))
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.slice(1).trim().replace(/^['"]|['"]$/g, ''));
};

const swiftFiles = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return swiftFiles(path);
    return entry.name.endsWith('.swift') ? [path] : [];
  });

/**
 * Les chemins partagés que les tests du SDK LISENT : un littéral
 * `"packages/shared/…"` hors commentaire. Un littéral interpolé
 * (`"packages/shared/fixtures/action-policy/\(name)"`) désigne son répertoire,
 * rendu avec sa barre finale.
 */
const sharedInputs = (): readonly string[] => {
  const found = swiftFiles(SDK_TESTS).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .flatMap((line) => [...line.matchAll(/"(packages\/shared\/[^"\\]*)/g)].map((match) => match[1] ?? '')),
  );
  return [...new Set(found)].filter((path) => path.length > 0).sort();
};

/** `glob` couvre-t-il `input` ? Un répertoire (barre finale) n'est couvert que par un `…/**` qui le contient. */
const covers = (glob: string, input: string): boolean => {
  if (glob.endsWith('/**')) return input.startsWith(glob.slice(0, -2));
  return !input.endsWith('/') && glob === input;
};

describe('sdk-tests.yml rejoue les miroirs Swift quand le fichier partagé qu’ils relisent change', () => {
  const inputs = sharedInputs();

  it('les tests du SDK relisent des fichiers partagés (le garde n’est pas vide)', () => {
    expect(inputs).toContain('packages/shared/types/role-types.ts');
    expect(inputs).toContain('packages/shared/fixtures/action-policy/');
  });

  it.each(['push', 'pull_request'])('le filtre %s couvre chaque fichier partagé relu par un test du SDK', (trigger) => {
    const paths = pathsOf(trigger);
    expect(paths).toContain('packages/MeeshySDK/**');
    expect(inputs.filter((input) => !paths.some((glob) => covers(glob, input)))).toEqual([]);
  });

  it('push et pull_request filtrent sur les mêmes chemins', () => {
    expect([...pathsOf('pull_request')].sort()).toEqual([...pathsOf('push')].sort());
  });
});
