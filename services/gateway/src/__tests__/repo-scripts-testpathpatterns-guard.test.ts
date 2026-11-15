/**
 * Le CLIQUET qui interdit le retour de `--testPathPattern` au singulier dans
 * les scripts npm du monorepo (#4443).
 *
 * Jest 30 a SUPPRIMÉ l'option `--testPathPattern` au profit de
 * `--testPathPatterns` (pluriel) — et il ne dégrade pas : il refuse de
 * démarrer, RC=1, avant même de résoudre un seul fichier de test :
 *
 * ```
 * Option "testPathPattern" was replaced by "--testPathPatterns".
 * "--testPathPatterns" is only available as a command-line option.
 * Please update your configuration.
 * ```
 *
 * `services/gateway/package.json` employait encore la forme au singulier dans
 * quatre scripts (`test:integration`, `test:e2ee`, `test:performance`,
 * `test:resilience`) : les quatre familles de tests qu'ils sélectionnent
 * étaient donc hors gate depuis le passage à Jest 30, et l'échec ressemblait à
 * une erreur de configuration plutôt qu'à une suite entière absente — c'est ce
 * qui l'a rendu invisible. La CI n'exécute que `test:coverage` (qui n'a jamais
 * porté la forme fautive), donc aucun rouge ne signalait la panne.
 *
 * ### Pourquoi balayer TOUT le monorepo, pas seulement le gateway
 *
 * Un témoin qui cherche dans UN fichier mesure ce fichier, pas la règle. La
 * régression peut réapparaître dans n'importe quel `package.json` du
 * workspace (`apps/*`, `services/*`, `packages/*`, la racine, `tests/`) : ce
 * cliquet les lit tous, pas seulement celui du gateway qui l'a portée.
 *
 * ### Portée : les scripts EXÉCUTABLES, pas la prose
 *
 * Le critère de #4443 dit « aucune occurrence ne subsiste dans le dépôt ». Ce
 * cliquet le lit comme « aucune commande que le dépôt EXÉCUTE », ce qui recouvre
 * DEUX familles et pas une :
 *
 * 1. le champ `scripts` de chaque `package.json` — ce que `bun run <nom>` invoque ;
 * 2. les scripts SHELL du dépôt — ce qu'un `./<script>.sh` invoque.
 *
 * La seconde famille n'est pas théorique : `tests/run-status-tests.sh`, exécutable
 * (mode 755), portait DIX occurrences de la forme au singulier — plus que les
 * quatre scripts du `package.json` du gateway qui ont motivé l'issue. Un cliquet
 * qui n'aurait lu que les `package.json` aurait viré au vert en laissant intact
 * le fichier le plus atteint : un balayage qui cherche à UN endroit mesure cet
 * endroit, pas la règle.
 *
 * Les journaux (`tasks/`) et la documentation (`docs/`, sous-dossiers compris)
 * portent des commandes historiques citées à titre d'exemple ; ce ne sont jamais
 * des commandes que le dépôt EXÉCUTE, donc elles restent hors du périmètre. Ce
 * fichier-ci est un `.ts` et la famille shell ne lit que les `.sh` : le cliquet
 * ne peut pas se voir lui-même et rougir sur sa propre expression régulière.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const REPO_ROOT = join(__dirname, '../../../..');

/** Dépendances et sorties de build : jamais des scripts écrits à la main. */
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

const findPackageJsonFiles = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return EXCLUDED_DIR_NAMES.has(entry.name) ? [] : findPackageJsonFiles(join(dir, entry.name));
    }
    return entry.name === 'package.json' ? [join(dir, entry.name)] : [];
  });

type PackageJsonScripts = Readonly<Record<string, string>>;

const isPackageJsonScripts = (value: unknown): value is PackageJsonScripts =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value as Record<string, unknown>).every((command) => typeof command === 'string');

/**
 * Lit le champ `scripts` d'un `package.json`. Un fichier généré (client
 * Prisma, par exemple) peut ne pas en avoir : l'absence n'est pas une
 * violation, `{}` la représente fidèlement.
 */
const readScripts = (path: string): PackageJsonScripts => {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const scripts = typeof parsed === 'object' && parsed !== null ? (parsed as { scripts?: unknown }).scripts : undefined;
  if (scripts === undefined) return {};
  if (!isPackageJsonScripts(scripts)) {
    throw new Error(`${path} a un champ "scripts" qui n'est pas un dictionnaire de chaînes.`);
  }
  return scripts;
};

/** Rejette le singulier sans jamais faire tomber le pluriel : négation directe. */
const SINGULAR_FLAG = /--testPathPattern(?!s)/;

type ScriptViolation = {
  readonly file: string;
  readonly scriptName: string;
  readonly command: string;
};

const findSingularFlagViolations = (packageJsonPaths: readonly string[]): readonly ScriptViolation[] =>
  packageJsonPaths.flatMap((path) =>
    Object.entries(readScripts(path))
      .filter(([, command]) => SINGULAR_FLAG.test(command))
      .map(([scriptName, command]) => ({ file: relative(REPO_ROOT, path), scriptName, command })),
  );

const SHELL_SCRIPT_SUFFIX = '.sh';

const findShellScripts = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return EXCLUDED_DIR_NAMES.has(entry.name) ? [] : findShellScripts(join(dir, entry.name));
    }
    return entry.name.endsWith(SHELL_SCRIPT_SUFFIX) ? [join(dir, entry.name)] : [];
  });

type ShellViolation = {
  readonly file: string;
  readonly line: number;
  readonly command: string;
};

const findShellFlagViolations = (shellPaths: readonly string[]): readonly ShellViolation[] =>
  shellPaths.flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .flatMap((command, index) =>
        SINGULAR_FLAG.test(command)
          ? [{ file: relative(REPO_ROOT, path), line: index + 1, command: command.trim() }]
          : [],
      ),
  );

describe('les scripts npm du monorepo ne réintroduisent jamais --testPathPattern au singulier (#4443)', () => {
  it('voit bien les package.json du monorepo — sinon un balayage vide passerait au vert', () => {
    expect(findPackageJsonFiles(REPO_ROOT).length).toBeGreaterThanOrEqual(10);
  });

  it("n'a aucun script qui invoque --testPathPattern au singulier, retiré par Jest 30", () => {
    const violations = findSingularFlagViolations(findPackageJsonFiles(REPO_ROOT));
    expect(violations).toEqual([]);
  });

  it('voit bien les scripts shell du monorepo — sinon un balayage vide passerait au vert', () => {
    expect(findShellScripts(REPO_ROOT).length).toBeGreaterThanOrEqual(10);
  });

  it("n'a aucun script shell qui invoque --testPathPattern au singulier (tests/run-status-tests.sh en portait dix)", () => {
    const violations = findShellFlagViolations(findShellScripts(REPO_ROOT));
    expect(violations).toEqual([]);
  });
});
