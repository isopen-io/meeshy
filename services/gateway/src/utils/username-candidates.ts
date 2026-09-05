/**
 * Les pseudos de RECHANGE d'une base donnée — **site unique** (#5216).
 *
 * ## Pourquoi ils ne vivent plus dans un fichier de route
 *
 * `candidatsDePseudo` est né dans `routes/directory/availability.ts`, la seule
 * surface qui en avait besoin. Deux autres l'ont depuis : l'alias déprécié
 * `GET /auth/check-availability`, et — depuis #5216 — la GÉNÉRATION de pseudo
 * à l'inscription, qui teste la base et ses candidats en UNE requête.
 *
 * Une règle importée d'un fichier de ROUTE par un SERVICE inverse la
 * dépendance : le service se met à dépendre de la surface HTTP qui l'appelle,
 * et la route devient impossible à découper sans casser le service. La règle
 * n'appartenait déjà plus à la route ; elle appartient au dépôt.
 *
 * ## Des candidats DÉTERMINISTES, pas un tirage
 *
 * L'ancienne route tirait jusqu'à dix suffixes au hasard, avec une requête
 * Prisma CHACUN. Des candidats dérivés du pseudo demandé se testent en une
 * seule requête, et rendent la même suggestion à deux appels successifs — ce
 * qui est moins déroutant pour la personne qui hésite.
 *
 * @module utils/username-candidates
 */

/** Combien de candidats tester — en UNE requête, pas dix. */
const CANDIDATS_TESTES = 6;

export function candidatsDePseudo(base: string): string[] {
  const racine = base.trim();
  return [
    `${racine}1`,
    `${racine}7`,
    `${racine}_`,
    `${racine}26`,
    `${racine}${racine.length}`,
    `the${racine}`,
  ].slice(0, CANDIDATS_TESTES);
}
