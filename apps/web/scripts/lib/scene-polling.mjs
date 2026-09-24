/**
 * POLLING ROBUSTE POUR LE RÉVÉLÉ ET L'APLATISSEMENT (#5696, correction de
 * revue « le gate `check-reading-mode.mjs` échoue au hasard sous charge,
 * sur les blocs §10 et §13 ») — un `page.waitForTimeout(N)` fixe suivi
 * d'UN échantillon course contre la transition CSS elle-même : sous charge
 * système (`load average` élevé), le budget d'horloge murale accordé au
 * test glisse au même rythme que celui accordé au navigateur, et les deux
 * dérives ne s'annulent pas. Six exécutions du même arbre ont rendu des
 * ensembles d'échec DISJOINTS — `[0.808236,…]` (valeur intermédiaire de la
 * transition CSS, l'échantillon fixe est tombé EN VOL), `[0,0,…]` (le
 * révélé n'avait pas encore commencé) ou `{"scene":"idle","opacity":1,…}`
 * (l'aplatissement n'avait pas encore débuté) — jamais un désaccord sur les
 * CINQ assertions Rivière du même run, qui restaient vertes dans les six
 * exécutions : la fenêtre visée EXISTE, seul l'instant choisi pour
 * l'échantillonner ne la contenait plus.
 *
 * Deux stratégies, jamais la même :
 * - LE RÉVÉLÉ (`waitForRevealedOpacity`) : le geste SOUTIENT la fenêtre —
 *   chaque `wheel` re-arme `SCROLL_ACTIVITY_LINGER_MS` côté application,
 *   donc rien n'oblige à viser un instant précis : on scrute après CHAQUE
 *   geste jusqu'à observer l'état stable, ou jusqu'à épuiser un budget
 *   large. Une attente d'ÉTAT SEULE (sans soutenir le geste) a été essayée
 *   et REVERTÉE : elle rend un fondu déjà reparti (`[0.0452545,…]`), ce qui
 *   PROUVE que la cause est la fenêtre du linger qui se referme sous la
 *   sonde, pas l'instant choisi pour l'échantillon.
 * - L'APLATISSEMENT (`waitForFlattenFade`) : soutenir le geste
 *   EMPÊCHERAIT la scène de retomber inactive — ici on ne rejoue AUCUN
 *   geste, on scrute la sortie de repos avec un budget large et un pas
 *   fin, sans jamais présumer du délai réel avant que `data-scene` bascule
 *   à `idle` (les timers du navigateur glissent sous la même charge que
 *   ceux du process Node qui pilote le test).
 *
 * Ni l'une ni l'autre n'abaisse un seuil ni n'allonge un `waitForTimeout`
 * fixe : les deux remplacent un PARI sur un instant par une SONDE bornée
 * sur une fenêtre large, qui s'arrête dès que la condition attendue est
 * observée.
 */

const DEFAULT_REVEAL_STEP_MS = 120;
const DEFAULT_FLATTEN_STEP_MS = 80;

/**
 * Soutient le geste (un `wheel` par pas) et scrute `sample()` après chaque
 * pas jusqu'à ce qu'elle rende un tableau contenant `1`, ou que `budgetMs`
 * soit épuisé. Rend le DERNIER échantillon lu (pour le message d'échec) et
 * l'instant RÉEL du DERNIER `wheel` dispatché — pour dater, à partir de ce
 * repère (jamais d'un offset fixe depuis le début du test), la fenêtre de
 * repli qui suit.
 */
export const waitForRevealedOpacity = async (
  page,
  { sample, budgetMs = 4000, step = DEFAULT_REVEAL_STEP_MS },
) => {
  await page.locator('main').hover();
  const deadline = Date.now() + budgetMs;
  let last = [];
  let lastWheelAt = Date.now();
  do {
    await page.mouse.wheel(0, -40);
    lastWheelAt = Date.now();
    await page.waitForTimeout(step);
    last = await sample();
    if (last.some((o) => o === 1)) return { opacities: last, lastWheelAt };
  } while (Date.now() < deadline);
  return { opacities: last, lastWheelAt };
};

/**
 * Scrute `sample()` toutes les `step` ms, SANS rejouer aucun geste, jusqu'à
 * ce qu'elle rende une valeur qui satisfait `until`, ou que `budgetMs` soit
 * épuisé — mesuré depuis l'APPEL, jamais depuis un repère externe qui
 * aurait pu dériver sous charge. Rend `{ matched, seen }` : `matched` est
 * l'échantillon qui a satisfait `until` (`null` si le budget s'est épuisé
 * sans qu'aucun ne le fasse) ; `seen` porte TOUS les échantillons lus, pour
 * que le message d'échec garde le détail qu'un échantillonnage à taille
 * fixe donnait déjà.
 */
export const waitForFlattenFade = async (
  page,
  { sample, until, budgetMs = 9000, step = DEFAULT_FLATTEN_STEP_MS },
) => {
  const deadline = Date.now() + budgetMs;
  const seen = [];
  do {
    const value = await sample();
    seen.push(value);
    if (until(value)) return { matched: value, seen };
    await page.waitForTimeout(step);
  } while (Date.now() < deadline);
  return { matched: null, seen };
};
