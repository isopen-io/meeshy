// packages/shared/__tests__/ci/revision-drift-retry.test.ts
//
// #12595 — la veille horaire `revision-drift-check.yml` lit la révision que
// chaque cible sert. Le passage du 2026-10-24 à 05:27 UTC (run 40066352155)
// est tombé pendant le « Deploy to staging » de `docker.yml` : le conteneur du
// web était en train d'être recréé, Traefik a rendu 404, et `curl -f` a échoué
// au premier essai. La veille a rougi alors qu'aucune cible n'était périmée,
// et l'adresse rendait 200 quelques minutes plus tard.
//
// La lecture réessaie donc le temps d'un déploiement. `--retry` seul ne
// réessaie PAS un 404 (il ne retient que les erreurs dites transitoires) :
// `--retry-all-errors` est la moitié qui compte. Une cible vraiment absente
// rougit toujours, seulement une minute et demie plus tard.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const VEILLE = readFileSync(
  fileURLToPath(new URL('../../../../.github/workflows/revision-drift-check.yml', import.meta.url)),
  'utf8',
);

const lectures = VEILLE.split('\n').filter((ligne) => !/^\s*#/.test(ligne) && /\bcurl\b/.test(ligne));

const option = (ligne: string, nom: string): number => Number(new RegExp(`--${nom} (\\d+)`).exec(ligne)?.[1] ?? 0);

describe('la veille de révision servie', () => {
  it('lit la révision de chaque cible par curl', () => {
    expect(lectures.length).toBeGreaterThan(0);
  });

  it('réessaie une lecture qui tombe pendant un déploiement, 404 compris', () => {
    for (const ligne of lectures) {
      expect(ligne).toContain('--retry-all-errors');
    }
  });

  it('attend au moins la minute que Traefik met à router un conteneur recréé', () => {
    for (const ligne of lectures) {
      expect(option(ligne, 'retry') * option(ligne, 'retry-delay')).toBeGreaterThanOrEqual(60);
    }
  });
});
