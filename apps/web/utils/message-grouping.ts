/**
 * Regroupement des bulles consécutives d'un même auteur.
 *
 * Une bulle n'affiche avatar, nom et horodatage que si elle OUVRE un groupe.
 * Trois conditions décident la continuité — miroir mot pour mot de la règle
 * canonique iOS (`MessageDayGrouping.continues`) et de la Rivière partagée
 * (`packages/shared/utils/river-lanes.ts` → `continues`) : **toute évolution
 * touche les trois** :
 *
 * 1. Aucun des deux n'est un message SYSTÈME — un avis n'est pas une prise de
 *    parole ; il forme toujours son propre groupe. Comparer les seuls
 *    `sender.id` ne suffit pas : l'avis d'arrivée est écrit avec l'arrivant
 *    pour auteur (`packages/shared/utils/join-notice.ts`), donc la première
 *    vraie bulle du nouveau venu se retrouvait groupée avec l'annonce de sa
 *    propre arrivée et perdait ses trois marqueurs d'identité d'un coup.
 * 2. Même auteur identifié — deux expéditeurs inconnus ne se regroupent pas.
 * 3. Même JOUR calendaire local — deux messages d'un même auteur à cheval sur
 *    minuit ouvrent deux groupes. Sans ce test, la première bulle sous une
 *    capsule de date (`FocalThread`) masquait avatar, nom et heure : elle
 *    paraissait collée au groupe de la veille. Le jour est mesuré par
 *    `startOfLocalDayMs`, la MÊME fonction DST-safe que la capsule de date, pour
 *    que capsule et en-tête d'identité s'accordent toujours.
 */

import { startOfLocalDayMs } from '@meeshy/shared/utils/calendar-date';

export type GroupableMessage = {
  readonly sender?: { readonly id?: string } | null;
  readonly messageSource?: string | null;
  readonly createdAt: string | number | Date;
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

const memeJour = (a: GroupableMessage, b: GroupableMessage): boolean =>
  startOfLocalDayMs(new Date(a.createdAt).getTime()) ===
  startOfLocalDayMs(new Date(b.createdAt).getTime());

const continuent = (
  voisin: GroupableMessage | null | undefined,
  message: GroupableMessage
): boolean =>
  Boolean(voisin) &&
  !estSysteme(message) &&
  !estSysteme(voisin as GroupableMessage) &&
  memeAuteur(voisin as GroupableMessage, message) &&
  memeJour(voisin as GroupableMessage, message);

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
