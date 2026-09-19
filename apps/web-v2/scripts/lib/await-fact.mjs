/**
 * ATTENDRE UN FAIT SANS JAMAIS LEVER (#7054) — le socle que `paused-
 * chronology.mjs` et les gates SANS horloge truquée (§6-7 de
 * `check-thread-states.mjs`, `check-offline-states.mjs`) appellent pour
 * remplacer une lecture d'état calée sur un DÉLAI par une attente calée sur
 * ce que Playwright peut réellement sonder.
 *
 * POURQUOI `then(() => true, () => false)`, JAMAIS UN THROW. Un témoin doit
 * nommer le défaut qu'il a TROUVÉ, jamais l'endroit où il a buté
 * (`check-thread-states.mjs:78-83, 189-195` — la même règle y motive déjà
 * `clickIfPresent`). Et `browser.mjs:121-127` transforme toute exception non
 * rattrapée en `uncaughtException` → `process.exit(1)`, ce qui jetterait les
 * témoins déjà verts avant elle (la mésaventure que `browser.mjs` documente
 * pour lui-même). `awaitFact`/`awaitCondition` rendent donc un booléen à
 * l'appelant, qui compose son propre `expect(...)` avec le message qu'il
 * connaît déjà — jamais un message générique de timeout.
 *
 * POURQUOI 10 SECONDES. Le plafond est « proportionné à la charge »
 * (#7054/#7075) : sous contention le fait ARRIVE, il arrive TARD — c'est le
 * cas mesuré qui a produit les deux rouges de #7054. Une constante nommée,
 * une fois, plutôt qu'un nombre nu recopié à chaque site d'appel.
 *
 * POURQUOI `polling: 25`, JAMAIS `raf` (le défaut de `waitForFunction`).
 * Mesuré le 2026-09-19 (§1.2 point 3 de la spécification #7054) : sous
 * horloge truquée (`page.clock.install` + `pauseAt`), le sondage PROPRE de
 * Playwright n'est PAS truqué — `UtilityScript` lit
 * `global.__pwClock.builtins`, les minuteurs ORIGINAUX capturés par
 * l'horloge — mais le polling par défaut de `waitForFunction` utilise
 * `requestAnimationFrame`, et RIEN ne garantit que ce `rAF`-là reste sur les
 * builtins non truqués selon la version de Playwright. Poser un intervalle
 * NUMÉRIQUE est la belt-and-braces qui reste vraie si ce détail change.
 */

export const FACT_CEILING_MS = 10_000;

/**
 * Attend qu'un `locator` atteigne `state` (par défaut `'attached'`). Rend
 * `true` si le fait est arrivé, `false` s'il a expiré — ne lève JAMAIS.
 */
export const awaitFact = (locator, { state = 'attached', timeoutMs = FACT_CEILING_MS } = {}) =>
  locator.waitFor({ state, timeout: timeoutMs }).then(
    () => true,
    () => false,
  );

/**
 * Attend qu'un prédicat de page rende vrai, sondé toutes les `25` ms — pas
 * par `requestAnimationFrame` (voir doc-comment de tête). Rend `true`/`false`,
 * ne lève JAMAIS.
 */
export const awaitCondition = (page, predicate, arg, { timeoutMs = FACT_CEILING_MS } = {}) =>
  page.waitForFunction(predicate, arg, { polling: 25, timeout: timeoutMs }).then(
    () => true,
    () => false,
  );
