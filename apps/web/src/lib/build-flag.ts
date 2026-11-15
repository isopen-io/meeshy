/**
 * **UN DRAPEAU DE CONSTRUCTION VIDE EST UNE ABSENCE, jamais une valeur.**
 *
 * `vite.config.ts` refuse de construire sur une valeur INCONNUE — et c'est une
 * bonne garde : `VITE_DATA_SOURCE=gatway` ou `VITE_READING_MODES=On`
 * partiraient sinon pour un déploiement entier en croyant avoir choisi quelque
 * chose qui n'existe pas.
 *
 * Mais Docker ne sait pas exprimer « absente ». `ARG VITE_X=""` suivi de
 * `ENV VITE_X=${VITE_X}` pose la variable à la CHAÎNE VIDE dès que personne ne
 * la surcharge — et la chaîne vide n'est ni `on`, ni `off`, ni absente. Le
 * build de l'image `web-v31` est tombé exactement là le 2026-09-10 :
 *
 *     Error: VITE_READING_MODES= : valeur inconnue.
 *     Les seules valeurs admises sont « on » (défaut), « off »,
 *     ou la variable absente (⇒ « on »).
 *
 * `VITE_API_BASE` ne connaissait pas ce défaut parce que `config.ts` traite
 * DÉJÀ sa chaîne vide comme une absence (`declaredOverride`). Cette fonction
 * porte la même convention pour les drapeaux ÉNUMÉRÉS, à un seul endroit :
 * deux gardes écrites côte à côte partageaient la règle sans partager le code,
 * et une seule des trois variables l'appliquait.
 *
 * > **Déclarer une variable avec un défaut vide n'est pas neutre.** Ce qui
 * > semblait une simple mise à disposition — la rendre réglable au déploiement
 * > — lui donnait en réalité une valeur que son lecteur refusait.
 */
export function declaredBuildFlag<T extends string>(
  nom: string,
  brut: string | undefined,
  admises: readonly T[],
): T | undefined {
  /* `undefined` ET `''` disent la même chose : personne n'a choisi. */
  if (brut === undefined || brut === '') return undefined;
  if ((admises as readonly string[]).includes(brut)) return brut as T;
  throw new Error(
    `${nom}=${brut} : valeur inconnue. Les seules valeurs admises sont ` +
      `${admises.map((v) => `« ${v} »`).join(', ')}, ou la variable absente. ` +
      'Une valeur inconnue partirait pour un déploiement entier en croyant avoir ' +
      "choisi quelque chose qui n'existe pas.",
  );
}
