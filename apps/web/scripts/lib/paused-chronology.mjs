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
 *    pendant qu'on attend le premier fait. Mesuré alors : `live-1` monté
 *    après 150 ms simulées (3 pas de 50 ms) — mesure CORRIGÉE au § 7 : ce
 *    nombre dépendait de l'heure d'arrivée des chunks.
 * 2. Les faits de la chronologie tombent à `origine + atMs`, et le DOM les
 *    montre sur le PAS MÊME qui tire le minuteur. L'origine est l'instant où
 *    la chronologie COMMENCE (`connect()` du bouchon, qui l'annonce — #9267),
 *    jamais celui où le premier nœud monte : ce dernier n'est pas une
 *    constante du build (§ 7).
 * 3. Le sondage propre de Playwright (`locator.waitFor`, `waitForFunction`
 *    avec `polling` numérique — `await-fact.mjs`) n'est PAS truqué : il lit
 *    les minuteurs ORIGINAUX capturés par l'horloge. Ce qui fait avancer le
 *    PRODUIT sous horloge en pause reste `runFor` : un `waitFor` seul
 *    n'attend un fait que si aucun minuteur du produit ne le précède.
 *
 * ## 3. La sémantique d'ORDRE
 *
 * `factBefore(beforeMs, fact)` se lit « après l'évènement qui précède, l'état
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
 *
 * ## 7. Aucun pas pendant que le CODE arrive (#9267)
 *
 * Le § 2.1 disait « `live-1` est monté après 150 ms simulées » : ce n'est
 * plus vrai, et ce ne l'était que par chance. Le fil, le temps réel et le
 * bouchon de fixtures sont des chunks chargés à la demande (`import()` de
 * `main.tsx`, `route-table.tsx`, `realtime.ts`) : ils arrivent en temps
 * MURAL, pendant que `factBefore` franchit ses pas aussi vite que le
 * protocole le permet. Mesuré sur le dist de `dev` (2026-10-06) : `live-1`
 * monte entre 800 et 1 400 ms SIMULÉES selon l'ordre d'arrivée des chunks,
 * et une latence de 0 à 400 ms par chunk fait rougir le premier fait de
 * `c-live` 5 fois sur 5 — budget de 1 500 ms épuisé AVANT que le code du
 * fil n'existe, puis horloge figée : `innerText` attend 30 s un nœud que
 * plus aucun minuteur ne peut monter. Le budget SIMULÉ mesurait la vitesse
 * du réseau local.
 *
 * Chaque avancée attend donc d'abord que le code demandé par les pages du
 * contexte soit ARRIVÉ — une condition observable (`request` →
 * `requestfinished`/`requestfailed`), jamais un délai. Seul le CODE retient
 * (script, feuille de style, `fetch`/`xhr` de la même origine que la page) :
 * une image ou une ressource tierce ne conditionne aucun minuteur du
 * produit, et un hôte injoignable figerait le gate. Le plafond MURAL
 * (`FACT_CEILING_MS`) rend la main sans lever si une requête ne finit
 * jamais : le fait, ensuite, dira ce qu'il a vu.
 */

import { FACT_CEILING_MS } from './await-fact.mjs';

export const CHRONOLOGY_STEP_MS = 50;

const CODE_RESOURCE_TYPES = new Set(['script', 'stylesheet', 'fetch', 'xhr']);

const sameOriginAsItsPage = (request) => {
  try {
    return new URL(request.url()).origin === new URL(request.frame().url()).origin;
  } catch {
    return false;
  }
};

const isCode = (request) => CODE_RESOURCE_TYPES.has(request.resourceType()) && sameOriginAsItsPage(request);

/**
 * Le code EN VOL d'un contexte — toutes ses pages, puisque l'horloge est
 * celle du contexte (§ 4) : la liste de `c-live` vit sur une page sœur.
 * `arrived(ceilingMs)` se résout quand plus aucun code n'est en vol, ou au
 * plafond mural.
 */
const codeInFlight = (context) => {
  const pending = new Set();
  let waiters = [];
  const settle = (request) => {
    if (!pending.delete(request) || pending.size > 0) return;
    const released = waiters;
    waiters = [];
    for (const release of released) release();
  };
  context.on('request', (request) => {
    if (isCode(request)) pending.add(request);
  });
  context.on('requestfinished', settle);
  context.on('requestfailed', settle);

  const arrived = (ceilingMs) => {
    if (pending.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const ceiling = setTimeout(resolve, ceilingMs);
      waiters.push(() => {
        clearTimeout(ceiling);
        resolve();
      });
    });
  };
  return { arrived };
};

/**
 * Installe une horloge EN PAUSE sur `page` (poser AVANT toute navigation :
 * les fixtures calculent leurs horodatages à l'import du module, donc dans la
 * page) et rend les primitives d'une chronologie ORDONNÉE :
 * - `now()` : l'instant simulé courant, tel que CE module l'a fait avancer ;
 * - `mark()` : alias de `now()`, pour nommer un point de départ ;
 * - `advanceTo(targetMs)` : avance l'horloge jusqu'à `targetMs`, en une
 *   seule fois — jamais deux fois le même intervalle ;
 * - `advanceBy(durationMs)` : la même avancée, exprimée en DURÉE. Les deux
 *   existent parce que les gates posent DEUX questions différentes, et
 *   qu'écrire l'une avec l'autre ment sur celle qu'on pose : une chronologie
 *   d'ÉVÈNEMENTS (`c-live`) vise des instants ABSOLUS lus dans
 *   `LIVE_SCHEDULE`, tandis qu'une suite de GESTES (le § 5 de
 *   `check-thread-states.mjs`) avance d'un délai RELATIF à l'action qui
 *   précède — son échéance est datée par le clic, pas par le corpus.
 *   `advanceBy` est une projection d'`advanceTo`, jamais un second compteur ;
 * - `factBefore(beforeMs, fact)` : avance par pas de `stepMs` jusqu'à ce que
 *   `fait()` rende vrai, sans jamais atteindre `beforeMs`. Rend `true`/`false`,
 *   ne lève JAMAIS (même discipline que `await-fact.mjs`).
 *
 * Toute avancée attend d'abord le code en vol (§ 7), au plus `codeCeilingMs`
 * de temps mural.
 */
export async function pausedChronology(page, { time, stepMs = CHRONOLOGY_STEP_MS, codeCeilingMs = FACT_CEILING_MS }) {
  const code = codeInFlight(page.context());
  await page.clock.install({ time });
  await page.clock.pauseAt(time);

  const runFor = async (ms) => {
    await code.arrived(codeCeilingMs);
    await page.clock.runFor(ms);
  };

  let elapsed = 0;
  const now = () => elapsed;

  const advanceTo = async (targetMs) => {
    if (targetMs < elapsed) {
      throw new RangeError(`advanceTo(${targetMs}) : la chronologie est déjà à ${elapsed} ms`);
    }
    if (targetMs === elapsed) return;
    await runFor(targetMs - elapsed);
    elapsed = targetMs;
  };

  const advanceBy = async (durationMs) => {
    if (durationMs < 0) {
      throw new RangeError(`advanceBy(${durationMs}) : une chronologie n'avance jamais d'une durée négative`);
    }
    await advanceTo(elapsed + durationMs);
  };

  const factBefore = async (beforeMs, fact) => {
    for (;;) {
      if (await fact()) return true;
      if (elapsed + stepMs >= beforeMs) return false;
      await runFor(stepMs);
      elapsed += stepMs;
    }
  };

  return { now, mark: now, advanceTo, advanceBy, factBefore };
}
