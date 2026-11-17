/**
 * QUI PEUT ENCORE ENTRER DANS UNE CONVERSATION EXISTANTE — la loi UNIQUE des
 * portes qui y font entrer quelqu'un : ajout de participant, invitation,
 * jonction par lien, création d'un lien, rattachement à une communauté.
 *
 * Deux conversations n'admettent aucun nouveau membre :
 * - une conversation EXTERNE (#17117) : un seul membre Meeshy, son ouvreur ;
 * - un tête-à-tête CHIFFRÉ DE BOUT EN BOUT (#16188, constat GW-10 de la revue
 *   du 2026-11-17, #18906) : un tiers y deviendrait un membre dont Sesame exige
 *   les appareils, alors que le scelleur d'un tête-à-tête ne chiffre que pour
 *   son correspondant. Chaque envoi échouerait en `missing` à jamais, et le
 *   chiffrement ne se désactive pas (#12949). Pour écrire à plusieurs, on crée
 *   un groupe. Un tête-à-tête en clair reste ouvert : l'y fermer serait une
 *   décision produit.
 *
 * Le régime est un paramètre REQUIS : une porte ne peut pas oublier de le lire.
 */
import { E2EE_DIRECT_STAYS_A_PAIR_MESSAGE, E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import {
  conversationAdmitsNewMembers,
  EXTERNAL_CONVERSATION_ERROR_CODES,
  EXTERNAL_SINGLE_MEMBER_MESSAGE,
} from '@meeshy/shared/types/external-conversation';
import { isEndToEndMode } from '../messaging/e2eePlaintextAdmission';

export type NewMemberRefusalCode = typeof EXTERNAL_CONVERSATION_ERROR_CODES.SINGLE_MEMBER | typeof E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR;

/** Pourquoi personne n'entre plus : un code stable et la phrase qu'un ancien client affiche (#9223). Servi en 409. */
export type NewMemberRefusal = { readonly code: NewMemberRefusalCode; readonly message: string };

export function newMemberRefusal(conversation: {
  readonly type: string | null | undefined;
  readonly encryptionMode: string | null | undefined;
}): NewMemberRefusal | null {
  if (!conversationAdmitsNewMembers(conversation.type)) {
    return { code: EXTERNAL_CONVERSATION_ERROR_CODES.SINGLE_MEMBER, message: EXTERNAL_SINGLE_MEMBER_MESSAGE };
  }
  if (conversation.type === 'direct' && isEndToEndMode(conversation.encryptionMode)) {
    return { code: E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR, message: E2EE_DIRECT_STAYS_A_PAIR_MESSAGE };
  }
  return null;
}
