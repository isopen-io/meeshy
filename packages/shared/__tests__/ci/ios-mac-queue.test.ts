// packages/shared/__tests__/ci/ios-mac-queue.test.ts
//
// #9751 — les suites iOS complètes passent l'une après l'autre. La file
// (`scripts/ci/ios-mac-queue.mjs`) reconnaît une suite complète au NOM de ses
// jobs : si `ios.yml` renomme l'un d'eux sans elle, la file cesse de voir les
// suites des autres et laisse tout passer, sans rien rougir. Ce témoin juge la
// file sur des fixtures, puis les noms réellement posés par `ios.yml`.
//
// Placement : la suite `shared` tourne sur CHAQUE PR, comme ses voisins.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — module ESM JavaScript sans déclarations, exécuté tel quel par la CI
import { runsAhead, holdsMac, QUEUE_JOB } from '../../../../scripts/ci/ios-mac-queue.mjs';

type Job = { readonly name: string; readonly status: string };
type Run = { readonly id: number; readonly status: string };

const job = (name: string, status = 'in_progress'): Job => ({ name, status });
const run = (id: number, status = 'in_progress'): Run => ({ id, status });
const ahead = (runs: readonly Run[], jobs: ReadonlyArray<readonly [number, readonly Job[]]>): number[] =>
  runsAhead({ myRunId: 100, runs, jobsByRun: new Map(jobs) });

const IOS_YML = readFileSync(fileURLToPath(new URL('../../../../.github/workflows/ios.yml', import.meta.url)), 'utf8');

describe('file d’attente des suites iOS complètes', () => {
  it('une suite plus ancienne dont les tranches tournent passe devant', () => {
    expect(ahead([run(90)], [[90, [job('Build app (produits de test)', 'completed'), job('Tests unitaires — tranche 2')]]])).toEqual([90]);
  });

  it('une suite plus ancienne encore dans la file passe devant', () => {
    expect(ahead([run(90)], [[90, [job(QUEUE_JOB)]]])).toEqual([90]);
  });

  it('une suite plus ancienne dont les tranches attendent un Mac passe devant', () => {
    expect(ahead([run(90)], [[90, [job('Tests unitaires — tranche 4', 'queued')]]])).toEqual([90]);
  });

  it('une compilation seule ne bloque personne', () => {
    expect(ahead([run(90)], [[90, [job('Build app (app + cibles de test)'), job(`${QUEUE_JOB} (compilation seule)`, 'completed')]]])).toEqual([]);
  });

  it('un run plus récent ne bloque pas un run plus ancien', () => {
    expect(ahead([run(110)], [[110, [job('Tests unitaires — tranche 1')]]])).toEqual([]);
  });

  it('une suite dont il ne reste que le verdict ne bloque plus', () => {
    expect(ahead([run(90)], [[90, [job('Tests unitaires — tranche 1', 'completed'), job('Build app + tests unitaires')]]])).toEqual([]);
  });

  it('un run terminé ne bloque pas', () => {
    expect(ahead([run(90, 'completed')], [[90, [job('Tests unitaires — tranche 1')]]])).toEqual([]);
  });

  it('les suites devant sont rendues de la plus ancienne à la plus récente', () => {
    const tranche = [job('Tests unitaires — tranche 1')];
    expect(ahead([run(95), run(80)], [[95, tranche], [80, tranche]])).toEqual([80, 95]);
  });
});

describe('ios.yml pose les noms que la file reconnaît', () => {
  it('le job de file porte le nom de la file pour une suite complète', () => {
    expect(IOS_YML).toContain(`'${QUEUE_JOB.replace("'", "''")}' ||`);
  });

  it('le build des produits de test et les tranches portent les noms qui bloquent', () => {
    expect(IOS_YML).toContain("'Build app (produits de test)'");
    expect(IOS_YML).toMatch(/name: Tests unitaires — tranche \$\{\{ matrix\.\w+ \}\}/);
    expect(holdsMac([job('Build app (produits de test)')])).toBe(true);
    expect(holdsMac([job('Tests unitaires — tranche 3')])).toBe(true);
  });

  it('le build attend la file', () => {
    expect(IOS_YML).toMatch(/ios-build:\n {4}needs: \[scope, file-mac\]/);
  });
});
