/**
 * « Est-il encore absent ? » — la question posée AU MOMENT DE LIVRER, et non
 * plus seulement au moment de choisir.
 *
 * Une action peut attendre jusqu'à 360 minutes en file (`maxDelayMinutes`). La
 * sélection l'a jugée légitime il y a six heures ; entre-temps la personne a pu
 * revenir. Livrer sans redemander, c'est parler à sa place PENDANT qu'elle est
 * là — le défaut le plus visible qu'un agent puisse produire, et celui qu'aucune
 * garde ne retenait : `deliver()` ne vérifiait que l'activité de la
 * CONVERSATION, jamais la présence de la personne empruntée (#5703).
 *
 * `derniereConnexionMs` est l'horloge de CONNEXION — `UserSession.lastActivityAt`
 * sur une session vivante — jamais `User.lastActiveAt` : cette dernière est
 * écrite par une socket qui se rouvre toute seule, et déclare présents des gens
 * absents depuis des mois (#5712).
 *
 * `null` ⇒ aucune session vivante : la personne ne s'est pas connectée sur la
 * période retenue, donc elle est bien absente.
 */
export function peutEncoreParler(etat: {
  readonly isOnline: boolean;
  readonly derniereConnexionMs: number | null;
  readonly seuilHeures: number;
  readonly maintenantMs: number;
}): boolean {
  // En ligne MAINTENANT : aucune ancienneté de connexion ne rachète ça.
  if (etat.isOnline) return false;
  if (etat.derniereConnexionMs === null) return true;
  return etat.derniereConnexionMs < etat.maintenantMs - etat.seuilHeures * 3_600_000;
}
