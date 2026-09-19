/**
 * ATTENDRE QU'UNE LECTURE PAGE-SIDE SE STABILISE (#7054, trouvé en vérifiant
 * ce lot) — deux lectures CONSÉCUTIVES identiques, jamais une seule.
 *
 * `await-fact.mjs` (`awaitCondition`) attend qu'un prédicat devienne vrai
 * UNE fois — juste pour un fait qui, une fois arrivé, ne repart plus. Trois
 * lectures de `check-thread-states.mjs` §6 (le focus après `ArrowRight`, le
 * focus après `Tab`, l'attribut `aria-checked` après un clic de coche) ne
 * tiennent pas cette promesse : `useRovingMenu` (`roving-menu.ts:176`) pose
 * le focus initial du cluster via un `requestAnimationFrame` qui peut
 * retomber APRÈS que notre lecture a already vu le changement attendu —
 * `awaitCondition` s'arrête alors sur une valeur TRANSITOIRE, une image
 * avant qu'un effet différé ne l'annule.
 *
 * MESURÉ (sonde jetable, non versionnée, 2026-09-19) : sur 15 essais,
 * `awaitCondition` + une lecture immédiate rate 2 à 3 fois (« ArrowRight
 * déplace le focus » retombe sur l'item de départ, ou `Tab` sort du
 * cluster) ; la même suite avec DEUX lectures identiques consécutives,
 * espacées de 20 ms réels, n'a plus raté une seule fois sur 30 essais SEULE
 * — mais REJOUÉE SOUS CONTENTION (le même gate en boucle, en concurrence,
 * §7 de la spécification #7054), le `requestAnimationFrame` différé de
 * `useRovingMenu` peut mettre plus de 800 ms à tourner : le budget est donc
 * porté à 100 essais de 50 ms (~5 s), le MÊME ordre de grandeur que
 * `FACT_CEILING_MS` (`await-fact.mjs`), jamais devant lui. La même
 * discipline que `waitForRowSettled` (`lib/check-media.mjs`) — un budget
 * d'ESSAIS, jamais un délai fixe (leçon 590) — appliquée à une VALEUR
 * quelconque plutôt qu'à une position.
 *
 * Rend `undefined` si la valeur n'a jamais tenu deux lectures de suite dans
 * le budget — jamais un throw (même discipline que `await-fact.mjs`) : le
 * `expect` de l'appelant nomme alors ce qu'il a lu EN DERNIER, jamais
 * l'endroit où l'attente a buté.
 */
export const SETTLE_STEP_MS = 50;
export const SETTLE_ATTEMPTS = 100;

export async function waitForValueSettled(page, evaluateFn, arg, options = {}) {
  const { attempts = SETTLE_ATTEMPTS, stepMs = SETTLE_STEP_MS } = options;
  let previous;
  let hasPrevious = false;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const current = await page.evaluate(evaluateFn, arg);
    const serialized = JSON.stringify(current);
    if (hasPrevious && serialized === previous) return current;
    previous = serialized;
    hasPrevious = true;
    await page.waitForTimeout(stepMs);
  }
  return undefined;
}
