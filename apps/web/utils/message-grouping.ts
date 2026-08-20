/**
 * Regroupement des bulles consécutives d'un même auteur.
 *
 * Une bulle n'affiche avatar, nom et horodatage que si elle OUVRE un groupe.
 * Comparer les seuls `sender.id` ne suffit pas : un message système porte
 * l'identifiant de la personne qu'il concerne — l'avis d'arrivée est écrit avec
 * l'arrivant pour auteur (`packages/shared/utils/join-notice.ts`). La première
 * vraie bulle du nouveau venu se retrouvait donc groupée avec l'annonce de sa
 * propre arrivée, et perdait ses trois marqueurs d'identité d'un coup.
 *
 * Un message système n'est pas une prise de parole : il forme toujours son
 * propre groupe, et ne continue jamais celui d'un voisin.
 */

export type GroupableMessage = {
  readonly sender?: { readonly id?: string } | null;
  readonly messageSource?: string | null;
};

const estSysteme = (message: GroupableMessage): boolean =>
  message.messageSource === 'system';

/**
 * Deux auteurs sont la même personne uniquement si l'un et l'autre sont
 * identifiés : deux expéditeurs inconnus ne se regroupent pas.
 */
const memeAuteur = (a: GroupableMessage, b: GroupableMessage): boolean => {
  const idA = a.sender?.id;
  const idB = b.sender?.id;
  return Boolean(idA) && idA === idB;
};

const continuent = (
  voisin: GroupableMessage | null | undefined,
  message: GroupableMessage
): boolean =>
  Boolean(voisin) &&
  !estSysteme(message) &&
  !estSysteme(voisin as GroupableMessage) &&
  memeAuteur(voisin as GroupableMessage, message);

/** La bulle ouvre-t-elle un groupe ? Elle porte alors avatar, nom et heure. */
export const isFirstInGroup = (
  precedent: GroupableMessage | null | undefined,
  message: GroupableMessage
): boolean => !continuent(precedent, message);

/** La bulle ferme-t-elle un groupe ? */
export const isLastInGroup = (
  suivant: GroupableMessage | null | undefined,
  message: GroupableMessage
): boolean => !continuent(suivant, message);
