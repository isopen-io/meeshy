import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * GARDE #6294 — tout double de `utils/withMutationLog` ÉTALE le module réel,
 * AVEC le cast.
 *
 * Une usine `jest.mock('…/utils/withMutationLog', () => ({ withMutationLog }))`
 * remplace le module ENTIER : `withMutationOutcome` et la classe
 * `MutationResultGone` y valent `undefined`. Le jour où une route adopte l'un
 * des deux, `instanceof undefined` ou l'appel d'`undefined` lèvent un
 * `TypeError` qui se déguise en 500 sur un chemin d'erreur sans rapport — #6293
 * l'a payé sur `error-format.test.ts`, un fichier étranger à l'idempotence.
 *
 * Et l'étalement doit être CASTÉ : `jest.requireActual` rend `unknown`, que
 * TypeScript refuse d'étaler (TS2698) — la forme non castée rend la suite
 * INCHARGEABLE, une garde muette de plus (leçon 600).
 *
 * La garde lit chaque usine JUSQU'À SA PARENTHÈSE FERMANTE, jamais par fenêtre
 * de lignes : le premier balayage de #6294 (`grep -A4`) comptait 42 fautifs
 * là où il y en avait 7, parce qu'un commentaire repoussait l'étalement hors de
 * sa fenêtre.
 */

const SRC = join(__dirname, '..', '..');
const FACTORY_START = /jest\.mock\(\s*'([^']*utils\/withMutationLog)'/g;

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(path).isDirectory()) return tsFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

/** Le texte de l'appel `jest.mock(...)` entier, de sa parenthèse ouvrante à la
 * fermante correspondante. */
function callBody(source: string, from: number): string {
  const open = source.indexOf('(', from);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

type Factory = { readonly site: string; readonly modulePath: string; readonly body: string };

function withMutationLogFactories(): readonly Factory[] {
  return tsFiles(SRC)
    .filter((file) => !file.endsWith('withMutationLog-mock-spread-guard.test.ts'))
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(FACTORY_START)].map((match) => ({
        site: `${relative(SRC, file)}:${source.slice(0, match.index).split('\n').length}`,
        modulePath: match[1] ?? '',
        body: callBody(source, match.index ?? 0),
      }));
    });
}

describe('les doubles de utils/withMutationLog étalent le module réel (#6294)', () => {
  const factories = withMutationLogFactories();

  /** Un scanner qui ne trouve RIEN rendrait la garde verte par vacuité
   * (`[].every(...) === true`) — elle doit d'abord prouver qu'elle voit. */
  it('le balayage trouve les usines du dépôt (plus de cinquante au 2026-09-13)', () => {
    expect(factories.length).toBeGreaterThanOrEqual(50);
  });

  it('chaque usine étale `jest.requireActual` du MÊME module, casté `as object` (ou passe par le harness)', () => {
    const offenders = factories
      .filter(({ body, modulePath }) => {
        if (body.includes('withMutationLogModule(')) return !body.includes(`jest.requireActual('${modulePath}') as object`);
        return !body.includes(`...(jest.requireActual('${modulePath}') as object)`);
      })
      .map(({ site }) => site);
    expect(offenders).toEqual([]);
  });
});
