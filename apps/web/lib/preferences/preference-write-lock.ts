/**
 * Ce contre quoi une relecture de préférences court.
 *
 * `updatePrivacy` et `updateEncryption` appliquent OPTIMISTEMENT au double
 * Zustand — celui que les bulles rendent — puis envoient. Entre les deux, la
 * valeur juste n'existe QUE localement : le serveur tient encore l'ancienne.
 *
 * > Une relecture qui gagne la course contre l'écriture locale qu'elle double
 * > ANNULE un geste de l'utilisateur : le serveur finit juste, l'écran finit
 * > revenu à l'ancienne valeur, et aucune annonce ne reste pour le défaire. Un
 * > réglage qui revient tout seul est PIRE qu'un réglage périmé (leçon 310).
 *
 * Les écritures se DÉCLARENT donc ici, et la relecture s'abstient tant qu'une
 * est en vol — un saut laisse au plus un bloc périmé jusqu'à la prochaine
 * annonce, ce qui est l'erreur réversible des deux.
 *
 * Un COMPTEUR, pas un drapeau : deux interrupteurs basculés coup sur coup se
 * chevauchent, et la fin de la première écriture ne prouve rien sur la seconde.
 */

let inFlight = 0;

/** Exécute une écriture de préférence en la déclarant en vol pour sa durée. */
export async function trackPreferenceWrite<T>(write: () => Promise<T>): Promise<T> {
  inFlight += 1;
  try {
    return await write();
  } finally {
    inFlight -= 1;
  }
}

/** `true` tant qu'au moins une écriture de préférence attend sa confirmation. */
export function isPreferenceWriteInFlight(): boolean {
  return inFlight > 0;
}
