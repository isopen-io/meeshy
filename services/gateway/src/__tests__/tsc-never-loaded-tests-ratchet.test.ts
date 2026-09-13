/**
 * Le CLIQUET **A** de #6160 — les erreurs de typecheck des fichiers de test
 * que ts-jest ne TYPECHECK qu'à la demande (au moment où une suite les
 * charge) ne peuvent que diminuer.
 *
 * #6160 a mesuré trois couches, pas deux :
 *
 * | couche | ce qu'elle couvre |
 * |---|---|
 * | `tsc --noEmit` (`tsconfig.json`) | exclut tous les tests |
 * | ts-jest (`tsconfig.test.json`) | les tests, mais seulement les fichiers qu'une EXÉCUTION charge, et sourd à quatre codes (`diagnostics.ignoreCodes`) |
 * | personne | les fichiers de test qu'aucune exécution ne charge |
 *
 * Gate **C** (`jest-suite-count-ratchet.test.ts`) garde le nombre de suites
 * COLLECTÉES. Gate **A** garde une propriété différente et complémentaire :
 * `tsc -p tsconfig.test.json --noEmit` voit TOUS les fichiers de test, qu'une
 * suite les charge ou non — c'est le seul typecheck qui atteint les fichiers
 * exclus par `testPathIgnorePatterns` (e2ee, integration, resilience,
 * performance, notifications-*, password-reset, dma-interoperability…) et
 * ceux qu'un test vivant n'importe jamais.
 *
 * ## Pourquoi filtrer quatre codes, et lesquels
 *
 * `jest.config.json` musèle `[2322, 2339, 2345, 2740]` pour ts-jest — des
 * mocks partiels passés là où un type complet est attendu, le motif normal
 * d'un test (#6160, gate B, non traité ici). Les compter ferait de ce
 * cliquet un gate sur 14000+ erreurs qui ne prédisent rien à l'exécution.
 * `TS2307` (module introuvable) a été retiré de cette liste par #6252 —
 * c'est le seul des cinq qui prédit une panne de CHARGEMENT — et n'est donc
 * plus filtré ici : ses 19 occurrences ont toutes été soldées.
 *
 * Mesuré le 2026-09-13, HEAD `a0be0e79`, via
 * `tsc -p tsconfig.test.json --noEmit --pretty false`, en ne gardant que les
 * lignes d'erreur dont le code n'est PAS l'un des quatre muets : **92**.
 *
 * ## Ce que ce cliquet ne fait pas
 *
 * Il ne dit pas que les 92 erreurs restantes sont fausses — la plupart
 * signalent une suite dont le sujet a bougé (#6160, leçon 588 : « cette
 * suite garde-t-elle encore quelque chose, ou son sujet a-t-il déménagé ? »)
 * et qui doit être rejugée fichier par fichier, pas mécaniquement. Ce
 * cliquet empêche seulement que ce nombre CROISSE en silence pendant que ce
 * solde reste à faire.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { execFileSync } from 'child_process';
import { join } from 'path';

const GATEWAY_ROOT = join(__dirname, '../..');

/** Les quatre codes que `jest.config.json` musèle pour ts-jest (gate B, non traité ici). */
const CODES_MUETS = new Set(['TS2322', 'TS2339', 'TS2345', 'TS2740']);

/**
 * Plancher jamais dépassé, jamais un plancher à atteindre : baisser ce
 * nombre en soldant une suite est encouragé et attendu ; le remonter ne
 * l'est jamais.
 */
const PLAFOND_ERREURS_NON_MUETTES = 92;

const typecheckDesTests = (): string => {
  try {
    return execFileSync(
      join(GATEWAY_ROOT, 'node_modules', '.bin', 'tsc'),
      ['-p', 'tsconfig.test.json', '--noEmit', '--pretty', 'false'],
      { cwd: GATEWAY_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (erreur) {
    // `tsc` sort en erreur (code 2) dès qu'il trouve au moins un diagnostic —
    // c'est le cas nominal ici, jamais une panne de la commande elle-même.
    const e = erreur as { stdout?: string };
    return e.stdout ?? '';
  }
};

const compterErreursNonMuettes = (texte: string): number =>
  texte
    .split('\n')
    .filter((ligne) => {
      const match = ligne.match(/^src\/.+\(\d+,\d+\): error (TS\d+)/);
      return match !== null && !CODES_MUETS.has(match[1]);
    }).length;

describe('le nombre d\'erreurs de typecheck hors codes muets, sur TOUS les fichiers de test (#6160, gate A)', () => {
  // Une seule exécution de `tsc` (≈ 1 min 40 s) partagée par les deux
  // témoins — la relancer par témoin doublerait le coût du gate sans rien
  // ajouter, `tsc` étant déterministe sur un arbre non modifié entre les deux.
  let sortie: string;

  beforeAll(() => {
    sortie = typecheckDesTests();
  }, 150_000);

  // Une commande cassée (mauvais binaire, config introuvable) rendrait une
  // sortie vide — donc zéro erreur — et passerait au vert pour la pire des
  // raisons si on ne bornait pas la mesure elle-même par un plancher de bruit
  // attendu (les codes muets, eux, sont dans les milliers).
  it('la commande voit bien un corpus substantiel — sinon une mesure vide passerait au vert', () => {
    const totalErreurs = (sortie.match(/error TS\d+/g) ?? []).length;
    expect(totalErreurs).toBeGreaterThan(1000);
  });

  it('ne dépasse jamais le plafond mesuré', () => {
    expect(compterErreursNonMuettes(sortie)).toBeLessThanOrEqual(PLAFOND_ERREURS_NON_MUETTES);
  });
});
