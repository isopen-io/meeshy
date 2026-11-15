/**
 * Le CLIQUET **C** de #6160 — le nombre de suites que `jest.config.json`
 * COLLECTE ne peut que monter.
 *
 * #6157 a montré qu'une suite du gateway pouvait cesser d'être comptée sans
 * qu'aucun test ne rougisse : `Tests: 24043 passed, 24043 total` dans un job
 * ROUGE — le corpus avait rétréci en silence, et rien ne le disait puisque le
 * total lui-même ne baissait pas plus vite que le nombre de suites qui
 * l'alimentaient. #6160 en tire trois gates indépendants ; celui-ci est le
 * **C**, « le moins cher des trois, et il couvre le cas VERT » :
 *
 * > Un cliquet sur le nombre de suites CHARGÉES (ou de tests exécutés)
 * > attrape toutes les suites qui cessent d'être collectées — y compris
 * > celles qu'un `testPathIgnorePatterns` avale, cas où le job reste VERT.
 *
 * ## Pourquoi mesurer via `jest --listTests`, pas un parcours de fichiers
 *
 * `jest-ci-hidden-suites.test.ts` garde la LISTE DÉCLARÉE de
 * `testPathIgnorePatterns` — il rougit si un chemin de plus y entre sans
 * être nommé. Il ne voit rien d'autre : un `testMatch` resserré, une
 * extension renommée, un fichier déplacé hors de `src/`, ou toute autre
 * façon dont Jest cesserait de COLLECTER une suite sans que la déclaration
 * ne change. `--listTests` interroge Jest lui-même, avec la configuration
 * RÉELLE de la CI (`jest.config.json`) — c'est la même résolution que celle
 * qu'exécute `bun run test:coverage`, mesurée à sa propre frontière plutôt
 * que reconstruite à la main à côté d'elle.
 *
 * ## Ce que ce cliquet fait, et ce qu'il ne fait pas
 *
 * Il ne prouve pas qu'une suite collectée s'exécute jusqu'au bout — une
 * suite qui échoue à COMPILER fait déjà rougir `jest` par un autre chemin
 * (code de sortie non nul, cf. #6157 sur le `TS2305` qui n'était pas dans les
 * codes muets). Il prouve seulement que le nombre de fichiers que Jest
 * ACCEPTE de charger ne redescend jamais sous son plancher mesuré — le
 * symptôme précis de #6157, où rien d'autre n'avait bougé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { join } from 'path';

const GATEWAY_ROOT = join(__dirname, '../..');

/**
 * Mesuré le 2026-09-12, HEAD `634b9049b8`, via
 * `jest --config=jest.config.json --listTests`. Un plancher, jamais une
 * égalité : ajouter des suites le fait monter sans faire rougir ce test.
 */
const PLANCHER_SUITES_CHARGEES = 1253;

const suitesChargees = (): number => {
  const sortie = execFileSync(
    join(GATEWAY_ROOT, 'node_modules', '.bin', 'jest'),
    ['--config=jest.config.json', '--listTests'],
    { cwd: GATEWAY_ROOT, encoding: 'utf8' }
  );

  return sortie.split('\n').filter((ligne) => ligne.trim().length > 0).length;
};

describe('le nombre de suites que jest.config.json COLLECTE ne peut que monter (#6160)', () => {
  // Une commande cassée (mauvais chemin de binaire, config introuvable) rendrait
  // une sortie vide — donc zéro suite — et passerait au vert pour la pire des
  // raisons si on ne bornait pas la mesure elle-même.
  it('la commande voit bien un corpus substantiel — sinon une mesure vide passerait au vert', () => {
    expect(suitesChargees()).toBeGreaterThan(300);
  });

  it('ne redescend jamais sous le plancher mesuré', () => {
    expect(suitesChargees()).toBeGreaterThanOrEqual(PLANCHER_SUITES_CHARGEES);
  });
});
