/**
 * UNE CHRONOLOGIE SOUS HORLOGE EN PAUSE (#7054) — le gate est le SEUL à faire
 * avancer le temps, jamais le mur.
 *
 * ## 1. La cause racine (Playwright 1.62.1, `coreBundle.js`, contrôleur
 * d'horloge injecté — lu le 2026-09-19, sondé sur le dist de cette branche)
 *
 * | site du bundle | ce qu'il fait |
 * |---|---|
 * | `install(time)` → `_innerInstall` (offset ≈ 442 434) | pose `_now.time` ; **ne met PAS en pause** |
 * | `_replayLogOnce()` (≈ 450 156) | à chaque document, rejoue le journal ; si le dernier état n'est pas `pauseAt`, **avance `_now` du temps MURAL écoulé depuis le dernier appel d'horloge** puis reprend |
 * | `_innerResume()` / `_syncRealTime()` (≈ 444 117 / 441 473) | chaque `Date.now()`/`performance.now()` de la page avance l'horloge truquée du temps mural écoulé, un minuteur la rafraîchit toutes les ≤ 100 ms réelles |
 * | `runFor(ticks)` | pause PENDANT le run, **reprend après** |
 * | `pauseAt(time)` → `_innerPause()` (≈ 443 849) | coupe la synchronisation murale jusqu'à `resume()` |
 *
 * Sous `install` SEUL, l'horloge truquée dérive donc avec le temps mural :
 * sous contention (load average 22 à 61, #7054), le mur qui sépare `goto`
 * d'une lecture « T+4 s » peut dépasser les 700 ms qui séparent la
 * traduction anglaise (3 500 ms) de la française (4 200 ms) — la chronologie
 * a alors DÉPASSÉ la lecture, et le témoin de rang 2 obtient le rang 1.
 * Mesuré : sous `install` + `pauseAt`, un `sleep` mural de 3 s ne déplace
 * `Date.now()` de la page **d'aucune milliseconde** ; sous `install` seul,
 * l'horloge suit le mur. `install` PUIS `pauseAt`, dans cet ordre, coupe donc
 * la dérive — c'est la raison d'être de ce module.
 *
 * ## 2. Trois faits mesurés qui gouvernent la forme (`/c/c-live`, dist de
 * cette branche, 2026-09-19)
 *
 * 1. Sous horloge EN PAUSE posée AVANT `goto`, la page ne démarre PAS toute
 *    seule (le démarrage consomme des minuteurs) : il faut avancer par pas
 *    pendant qu'on attend le premier fait. Mesuré : `live-1` est monté après
 *    150 ms simulées (3 pas de 50 ms).
 * 2. Les faits de la chronologie tombent à `origine + atMs`, et le DOM les
 *    montre sur le PAS MÊME qui tire le minuteur — l'origine d'une
 *    chronologie (le moment où le premier fait est monté) est donc une
 *    CONSTANTE du build, jamais de la machine.
 * 3. Le sondage propre de Playwright (`locator.waitFor`, `waitForFunction`
 *    avec `polling` numérique — `await-fact.mjs`) n'est PAS truqué : il lit
 *    les minuteurs ORIGINAUX capturés par l'horloge. Ce qui fait avancer le
 *    PRODUIT sous horloge en pause reste `runFor` : un `waitFor` seul
 *    n'attend un fait que si aucun minuteur du produit ne le précède.
 *
 * ## 3. La sémantique d'ORDRE
 *
 * `factBefore(beforeMs, fait)` se lit « après l'évènement qui précède, l'état
 * est X, AVANT que l'évènement suivant (à `beforeMs`) ne tire ». C'est le
 * témoin de TEMPS devenu témoin d'ORDRE (#7054, critère de fin 4) : au lieu
 * d'avancer l'horloge d'une durée fixe puis de lire immédiatement, on avance
 * par petits pas et on relit le fait à chaque pas, jusqu'à ce qu'il soit vrai
 * ou que l'évènement suivant soit sur le point de tirer.
 *
 * ## 4. Une horloge par CONTEXTE
 *
 * L'horloge truquée de Playwright est posée par `BrowserContext`, jamais par
 * `Page` (`_browserContext._channel.clockInstall`) : une seule chronologie
 * par `newContext`, jamais un second `install` sur une page sœur du même
 * contexte — le second journal écraserait le premier sans que rien ne le
 * signale.
 *
 * ## 5. Pourquoi le pas vaut 50 ms
 *
 * ≥ 16 ms (le `rAF` truqué de Preact pour ses effets, `check-thread-
 * states.mjs:411-431`, #6061 — un pas plus court redemanderait un rendu que
 * rien n'a encore produit) et strictement < 200 ms (la plus petite marge de
 * `LIVE_SCHEDULE`, `src/lib/api/fixtures-realtime.ts`, entre 4 000 et
 * 4 200 ms — un pas plus large sauterait par-dessus un état qui n'a vécu que
 * 200 ms). Exportée en constante nommée pour que le prochain gate ne la
 * redéclare pas.
 *
 * ## 6. Pourquoi pas `install` + `locator.waitFor()` à 10 s (la forme
 * suggérée par la demande de travail)
 *
 * Sous `install` seul, l'horloge dérive avec le mur (§1) ; si la dérive a
 * déjà DÉPASSÉ l'instant du fait attendu, ce fait ne REVIENDRA jamais — et
 * `waitFor` expire à 10 s avec exactement le rouge de #7054. `waitFor` seul
 * ne vaut que pour un fait MONOTONE (une rangée qui apparaît et ne repart
 * jamais) ; un fait qu'un fait SUIVANT efface (le rang 2 du Prisme, repris
 * par le rang 1) exige que le gate TIENNE l'horloge — c'est `factBefore`.
 */

export const CHRONOLOGY_STEP_MS = 50;

/**
 * Installe une horloge EN PAUSE sur `page` (poser AVANT toute navigation :
 * les fixtures calculent leurs horodatages à l'import du module, donc dans la
 * page) et rend les primitives d'une chronologie ORDONNÉE :
 * - `now()` : l'instant simulé courant, tel que CE module l'a fait avancer ;
 * - `mark()` : alias de `now()`, pour nommer un point de départ ;
 * - `advanceTo(targetMs)` : avance l'horloge jusqu'à `targetMs`, en une
 *   seule fois — jamais deux fois le même intervalle ;
 * - `factBefore(beforeMs, fait)` : avance par pas de `stepMs` jusqu'à ce que
 *   `fait()` rende vrai, sans jamais atteindre `beforeMs`. Rend `true`/`false`,
 *   ne lève JAMAIS (même discipline que `await-fact.mjs`).
 */
export async function pausedChronology(page, { time, stepMs = CHRONOLOGY_STEP_MS }) {
  await page.clock.install({ time });
  await page.clock.pauseAt(time);

  let elapsed = 0;
  const now = () => elapsed;

  const advanceTo = async (targetMs) => {
    if (targetMs < elapsed) {
      throw new RangeError(`advanceTo(${targetMs}) : la chronologie est déjà à ${elapsed} ms`);
    }
    if (targetMs === elapsed) return;
    await page.clock.runFor(targetMs - elapsed);
    elapsed = targetMs;
  };

  const factBefore = async (beforeMs, fait) => {
    for (;;) {
      if (await fait()) return true;
      if (elapsed + stepMs >= beforeMs) return false;
      await page.clock.runFor(stepMs);
      elapsed += stepMs;
    }
  };

  return { now, mark: now, advanceTo, factBefore };
}
