/**
 * Harnais commun pour les fichiers de vecteurs `packages/shared/fixtures/reading-modes/*.vectors.json`.
 *
 * Règle dure n°2 (leçon 257, workshop `tasks/lentille-workshop-execution.md` §3.3) :
 * un fichier de vecteurs absent, vide, ou une suite qui charge ZÉRO cas doit ÉCHOUER —
 * jamais de vert silencieux.
 *
 * @see tasks/lentille-focal-workshop.md §2.3
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/** Tolérance par défaut pour la comparaison des nombres flottants (workshop §2.3). */
export const FLOAT_TOLERANCE = 1e-4;

/** Un cas de vecteur : `{ input, expected }`. Les deux champs sont volontairement `unknown` — chaque loi typera son propre couple via les génériques de `loadVectors`/`runVectors`. */
export type Vector<TInput = unknown, TExpected = unknown> = {
  readonly input: TInput;
  readonly expected: TExpected;
};

export type LoadVectorsOptions = {
  /**
   * Répertoire de base dans lequel résoudre `<name>.vectors.json`.
   * Par défaut : `packages/shared/fixtures/reading-modes/`, résolu RELATIVEMENT
   * À CE FICHIER (jamais au cwd du process qui lance les tests).
   * Réservé aux tests du harnais lui-même (fixtures temporaires hors dépôt) —
   * les vrais fichiers de vecteurs ne doivent JAMAIS passer cette option.
   */
  readonly baseDir?: string;
};

const DEFAULT_FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'fixtures',
  'reading-modes',
);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isVectorLike = (value: unknown): value is { input: unknown; expected: unknown } =>
  isPlainObject(value) && 'input' in value && 'expected' in value;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Charge et valide un fichier de vecteurs `<name>.vectors.json`.
 *
 * LÈVE une erreur explicite (jamais un tableau vide silencieux) si :
 * - le fichier est absent ;
 * - le contenu n'est pas un JSON valide (fichier vide compris) ;
 * - le JSON n'est pas un tableau ;
 * - le tableau est vide (zéro cas — leçon 257) ;
 * - un élément du tableau n'est pas de la forme `{ input, expected }`.
 */
export function loadVectors<TInput = unknown, TExpected = unknown>(
  name: string,
  options: LoadVectorsOptions = {},
): ReadonlyArray<Vector<TInput, TExpected>> {
  const baseDir = options.baseDir ?? DEFAULT_FIXTURES_DIR;
  const path = join(baseDir, `${name}.vectors.json`);

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(
      `loadVectors(${JSON.stringify(name)}): fichier de vecteurs introuvable à ${path} — ${errorMessage(error)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `loadVectors(${JSON.stringify(name)}): JSON invalide dans ${path} — ${errorMessage(error)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `loadVectors(${JSON.stringify(name)}): ${path} doit contenir un tableau JSON de cas {input, expected}, reçu ${typeof parsed}`,
    );
  }

  if (parsed.length === 0) {
    throw new Error(
      `loadVectors(${JSON.stringify(name)}): ${path} contient ZÉRO cas — une suite de vecteurs ne doit jamais charger zéro cas (leçon 257, jamais de vert silencieux)`,
    );
  }

  parsed.forEach((entry, index) => {
    if (!isVectorLike(entry)) {
      throw new Error(
        `loadVectors(${JSON.stringify(name)}): le cas ${index} de ${path} n'est pas de la forme { input, expected }`,
      );
    }
  });

  return parsed as ReadonlyArray<Vector<TInput, TExpected>>;
}

/**
 * Comparaison profonde tolérante aux flottants (tolérance `tolerance`, défaut `FLOAT_TOLERANCE` = 1e-4).
 * Les nombres sont comparés par différence absolue ; objets et tableaux récursivement,
 * clé à clé (ordre des clés indifférent) ; tout le reste par `Object.is`.
 */
export function closeEnough(actual: unknown, expected: unknown, tolerance: number = FLOAT_TOLERANCE): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Number.isNaN(actual) && Number.isNaN(expected)) return true;
    return Math.abs(actual - expected) <= tolerance;
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    return (
      actual.length === expected.length &&
      actual.every((item, index) => closeEnough(item, expected[index], tolerance))
    );
  }

  if (isPlainObject(actual) && isPlainObject(expected)) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (actualKeys.length !== expectedKeys.length) return false;
    return actualKeys.every(
      (key, index) => key === expectedKeys[index] && closeEnough(actual[key], expected[key], tolerance),
    );
  }

  return Object.is(actual, expected);
}

/**
 * Déclare une suite `describe(name)` avec UN `it()` par cas chargé via `loadVectors(name)`,
 * comparant `run(input)` à `expected` via `closeEnough`. À appeler au niveau module d'un
 * fichier de test (le chargement — donc l'échec à zéro cas — a lieu à la collection des tests).
 */
export function runVectors<TInput, TExpected>(
  name: string,
  run: (input: TInput) => TExpected,
  options: LoadVectorsOptions = {},
): void {
  const vectors = loadVectors<TInput, TExpected>(name, options);

  describe(`vectors: ${name}`, () => {
    vectors.forEach((vector, index) => {
      it(`case ${index}`, () => {
        const actual = run(vector.input);
        const pass = closeEnough(actual, vector.expected);
        if (!pass) {
          throw new Error(
            [
              `case ${index} de "${name}" ne correspond pas :`,
              `  input:    ${JSON.stringify(vector.input)}`,
              `  expected: ${JSON.stringify(vector.expected)}`,
              `  actual:   ${JSON.stringify(actual)}`,
            ].join('\n'),
          );
        }
        expect(pass).toBe(true);
      });
    });
  });
}
