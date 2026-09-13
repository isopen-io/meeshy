/**
 * LE HELPER DE REJEU DES VECTEURS PARTAGÉS — extrait AVANT la quatrième copie
 * (#5696, étape 1). Port de `packages/shared/__tests__/vectors/harness.ts`
 * (`loadVectors:85-143`, `closeEnough:150-173`) : même contrat, sans la
 * dépendance à `vitest` (`describe`/`it`/`expect` importés de `vitest` là-bas
 * — inutilisables sous `bun test`, qui a ses propres globals).
 *
 * `sections.test.ts` et `activity.test.ts` lisent aujourd'hui leur fichier de
 * vecteurs par un `new URL(...)` recopié — une TROISIÈME copie du même
 * chemin. Ce fichier est le site UNIQUE qui l'écrit une quatrième fois pour
 * `river`, et les trois lecteurs existants restent tels quels dans ce lot
 * (périmètre #5696 § 9.7 — migration en suivi).
 *
 * Hors `src/lib/**` DÉLIBÉRÉMENT : aucun module de production ne doit
 * pouvoir l'importer par mégarde (il lit le système de fichiers, absent du
 * navigateur).
 */
import { readFileSync } from 'node:fs';

/** Tolérance par défaut pour la comparaison des nombres flottants. */
export const FLOAT_TOLERANCE = 1e-4;

/** Un cas de vecteur : `{ input, expected, _label? }` — `_label` est un descriptif court, jamais comparé. */
export type SharedVector<TInput = unknown, TExpected = unknown> = {
  readonly input: TInput;
  readonly expected: TExpected;
  readonly _label?: string;
};

const FIXTURES_DIR = new URL('../../../../packages/shared/fixtures/reading-modes/', import.meta.url);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isVectorLike = (value: unknown): value is { input: unknown; expected: unknown } =>
  isPlainObject(value) && 'input' in value && 'expected' in value;

const isVectorContainer = (value: unknown): value is { readonly vectors: unknown } =>
  isPlainObject(value) && 'vectors' in value;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Charge et valide `<name>.vectors.json` (`packages/shared/fixtures/reading-modes/`).
 *
 * Accepte le tableau nu historique ET `{ $format?, vectors: [...] }`. LÈVE
 * une erreur explicite — jamais un tableau vide silencieux (leçon 257) — si
 * le fichier est absent, le JSON invalide, la forme inattendue, ou le
 * tableau de cas VIDE.
 */
export function loadSharedVectors<TInput = unknown, TExpected = unknown>(
  name: string,
): ReadonlyArray<SharedVector<TInput, TExpected>> {
  const path = new URL(`${name}.vectors.json`, FIXTURES_DIR);

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (error) {
    throw new Error(
      `loadSharedVectors(${JSON.stringify(name)}) : fichier de vecteurs introuvable à ${path} — ${errorMessage(error)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`loadSharedVectors(${JSON.stringify(name)}) : JSON invalide dans ${path} — ${errorMessage(error)}`);
  }

  const cases: unknown = Array.isArray(parsed)
    ? parsed
    : isVectorContainer(parsed)
      ? parsed.vectors
      : undefined;

  if (cases === undefined) {
    throw new Error(
      `loadSharedVectors(${JSON.stringify(name)}) : ${path} doit contenir un tableau JSON de cas {input, expected}, ou un objet { $format?, vectors: [...] }, reçu ${typeof parsed}`,
    );
  }

  if (!Array.isArray(cases)) {
    throw new Error(
      `loadSharedVectors(${JSON.stringify(name)}) : ${path} — la clé "vectors" doit contenir un tableau JSON de cas, reçu ${typeof cases}`,
    );
  }

  if (cases.length === 0) {
    throw new Error(
      `loadSharedVectors(${JSON.stringify(name)}) : ${path} contient ZÉRO cas — une suite de vecteurs ne doit jamais charger zéro cas (leçon 257, jamais de vert silencieux)`,
    );
  }

  cases.forEach((entry, index) => {
    if (!isVectorLike(entry)) {
      throw new Error(`loadSharedVectors(${JSON.stringify(name)}) : le cas ${index} de ${path} n'est pas de la forme { input, expected }`);
    }
  });

  return cases as ReadonlyArray<SharedVector<TInput, TExpected>>;
}

/**
 * Comparaison profonde tolérante aux flottants (tolérance `tolerance`,
 * défaut `FLOAT_TOLERANCE`). Nombres comparés par différence absolue ;
 * objets/tableaux récursivement (ordre des clés indifférent) ; le reste par
 * `Object.is`.
 */
export function closeEnough(actual: unknown, expected: unknown, tolerance: number = FLOAT_TOLERANCE): boolean {
  if (typeof actual === 'number' && typeof expected === 'number') {
    if (Number.isNaN(actual) && Number.isNaN(expected)) return true;
    return Math.abs(actual - expected) <= tolerance;
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    return actual.length === expected.length && actual.every((item, index) => closeEnough(item, expected[index], tolerance));
  }

  if (isPlainObject(actual) && isPlainObject(expected)) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (actualKeys.length !== expectedKeys.length) return false;
    return actualKeys.every((key, index) => key === expectedKeys[index] && closeEnough(actual[key], expected[key], tolerance));
  }

  return Object.is(actual, expected);
}

/** Nom du test pour un cas : `case N — <_label>` quand `_label` est présent, `case N` sinon. */
export const sharedVectorTestName = (index: number, vector: SharedVector<unknown, unknown>): string =>
  vector._label ? `case ${index} — ${vector._label}` : `case ${index}`;
