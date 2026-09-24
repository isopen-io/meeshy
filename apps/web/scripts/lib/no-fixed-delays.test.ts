import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * LE GATE DES ÉTATS DU FIL ATTEND UN FAIT, JAMAIS UN DÉLAI (#7054).
 *
 * Ce témoin rend le CRITÈRE DE FIN rejouable : `grep -c waitForTimeout` sur
 * les trois fichiers du gate → 0 sur les lectures d'état, et EXACTEMENT 1
 * délai restant — le seul GESTE (l'appui long, § `check-thread-states.mjs`
 * 6.5) dont la durée EST l'entrée, pas un délai de synchronisation.
 *
 * Un COMPTE, jamais une regex de détection (leçon 630 — un détecteur de
 * gardes par SOUS-CHAÎNE lit mal une garde plus LARGE) : `split(...).length
 * − 1` compte les occurrences littérales du nom de méthode, sans supposer sa
 * forme d'appel (`await x.waitForTimeout(n)`, `x.waitForTimeout(n).then(...)`,
 * peu importe).
 *
 * RÉSERVE CONNUE, écrite ici plutôt que découverte en CI (mémoire du dépôt,
 * « une EXTRACTION fait rougir toute garde indexée par FICHIER ») : le jour
 * où `check-thread-states.mjs` se redécoupe (il en a déjà l'habitude — cinq
 * extractions l'ont déjà traversé), le compte se DÉPLACE dans le même
 * commit que l'extraction. Ce n'est pas un défaut de CE témoin, c'est le prix
 * d'un critère de fin rendu vérifiable plutôt qu'affirmé dans un rapport.
 */

const hostPath = fileURLToPath(new URL('../check-thread-states.mjs', import.meta.url));
const realtimePath = fileURLToPath(new URL('./check-realtime-events.mjs', import.meta.url));
const offlinePath = fileURLToPath(new URL('./check-offline-states.mjs', import.meta.url));
const protectionPath = fileURLToPath(new URL('./check-protection-states.mjs', import.meta.url));

const countWaitForTimeout = (source: string) => source.split('waitForTimeout').length - 1;

describe('les gates du fil n’attendent aucun délai sur une lecture d’état', () => {
  test('check-realtime-events.mjs : 0 occurrence — la chronologie est ORDONNÉE (pausedChronology)', async () => {
    const source = await readFile(realtimePath, 'utf8');
    expect(countWaitForTimeout(source)).toBe(0);
  });

  test('check-offline-states.mjs : 0 occurrence — aucune horloge truquée, awaitFact sonde les minuteurs réels', async () => {
    const source = await readFile(offlinePath, 'utf8');
    expect(countWaitForTimeout(source)).toBe(0);
  });

  /**
   * LA SURFACE GARDÉE SUIT LE GATE, PAS LA LISTE D'ORIGINE (revue-correction
   * #7054). Le § 5 a quitté l'hôte pour `check-protection-states.mjs` : une
   * garde restée sur trois chemins aurait cessé de couvrir la section la plus
   * serrée du gate (400 ms de marge sur la révélation d'un flouté) sans
   * qu'aucun témoin ne rougisse — la forme exacte de la réserve écrite
   * ci-dessus.
   */
  test('check-protection-states.mjs : 0 occurrence — la suite tient son horloge en PAUSE', async () => {
    const source = await readFile(protectionPath, 'utf8');
    expect(countWaitForTimeout(source)).toBe(0);
  });

  /**
   * ET L'HORLOGE, PAS SEULEMENT LE DÉLAI NOMMÉ. Une horloge truquée posée
   * SANS mise en pause avance avec le temps MURAL (mesuré sur le dist :
   * +3 004 ms d'horloge page pour 3 005 ms de mur, Playwright 1.62.1) — un
   * délai fixe qui ne dit pas son nom, et le mécanisme EXACT des deux rouges
   * de #7054. Le `grep` du critère de fin ne l'attrape pas : il cherche la
   * PRÉSENCE d'une méthode, quand le défaut est l'ABSENCE d'une autre.
   *
   * La règle gardée est donc « aucun gate du fil ne pose l'horloge lui-même » :
   * le site UNIQUE est `pausedChronology`, dont `paused-chronology.test.ts`
   * prouve qu'il installe PUIS met en pause, dans cet ordre. Une suite qui
   * reprendrait la pose en direct redeviendrait libre de sauter la pause —
   * c'est ce qui était arrivé au § 5.
   *
   * LA LISTE EST DÉRIVÉE, PAS ÉCRITE (revue-correction #7054, défaut majeur
   * 1) — ce test n'itérait que QUATRE chemins CONSTANTS pendant que l'hôte
   * en importait NEUF : `check-message-states.mjs`, un cinquième module non
   * gardé, posait `page.clock.install` SANS `pauseAt` — la cause racine
   * EXACTE de #7054, invisible à cette garde. Lire les `import … from
   * './lib/…mjs'` de l'hôte plutôt que les recopier fait qu'un module
   * ajouté au gate entre sous garde SANS qu'on y pense — la RÉSERVE CONNUE
   * ci-dessus (« le compte se DÉPLACE dans le même commit que
   * l'extraction ») ne vaut donc plus que pour les tests de comptage
   * ci-dessous, qui ciblent des invariants NOMMÉS (0 délai sur CE fichier
   * précis), jamais pour celui-ci.
   */
  test('aucun gate du fil ne pose l’horloge truquée en direct — le site unique est pausedChronology', async () => {
    const hostSource = await readFile(hostPath, 'utf8');
    const importedLibModules = [...hostSource.matchAll(/from '\.\/lib\/([\w-]+\.mjs)'/g)].map((match) =>
      fileURLToPath(new URL(`./${match[1]}`, import.meta.url)),
    );
    expect(importedLibModules.length).toBeGreaterThan(0);

    const posed = [];
    for (const path of [hostPath, ...importedLibModules]) {
      const source = await readFile(path, 'utf8');
      if (source.includes('.clock.')) posed.push(path.split('/').slice(-1)[0]);
    }
    expect(posed).toEqual([]);
  });

  test('check-thread-states.mjs : EXACTEMENT 1 waitForTimeout, et c’est le GESTE de l’appui long', async () => {
    const source = await readFile(hostPath, 'utf8');
    const lines = source.split('\n');
    const delayLines = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes('waitForTimeout'));

    expect(delayLines.length).toBe(1);

    const only = delayLines[0];
    if (only === undefined) throw new Error('unreachable — la longueur est vérifiée ci-dessus');
    const precedingLines = lines.slice(Math.max(0, only.index - 3), only.index).join('\n');
    expect(precedingLines).toContain('mouse.down()');
  });
});
