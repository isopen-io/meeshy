import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LA GARDE DES `act()` ABANDONNÉS, PROUVÉE PAR SA REPRODUCTION (#9509).
 *
 * Trois fichiers, joués dans un `bun test` à part : un témoin qui dépasse son
 * délai DANS un `act`, un autre dont le corps abandonné rouvre des `act()`
 * pendant le fichier suivant, puis un fichier INNOCENT de témoins React
 * ordinaires. Ils portent l'extension `.fixture` : la suite ne les ramasse pas,
 * seul ce témoin les nomme.
 *
 * Le même trio est joué deux fois. Depuis le dossier des fixtures, où aucun
 * `bunfig.toml` ne précharge la garde : l'innocent tombe en entier — c'est la
 * cascade du 2026-10-06 (#9481), et la preuve que la reproduction reproduit.
 * Depuis la racine de l'application : l'innocent passe, et chaque coupable
 * tombe sous son nom, avec la ligne qui a ouvert l'`act`.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(HERE, '..', '..');
const FIXTURES = join(HERE, 'act-leak-fixtures');
const TRIO = ['1-depasse-dans-un-act.fixture.tsx', '2-corps-qui-survit.fixture.ts', '3-innocent.fixture.tsx'];

const runTrio = (cwd: string): string => {
  const run = spawnSync(process.execPath, ['test', ...TRIO.map((name) => join(FIXTURES, name))], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  });
  return `${run.stdout}${run.stderr}`;
};

const count = (output: string, verdict: 'pass' | 'fail'): number =>
  Number(new RegExp(`^\\s*(\\d+) ${verdict}$`, 'm').exec(output)?.[1] ?? Number.NaN);

describe('un témoin dépassé ne rougit plus les fichiers suivants', () => {
  test('sans la garde, le fichier innocent tombe en entier', () => {
    const output = runTrio(FIXTURES);
    expect(count(output, 'pass')).toBe(0);
    expect(count(output, 'fail')).toBe(5);
  }, 40_000);

  test('avec la garde, l’innocent passe et chaque coupable est nommé à sa ligne', () => {
    const output = runTrio(APP_ROOT);
    expect(count(output, 'pass')).toBe(3);
    expect(count(output, 'fail')).toBe(2);
    expect(output).toContain('ActLeftOpenError');
    expect(output).toContain(`${TRIO[0]}:`);
    expect(output).toContain('ActFromFinishedTestError');
    expect(output).toContain(`${TRIO[1]}:`);
    expect(output.includes('overlapping act()')).toBe(false);
  }, 40_000);
});
