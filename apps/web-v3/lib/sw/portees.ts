/**
 * LES PORTÉES DU TRAVAILLEUR DE ZONE (#4472) — lues dans l'ENVIRONNEMENT,
 * jamais cuites dans l'image.
 *
 * L'image est UNIQUE pour staging et prod alors que leurs périmètres Traefik
 * diffèrent : la liste des portées ne peut venir que du déploiement.
 * `V3_SW_PORTEES` est posée dans le compose, À CÔTÉ des labels du routeur —
 * les deux faces de la même frontière vivent dans le même fichier, et
 * `__tests__/sw-registration.test.ts` vérifie qu'elles ne divergent pas
 * (chaque portée capturée par la règle, chaque portée couverte par
 * `belongsToV3Zone` du legacy).
 *
 * Fail-safe dans les DEUX sens : variable absente ⇒ aucune portée ⇒ aucune
 * registration (la prod d'aujourd'hui) ; `/` ⇒ REFUSÉE — l'étape 7 du § 4.9
 * n'est pas franchie, et un `/` glissé dans l'env ne prend pas l'origine en
 * silence (le worker la refuse AUSSI, `lib/sw/travailleur.js` — deux verrous,
 * un par étage).
 */
export const porteesDuTravailleur = (brut: string | undefined): readonly string[] =>
  (brut ?? '')
    .split(',')
    .map((portee) => portee.trim())
    .filter((portee) => portee.startsWith('/') && portee !== '/');

/**
 * LA LISTE NAVIGABLE (#5106) partage la grammaire ET le refus de `/` : ce que
 * `V3_NAVIGABLE` déclare — les chemins entre lesquels le navigateur de zone
 * échange les documents — obéit aux mêmes lois que les portées du travailleur
 * (chemins de la zone, jamais l'origine entière, jamais un hôte étranger), et
 * son témoin des deux faces vit au même endroit (`sw-registration.test.ts`).
 */
export const listeDeCheminsDeZone = porteesDuTravailleur;
