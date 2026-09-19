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
