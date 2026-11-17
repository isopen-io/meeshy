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
 * Les portes qui font REVENIR un membre parti — « restaurer pour moi »,
 * lever un bannissement — ont leur jumelle, `returningMemberRefusal` : seul un
 * tête-à-tête chiffré de bout en bout s'y ferme, à quiconque n'était pas de sa
 * paire quand le chiffrement s'est activé (audit de #19080, E1). La règle de la
 * paire (#12966) ne compte que les membres ACTIFS : un ancien troisième membre
 * « supprimé pour lui » ou banni n'empêchait pas l'activation, et revenait
 * ensuite par ces portes.
 *
 * Le régime est un paramètre REQUIS : une porte ne peut pas oublier de le lire.
 */
import { E2EE_DIRECT_STAYS_A_PAIR_MESSAGE, E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import {
  conversationAdmitsNewMembers,
  EXTERNAL_CONVERSATION_ERROR_CODES,
  EXTERNAL_SINGLE_MEMBER_MESSAGE,
} from '@meeshy/shared/types/external-conversation';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
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
  if (isEndToEndDirect(conversation)) return DIRECT_STAYS_A_PAIR;
  return null;
}

const DIRECT_STAYS_A_PAIR: NewMemberRefusal = { code: E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR, message: E2EE_DIRECT_STAYS_A_PAIR_MESSAGE };

const isEndToEndDirect = (conversation: { readonly type: string | null | undefined; readonly encryptionMode: string | null | undefined }): boolean =>
  conversation.type === 'direct' && isEndToEndMode(conversation.encryptionMode);

export type ReturningConversation = {
  readonly type: string | null | undefined;
  readonly encryptionMode: string | null | undefined;
  readonly encryptionEnabledAt: Date | null | undefined;
};

/**
 * Un membre parti REVIENT-il ? Hors tête-à-tête chiffré de bout en bout, oui :
 * il était membre, il le redevient. Dans un tête-à-tête chiffré, seulement s'il
 * était de la PAIRE à l'activation — il est parti APRÈS elle (`leftAt`) — et si
 * la conversation reste à deux (`memberUserIds` : les membres actifs, lui
 * compris). Un départ sans date, un invité sans compte : jamais (fail-closed).
 * Sans date d'activation (anomalie), seule la taille de la paire décide.
 */
export function returningMemberRefusal(params: {
  readonly conversation: ReturningConversation;
  readonly returningUserId: string | null | undefined;
  readonly leftAt: Date | null | undefined;
  readonly memberUserIds: readonly (string | null | undefined)[];
}): NewMemberRefusal | null {
  const { conversation, returningUserId, leftAt } = params;
  if (!isEndToEndDirect(conversation)) return null;
  if (!returningUserId || !leftAt) return DIRECT_STAYS_A_PAIR;
  const enabledAt = conversation.encryptionEnabledAt;
  const leftWhilePaired = !enabledAt || leftAt.getTime() >= enabledAt.getTime();
  const members = new Set([...params.memberUserIds.filter((id): id is string => typeof id === 'string' && id !== ''), returningUserId]);
  return leftWhilePaired && members.size <= 2 ? null : DIRECT_STAYS_A_PAIR;
}

/**
 * `returningMemberRefusal`, avec la lecture qu'elle demande : les membres actifs
 * de la conversation, lus seulement pour un tête-à-tête chiffré de bout en bout.
 * La conversation est une relation REQUISE de `Participant` (Prisma lève si elle
 * manque) ; son absence ne se lit que d'un double partiel, jamais comme e2ee.
 */
export async function returningMemberRefusalFor(
  prisma: Pick<PrismaClient, 'participant'>,
  params: {
    readonly conversationId: string;
    readonly conversation: ReturningConversation | null | undefined;
    readonly returningUserId: string | null | undefined;
    readonly leftAt: Date | null | undefined;
  },
): Promise<NewMemberRefusal | null> {
  const { conversation } = params;
  if (!conversation || !isEndToEndDirect(conversation)) return null;
  const active = await prisma.participant.findMany({
    where: { conversationId: params.conversationId, isActive: true },
    select: { userId: true },
  });
  return returningMemberRefusal({ ...params, conversation, memberUserIds: active.map((row) => row.userId) });
}
