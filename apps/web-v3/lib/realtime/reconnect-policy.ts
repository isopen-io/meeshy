/**
 * UNE politique de reconnexion, et une seule (§ 7, site unique).
 *
 * Les valeurs ne sont pas choisies ici : elles reprennent le patron DÉJÀ DURCI
 * de `apps/web/services/socketio/connection.service.ts` — 1 s → 30 s, facteur
 * de dispersion 0,5. Le § 2 le nomme explicitement comme réutilisé, jamais
 * réécrit : une seconde politique de backoff, c'est un second comportement de
 * troupeau au retour d'une panne, et il ne se voit qu'en production.
 *
 * La dispersion n'est pas cosmétique. Sans elle, tous les onglets de tous les
 * visiteurs qu'une coupure a jetés en même temps reviennent à la même
 * milliseconde : la passerelle reçoit N reconnexions synchrones et la reprise
 * se transforme en second incident.
 */
export const POLITIQUE_DE_RECONNEXION = {
  delaiMs: 1_000,
  delaiMaximumMs: 30_000,
  facteurDeDispersion: 0.5,
} as const;

/**
 * LE COURT-CIRCUIT DU BACKOFF n'a pas de constante, et c'est un FAIT de la
 * bibliothèque plutôt qu'un choix : `Manager` n'expose aucun accesseur pour
 * remettre son compteur d'essais à zéro (`backoff.reset()` est privé). Ce qui
 * joue ce rôle est `socket.connect()`, qui ouvre IMMÉDIATEMENT sans consulter la
 * minuterie de reconnexion en attente — voir `lib/realtime/participate.ts`.
 * Écrire ici un `REPRISE_IMMEDIATE = { tentatives: 0 }` aurait nommé une
 * politique que personne ne peut appliquer.
 */
