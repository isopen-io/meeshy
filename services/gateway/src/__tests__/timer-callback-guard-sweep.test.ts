/**
 * Le cliquet des rappels de minuterie — inventaire VIDE (#9480).
 *
 * C'est la moitié SYNCHRONE du cliquet des promesses détachées
 * (`detached-promise-catch-sweep`). Un rappel de `setInterval` / `setTimeout`
 * n'a aucun `try/catch` englobant à invoquer : sa pile part de la boucle
 * d'événements. Une levée synchrone y devient une exception non interceptée,
 * une promesse rendue et abandonnée — même sans `void`, donc hors de portée de
 * l'autre cliquet — y devient un rejet non géré. Les deux terminent la
 * passerelle. #9474 en avait corrigé UN exemplaire, la purge GeoIP ; le
 * balayage en a relevé soixante-quatre autres.
 *
 * **Quand ce témoin tombe** : un site NEUF vient d'entrer. La réparation est
 * `guardedInterval` / `guardedTimeout` (`src/utils/guarded-timer.ts`), jamais
 * une ligne d'inventaire ni un `try/catch` recopié — il n'y a pas de rappel de
 * minuterie non gardé légitime à porter. Seuls passent bruts les rappels qui
 * ne peuvent pas lever : `resolve` / `reject` d'une promesse.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';

import { sweepUnguardedTimerCallbacks } from './timer-callback-guard-sweep';

const SRC_DIR = join(__dirname, '..');
const FIXTURES = join(__dirname, 'fixtures', 'timer-callback');

describe('rappels de minuterie — la levée et le rejet sont gardés au SITE', () => {
  it('aucun rappel de minuterie brut non gardé dans la production de la passerelle', () => {
    expect(sweepUnguardedTimerCallbacks(SRC_DIR)).toEqual([]);
  });

  /**
   * Le balayage est une AFFIRMATION, et se vérifie comme telle. Il distingue
   * les formes parce qu'elles ne se LISENT pas pareil au site : un rappel en
   * ligne montre son corps, une référence le cache, une fonction `async`
   * rend une promesse que personne n'écoute. La réparation, elle, est la
   * même pour les trois.
   */
  it('le balayage VOIT les formes qu’il prétend interdire, et les distingue', () => {
    const hits = sweepUnguardedTimerCallbacks(FIXTURES).filter((h) => h.file === 'unguarded.ts');

    expect(hits.map((h) => [h.timer, h.form, h.callback])).toEqual([
      ['setInterval', 'inline', '() => cache.evict()'],
      ['setInterval', 'reference', 'purge'],
      ['setInterval', 'inline', '() => svc.cleanup()'],
      ['setTimeout', 'async-function', 'async () => { await svc.cleanup(); }'],
      ['setTimeout', 'inline', '() => { settle(); }'],
      ['setTimeout', 'inline', '() => cache.evict()'],
    ]);
  });

  /**
   * Et il ne prend pas la forme JUSTE pour la fautive : la primitive gardée,
   * les rappels `resolve` / `reject` qui ne peuvent pas lever, une méthode qui
   * porte le nom `setInterval`, son appel par un objet, un commentaire et une
   * chaîne qui citent la forme fautive.
   */
  it('le balayage ne signale ni la forme gardée, ni resolve / reject, ni le mot hors d’un appel', () => {
    expect(sweepUnguardedTimerCallbacks(FIXTURES).filter((h) => h.file === 'guarded.ts')).toEqual([]);
  });
});
