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

/**
 * Un cas de vecteur : `{ input, expected, _label? }`. `input`/`expected` sont
 * volontairement `unknown` — chaque loi typera son propre couple via les
 * génériques de `loadVectors`/`runVectors`. `_label` (RÉSERVE 8, revue
 * REV-1) est un descriptif court FACULTATIF, purement pour le nommage du
 * test (`runVectors`) — jamais comparé, jamais lu par une loi.
 */
export type Vector<TInput = unknown, TExpected = unknown> = {
  readonly input: TInput;
  readonly expected: TExpected;
  readonly _label?: string;
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

/**
 * Forme d'en-tête (RÉSERVE 6, revue REV-1) : `{ $format?, vectors: [...] }`.
 * Rétrocompatible avec le tableau nu historique — n'entre en jeu QUE si le
 * JSON top-level est un objet portant une clé `vectors`, jamais pour les
 * fichiers existants (tous des tableaux nus). `$format` n'est pas validée
 * ici : c'est une note libre pour le lecteur humain/miroir (forme canonique,
 * provenance), jamais consommée par la loi ni comparée par le harnais.
 */
const isVectorContainer = (value: unknown): value is { readonly vectors: unknown } =>
  isPlainObject(value) && 'vectors' in value;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Charge et valide un fichier de vecteurs `<name>.vectors.json`.
 *
 * Accepte deux formes au niveau racine :
 * - le tableau nu historique `[{ input, expected }, ...]` ;
 * - un objet d'en-tête `{ $format?, vectors: [{ input, expected }, ...] }`
 *   (RÉSERVE 6) — `$format` documente la forme canonique attendue et la
 *   provenance du fichier, à côté du tableau réel des cas.
 *
 * LÈVE une erreur explicite (jamais un tableau vide silencieux) si :
 * - le fichier est absent ;
 * - le contenu n'est pas un JSON valide (fichier vide compris) ;
 * - le JSON n'est ni un tableau, ni un objet `{ vectors: [...] }` ;
 * - le tableau de cas (nu ou sous `vectors`) est vide (zéro cas — leçon 257) ;
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

  const cases: unknown = Array.isArray(parsed)
    ? parsed
    : isVectorContainer(parsed)
      ? parsed.vectors
      : undefined;

  if (cases === undefined) {
    throw new Error(
      `loadVectors(${JSON.stringify(name)}): ${path} doit contenir un tableau JSON de cas {input, expected}, ou un objet { $format?, vectors: [...] }, reçu ${typeof parsed}`,
    );
  }

  if (!Array.isArray(cases)) {
    throw new Error(
      `loadVectors(${JSON.stringify(name)}): ${path} — la clé "vectors" doit contenir un tableau JSON de cas {input, expected}, reçu ${typeof cases}`,
    );
  }

  if (cases.length === 0) {
    throw new Error(
      `loadVectors(${JSON.stringify(name)}): ${path} contient ZÉRO cas — une suite de vecteurs ne doit jamais charger zéro cas (leçon 257, jamais de vert silencieux)`,
    );
  }

  cases.forEach((entry, index) => {
    if (!isVectorLike(entry)) {
      throw new Error(
        `loadVectors(${JSON.stringify(name)}): le cas ${index} de ${path} n'est pas de la forme { input, expected }`,
      );
    }
  });

  return cases as ReadonlyArray<Vector<TInput, TExpected>>;
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
 * Nom du test pour un cas : `case N — <_label>` quand `_label` est présent
 * (RÉSERVE 8, revue REV-1 — un miroir Swift/Kotlin rouge dit enfin QUOI a
 * cassé, pas seulement un index), `case N` sinon — rétrocompatible avec
 * toute fixture qui n'a jamais porté `_label`.
 */
export const caseTestName = (index: number, vector: Vector<unknown, unknown>): string =>
  vector._label ? `case ${index} — ${vector._label}` : `case ${index}`;

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
      it(caseTestName(index, vector), () => {
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
