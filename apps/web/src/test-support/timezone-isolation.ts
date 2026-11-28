/**
 * LE FUSEAU DES TÉMOINS NE VIENT PAS DU POSTE (#20729).
 *
 * `bun test` ne règle l'horloge sur UTC que si `TZ` est ABSENTE de
 * l'environnement. La CI ne la pose pas ; un poste ou un conteneur de session
 * qui l'exporte fait rougir tout témoin qui compare une heure rendue, sans
 * qu'aucun ne soit en défaut (règle 3 de #18654).
 *
 * Posé ici plutôt que dans chaque fichier : un témoin d'heure écrit demain
 * n'a pas à savoir que la règle existe.
 */
process.env.TZ = 'UTC';
