// packages/shared/__tests__/ci/sdk-tests-record-commits.test.ts
//
// #17400 — `sdk-tests.yml` (`record_snapshots`) enregistre les références de
// capture sur le runtime qui juge, puis les publiait SEULEMENT en artefact. Les
// sessions des conteneurs ne peuvent pas télécharger un artefact (stockage
// refusé par le proxy) : les 40 références du verre du kit (K01) ont été
// enregistrées par la CI et ne sont jamais entrées au dépôt, et la tranche qui
// juge rougissait sur « No reference was found on disk ». `android.yml` avait
// déjà la réponse : sur une branche de travail, le job commit lui-même ce qu'il
// vient d'enregistrer ; sur `dev` et `main`, il ne publie que l'artefact.
//
// Ce garde tient la même règle pour le SDK iOS : la tranche a le droit d'écrire,
// le commit ne part que sur une branche de travail et seulement en mode
// `record_snapshots`, et il ne prend que des références de capture.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../../../.github/workflows/sdk-tests.yml', import.meta.url)),
  'utf8',
);

const withoutComments = (yaml: string): string =>
  yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const jobBlock = (yaml: string, job: string): string => {
  const lines = withoutComments(yaml).split('\n');
  const start = lines.findIndex((line) => line === `  ${job}:`);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^ {0,2}\S/.test(line));
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
};

const stepBlock = (job: string, name: string): string => {
  const steps = job.split(/\n(?= {6}- )/);
  return steps.find((step) => step.includes(`name: ${name}`)) ?? '';
};

const SHARD = jobBlock(WORKFLOW, 'sdk-test-shard');
const COMMIT = stepBlock(SHARD, 'Commit re-recorded snapshots');

describe('sdk-tests.yml commit les références de capture qu’il enregistre sur une branche de travail', () => {
  it('la tranche de tests a le droit d’écrire le contenu du dépôt', () => {
    expect(SHARD).toMatch(/\n {4}permissions:\n(?: {6}\S.*\n)*? {6}contents: write\n/);
  });

  it('le commit ne part qu’en mode record_snapshots, jamais sur dev ni main', () => {
    expect(COMMIT).not.toBe('');
    const condition = COMMIT.match(/\n {8}if: (.+)\n/)?.[1] ?? '';
    expect(condition).toContain('inputs.record_snapshots');
    expect(condition).toContain("github.ref_name != 'dev'");
    expect(condition).toContain("github.ref_name != 'main'");
  });

  it('le commit ne prend que des références de capture et pousse sur la branche dispatchée', () => {
    expect(COMMIT).toMatch(/git add -A -- 'packages\/MeeshySDK\/Tests\/\*\*\/__Snapshots__\/\*\*'/);
    expect(COMMIT).not.toMatch(/git add (?:-A|\.)\s*$/m);
    expect(COMMIT).toMatch(/git push (?:-q )?origin "HEAD:\$\{\{ github\.ref_name \}\}"/);
  });
});
