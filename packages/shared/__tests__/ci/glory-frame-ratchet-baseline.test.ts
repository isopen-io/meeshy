/**
 * Le cliquet des versions des packs de cadres (#10278) se confronte à la BRANCHE
 * CIBLE, jamais à `dev` figé. `ci.yml` se déclenche sur `main`, `dev` et
 * `develop` : une PR de correctif vers `main` — le seul chemin de production —
 * pendant que `dev` a monté une version rendrait `below-baseline` contre `dev`
 * et ferait tomber le job `quality` de `main` sur un dépôt correct. La base est
 * donc `github.base_ref` (PR) ou `github.ref_name` (push, dispatch).
 *
 * Même placement que `ios-pr-compile-gate.test.ts` : la suite `shared` tourne
 * sur chaque PR, c'est elle qui peut constater la dérive du workflow.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WORKFLOW_PATH = fileURLToPath(new URL('../../../../.github/workflows/ci.yml', import.meta.url));
const STEP_NAME = 'Versions des packs de cadres de gloire';

const withoutComments = (yaml: string): string =>
  yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const stepBody = (yaml: string, name: string): string => {
  const lines = yaml.split('\n');
  const start = lines.findIndex((line) => /^\s*- name:/.test(line) && line.includes(name));
  if (start === -1) return '';
  const end = lines.findIndex((line, index) => index > start && /^\s*- name:/.test(line));
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
};

const STEP = stepBody(withoutComments(readFileSync(WORKFLOW_PATH, 'utf8')), STEP_NAME);

describe('ci.yml — le cliquet des versions des packs de cadres lit la branche cible comme base', () => {
  it('l’étape existe au job quality', () => {
    expect(STEP).not.toBe('');
  });

  it('la base est github.base_ref (PR) ou github.ref_name (push, dispatch), jamais dev en dur', () => {
    expect(STEP).toMatch(/github\.base_ref\s*\|\|\s*github\.ref_name/);
    expect(STEP).not.toMatch(/origin dev\b/);
    expect(STEP).not.toMatch(/origin\/dev\b/);
  });

  it('la base récupérée est celle que le cliquet confronte, dans ses deux commandes', () => {
    expect(STEP).toMatch(/git fetch[^\n]*origin "\$\{?BASE_BRANCH\}?"/);
    expect(STEP.match(/--baseline "origin\/\$\{?BASE_BRANCH\}?"/g) ?? []).toHaveLength(2);
  });

  it('sous mutation, seule la sortie 1 (la preuve tient) passe : un plantage (2) ou une preuve incomplète (0) rougit l’étape', () => {
    const mutated = STEP.split('\n').find((line) => line.includes('--mutate lower-version')) ?? '';
    expect(mutated).toMatch(/\|\|\s*status=\$\?\s*$/);
    expect(STEP).toMatch(/\[\s*"\$status"\s+-ne\s+1\s*\]/);
    expect(STEP).not.toMatch(/^\s*if [^\n]*--mutate lower-version[^\n]*; then/m);
  });
});
