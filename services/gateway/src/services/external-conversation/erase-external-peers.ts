/**
 * #17117 — l'effacement RGPD des adresses de pair (le numéro E.164 de l'ami
 * d'un réseau tiers) qu'un compte avait ouvertes. Appelé par la purge d'un
 * compte supprimé (`purgeAccountIsolatedData`) : le numéro n'était gardé que
 * pour CE compte (exception bornée à #9225) ; lui effacé, il ne sert plus
 * personne et n'attend pas son échéance de conservation. La conversation
 * reste (elle suit la purge des conversations), son adresse non.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EXTERNAL_CONVERSATION_TYPE } from '@meeshy/shared/types/external-conversation';

export async function eraseExternalPeerHandlesOpenedBy(
  prisma: Pick<PrismaClient, 'externalConversationPeer'>,
  userId: string,
): Promise<number> {
  const { count } = await prisma.externalConversationPeer.deleteMany({ where: { openedByUserId: userId } });
  return count;
}

/**
 * #17117 — fermer une conversation externe efface l'adresse de l'ami : le
 * numéro n'était gardé que pour ce fil, et ne lui survit pas (audit
 * adversarial du 2026-11-10). Appelé par CHAQUE site de clôture, à côté de
 * `deactivateShareLinksOnClose` (balayage `external-conversation-doors-sweep.test.ts`).
 *
 * Sans effet, et sans aucune lecture, pour tout autre type : rien ne change
 * pour une conversation Meeshy-Meeshy. Appelé APRÈS la transaction de clôture
 * (le type n'est connu qu'une fois la ligne relue) : si cet effacement échoue,
 * la réouverture traite le fil clos comme une absence et efface l'adresse, et
 * l'index TTL la retire à l'échéance.
 */
/** Ce qu'un site de clôture remet à `eraseExternalPeerOnClose` : le seul délégué de l'adresse. */
export type ExternalPeerEraser = Pick<PrismaClient, 'externalConversationPeer'>;

export async function eraseExternalPeerOnClose(
  prisma: ExternalPeerEraser,
  conversation: { readonly id: string; readonly type?: string | null },
): Promise<number> {
  if (conversation.type !== EXTERNAL_CONVERSATION_TYPE) return 0;
  const { count } = await prisma.externalConversationPeer.deleteMany({ where: { conversationId: conversation.id } });
  return count;
}
