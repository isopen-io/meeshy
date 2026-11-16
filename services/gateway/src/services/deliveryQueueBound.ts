/**
 * Ce que le PLAFOND d'une file de remise vient de DÉTRUIRE (#18733).
 *
 * `DELIVERY_QUEUE_MAX_PER_USER` (500, la tranche Redis) et
 * `MEMORY_QUEUE_MAX_PER_USER` (50, le repli mémoire) bornent la file hors
 * ligne par destinataire : au-delà, les arrivées les plus anciennes sont
 * détruites et leur rejeu n'aura jamais lieu. Trois issues nomment ce plafond
 * comme la cause d'un défaut visible par l'utilisateur — #18614, #18701,
 * #18707 — en insistant chacune sur le fait qu'il n'exige AUCUNE panne. Aucune
 * n'a pu dire à quelle fréquence il est franchi : tout le reste du chemin
 * d'enfilage se journalise (dédoublonnage, supplantation, repli, map pleine,
 * entrée informe) et l'éviction, seule, se taisait.
 *
 * **La mesure ne coûte aucune commande.** `RPUSH` et `LPUSH` rendent déjà la
 * longueur de la liste après leur poussée ; les deux scripts la font voyager
 * comme un SECOND élément de retour, jamais comme une quatrième valeur de code
 * — `1` doit continuer de vouloir dire « poussée », que la poussée ait détruit
 * une entrée ou non.
 *
 * **Et l'arithmétique vit ici, en TypeScript, pas en Lua.** C'est la seule
 * moitié du chemin Redis qu'un témoin de ce dépôt peut exercer : il n'existe
 * aucun double capable d'exécuter du Lua (le § du témoin de capacité de
 * `RedisDeliveryQueue.test.ts` le dit, et c'est pourquoi la tranche Redis ne
 * s'y atteste que par les arguments reçus et le texte du script). Le script
 * TRANSPORTE une longueur ; décider ce qu'elle implique est une décision, et
 * une décision se teste.
 */

const finiteOrNaN = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;

/** Le couple que les scripts bornés rendent : leur verdict, et la longueur de leur poussée. */
export type BoundedPushReply = {
  /**
   * Le premier retour du script, tel qu'il a toujours été : le code
   * d'enfilage (`0` dédoublonné, `1` poussé, `2` supplanté) ou, pour la
   * remise, le nombre d'entrées remises. `NaN` quand la forme rendue ne porte
   * aucun nombre — l'appelant le tient alors pour une poussée, comme avant ce
   * lot, ce qui ne perd qu'une trace de debug.
   */
  readonly outcome: number;
  /**
   * La longueur de la liste APRÈS la poussée de cet appel. `0` quand l'appel
   * n'a rien poussé (dédoublonnage), quand il n'a exécuté aucun `LTRIM`
   * (supplantation : il retire une entrée et en pousse une, la longueur ne
   * bouge pas) et quand la forme rendue ne la porte pas.
   *
   * `0` dit donc « je n'ai pas mesuré », jamais « la file est vide » — et
   * c'est ce qui empêche d'ANNONCER une éviction qu'on n'a pas observée. Tous
   * les doubles du dépôt rendent l'entier nu d'avant ce lot ; un lecteur qui
   * en déduirait une destruction publierait une perte imaginaire.
   */
  readonly lengthAfterPush: number;
};

export function readBoundedPushReply(raw: unknown): BoundedPushReply {
  if (Array.isArray(raw)) {
    const length = finiteOrNaN(raw[1]);
    return { outcome: finiteOrNaN(raw[0]), lengthAfterPush: Number.isFinite(length) && length > 0 ? length : 0 };
  }
  return { outcome: finiteOrNaN(raw), lengthAfterPush: 0 };
}

/**
 * Combien d'entrées le plafond vient de détruire — le dépassement, jamais la
 * longueur. Une longueur illisible ou absurde ne fabrique aucune perte : la
 * seule erreur inacceptable ici est d'annoncer une destruction qui n'a pas eu
 * lieu, puisque c'est ce chiffre qui servira un jour à instruire la valeur du
 * plafond lui-même.
 */
export function destroyedAtBound(lengthAfterPush: number, cap: number): number {
  if (!Number.isFinite(lengthAfterPush) || !Number.isFinite(cap)) return 0;
  return lengthAfterPush > cap ? lengthAfterPush - cap : 0;
}
