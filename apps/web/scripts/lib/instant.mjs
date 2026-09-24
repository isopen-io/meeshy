/**
 * L'INSTANT DE RÉFÉRENCE DES GATES (#6130) — le site UNIQUE.
 *
 * POURQUOI UNE HORLOGE FIGÉE EST OBLIGATOIRE, ET PAS UN CONFORT
 *
 * Les fixtures du fil sont ancrées sur `Date.now()` pour que la conversation se
 * lise toujours comme AUJOURD'HUI (`minutesAgo(28)`, `minutesAgo(600 - i)` —
 * `src/lib/api/fixtures.ts:253,304`). C'est le bon choix pour le rendu : un fil
 * dont les tampons vieillissent d'un jour à chaque nuit ne ressemble plus à une
 * conversation. Mais un gate qui AFFIRME « Aujourd'hui HH:MM » sur ce corpus
 * affirme en réalité « il est plus de dix heures chez le runner » — et cette
 * affirmation-là est fausse une nuit sur une.
 *
 * Mesuré le 2026-09-12 à 00:16 : `check-reading-mode.mjs` a bloqué la PR #6112,
 * une branche iOS qui ne touche AUCUN fichier de `apps/web-v2`, sur
 *
 *     ECHEC le tampon de l'élue commence par « Aujourd'hui HH:MM » (« Hier 23:48 »)
 *
 * Ce n'est pas un flake d'ordonnancement, c'est une FENÊTRE DÉTERMINISTE :
 * rouge de 00:00 à 00:28 sur le tampon de l'élue, et jusqu'à 10:00 dès qu'une
 * assertion regarde le corpus des dix heures. Invisible en journée — c'est
 * exactement ce qui l'a fait survivre.
 *
 * POURQUOI `setFixedTime` ET JAMAIS `clock.install`
 *
 * `setFixedTime` épingle `Date.now()` / `new Date()` et laisse tourner
 * `setTimeout` et `performance.now()`. `clock.install` fige les deux. La scène
 * du fil compte en `performance.now()` et en `setTimeout`
 * (`src/lib/reading-mode/scene.ts`) : sous `install`, l'armement et l'élection
 * n'arrivent JAMAIS, et le gate cesse de mesurer ce qu'il croit mesurer —
 * un vert par immobilité. `capture.mjs:67-75` avait déjà écrit ce constat pour
 * ses captures ; il vaut mot pour mot pour les gates.
 *
 * LE CHOIX DE L'HEURE, ET CE QU'IL DOIT TENIR
 *
 * 12:00 UTC, parce que la borne est le corpus le plus ANCIEN, pas le plus
 * récent : `minutesAgo(600 - i)` remonte à dix heures, et l'instant doit laisser
 * ces dix heures dans la MÊME journée civile — chez le runner (UTC : 02:00) et
 * sur la machine du développeur (UTC+2 : 04:00). Une heure du matin aurait rendu
 * le gate rouge partout, tout le temps ; midi lui donne deux heures de marge des
 * deux côtés.
 *
 * CE QUE LA FALSIFICATION A MONTRÉ, ET QUE LA CI N'AVAIT PAS DIT
 *
 * L'épinglage ne prouve rien s'il rend le témoin INCAPABLE de tomber. Mesuré en
 * reculant cet instant à `2026-09-12T00:10:00.000Z` sous `TZ=UTC` :
 *
 *     ECHEC le tampon de l'élue commence par « Aujourd'hui HH:MM » (« Hier 23:42 »)
 *     ECHEC sortie « visage » : une rangée est mise en évidence
 *     2 défaut(s) du mode de lecture.
 *
 * Le premier reproduit à l'identique le rouge de la nuit (la CI, lancée six
 * minutes plus tard, lisait « Hier 23:48 »). Le SECOND est nouveau : la CI n'en
 * avait rapporté qu'un, et la fenêtre nocturne en casse donc au moins deux —
 * quand le corpus des dix heures passe la veille, les séparateurs de jour
 * s'insèrent et l'élection ne tombe plus sur la rangée attendue. Un défaut de
 * date ne reste pas un défaut de date : il déplace la structure du fil.
 *
 * TROIS AUTRES DÉFINITIONS COEXISTENT, ET DEUX SEULEMENT PEUVENT CONVERGER ICI
 *
 * `capture.mjs:23` (`2026-09-07T10:00:00Z`) ne peut PAS bouger : ses captures de
 * référence (`targets/*.png`) portent cet horodatage en pixels, et le changer les
 * invaliderait toutes. `check-thread-states.mjs:267` (`2026-09-08T12:00:00.000Z`)
 * et `lib/check-message-states.mjs:30` (`2026-09-10T12:00:00.000Z`) le peuvent —
 * convergence suivie à part, hors de #6130.
 */
export const INSTANT = new Date('2026-09-12T12:00:00.000Z');

/**
 * Épingle l'horloge d'une page AVANT sa première navigation, puis la rend.
 *
 * `setFixedTime` doit être posé avant `goto` : les fixtures évaluent leur
 * `minutesAgo(...)` à l'import du module, donc DANS la page, donc après la
 * navigation. Posé après, il épinglerait l'horloge sur un corpus déjà daté par
 * l'heure réelle — la moitié du remède, et la pire : le tampon serait calculé
 * contre un instant qui n'est plus celui de sa fixture.
 */
export async function pageÀInstantFigé(context) {
  const page = await context.newPage();
  await page.clock.setFixedTime(INSTANT);
  return page;
}
