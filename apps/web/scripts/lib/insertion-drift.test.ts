import { describe, expect, test } from 'bun:test';

import { driftLine, insertionDrift } from './insertion-drift.mjs';

/**
 * **UN CHIFFRE DE DÉRIVE NE S'IMPRIME QUE S'IL A ÉTÉ MESURÉ** (#7110).
 *
 * ## Le défaut que ces témoins gardent
 *
 * `check-thread-virtualization.mjs` agrégeait ses tirages ainsi :
 *
 * ```js
 * let insertionJump = 0;
 * if (pull.drift === null) lostAnchor += 1;
 * else insertionJump = Math.max(insertionJump, pull.drift);
 * ```
 *
 * Quand la rangée repérée disparaît du document, `drift` vaut `null`,
 * `insertionJump` n'est pas touché — et le gate imprime **« saut à l'insertion
 * 0 px »** au moment précis où il n'a PAS pu mesurer le saut. Zéro sur zéro
 * mesure, affiché comme zéro pixel de dérive.
 *
 * Mesuré le 2026-09-19 par test de mutation : ancrage retiré
 * (`use-older-messages.ts:130`), le gate imprime `0 px` et ne rougit que par
 * des assertions VOISINES (`lostAnchor`, pages chargées, premier message
 * atteint). La ligne chiffrée — celle qu'un humain lit dans un journal de CI
 * de treize minutes — reste rassurante.
 *
 * ## Pourquoi un type SOMME, et pas un nombre avec une sentinelle
 *
 * C'est la forme de `paintedAt` (#7048) : `-1` ou `NaN` se compare, donc se
 * compare mal — `max(0, NaN)` et `NaN <= 2` rendent des verdicts silencieux.
 * Un type somme FORCE l'appelant à traiter la branche « pas de mesure », et
 * c'est tout l'objet de l'issue.
 */

describe('insertionDrift — ce qui distingue « zéro dérive » de « aucune mesure » (#7110)', () => {
  test('des tirages tous mesurés rendent la dérive MAXIMALE', () => {
    expect(insertionDrift([{ drift: 0 }, { drift: 38 }, { drift: 2 }])).toEqual({
      kind: 'measured',
      max: 38,
      pages: 3,
    });
  });

  test('UNE ancre perdue suffit à rendre la mesure non concluante — même si les autres sont à zéro', () => {
    // C'est LE cas du défaut : sans lui, le verdict serait `{ max: 0 }`, et la
    // ligne imprimée dirait « 0 px » sur une mesure qui n'a pas eu lieu.
    expect(insertionDrift([{ drift: 0 }, { drift: null }, { drift: 0 }])).toEqual({
      kind: 'unmeasurable',
      lost: 1,
      pages: 3,
    });
  });

  test('aucune page insérée ⇒ il n’y a rien à mesurer, et ce n’est pas la même chose qu’une ancre perdue', () => {
    expect(insertionDrift([])).toEqual({ kind: 'no-pages', pages: 0 });
  });

  test('une seule page ne suffit pas : le gate exige DEUX insertions pour conclure', () => {
    expect(insertionDrift([{ drift: 0 }])).toEqual({ kind: 'no-pages', pages: 1 });
  });
});

describe('driftLine — la ligne imprimée ne dit un chiffre que sur une mesure (#7110)', () => {
  test('une dérive mesurée s’imprime en pixels, arrondie', () => {
    expect(driftLine({ kind: 'measured', max: 37.6, pages: 10 })).toBe('38 px');
  });

  test('une ancre perdue n’imprime AUCUN chiffre — elle dit que la mesure n’a pas eu lieu', () => {
    const line = driftLine({ kind: 'unmeasurable', lost: 2, pages: 10 });
    expect(line).toContain('non mesurable');
    expect(line).toContain('2');
    // L'assertion qui garde le défaut : plus jamais « 0 px » sur une non-mesure.
    expect(line).not.toContain('px');
  });

  test('aucune page insérée le dit aussi, et sans chiffre de dérive', () => {
    const line = driftLine({ kind: 'no-pages', pages: 1 });
    expect(line).toContain('non mesurable');
    expect(line).not.toContain('px');
  });
});
